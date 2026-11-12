import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRunner,
  nth,
  op,
  waitOp,
  type Effect,
  type Runner,
  type RunnerView,
  type Sketch,
} from '../../src/lib/workbench/simulator';

interface Echo {
  passes: number;
  last: string | undefined;
}

const PASS = 'pass();';
const CHECK = 'if (Serial.available()) {';
const READ = "last = Serial.readStringUntil('\\n');";
const PRINT = 'Serial.println(passes);';
const WAIT = 'delay(1000);';

/** A test sketch: counts passes, reads one queued line per pass at READ, prints the count, then waits 1000 ms. */
const echo: Sketch<Echo> = {
  init: () => ({ passes: 0, last: undefined }),
  *program(board) {
    const s = board.state;
    for (;;) {
      yield op(
        PASS,
        () => s.passes++,
        () => (board.pace() === 'run' ? 25 : 250),
      );
      yield op(CHECK);
      if (board.available()) yield op(READ, () => (s.last = board.read()));
      yield op(PRINT, () => board.print(String(s.passes)));
      yield waitOp(WAIT, 1000);
    }
  },
};

interface Recorded<S> {
  views: RunnerView<S>[];
  effects: Effect[];
  lines(): (string | undefined)[];
}

function record<S>(runner: Runner<S>): Recorded<S> {
  const views: RunnerView<S>[] = [];
  const effects: Effect[] = [];
  runner.subscribe((view, happened) => {
    views.push(view);
    effects.push(...happened);
  });
  return { views, effects, lines: () => views.map((view) => view.line) };
}

describe('simulator runner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts paused at the first line with fresh state and no timer', () => {
    const runner = createRunner(echo);
    const view = runner.view();
    expect(view).toMatchObject({ status: 'paused', slow: false, pace: 'step', line: PASS, millis: 0, output: [] });
    expect(view.state).toEqual({ passes: 0, last: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('steps through the lines in order, running each effect and advancing the clock by its cost', () => {
    const runner = createRunner(echo);
    const seen = record(runner);
    for (let i = 0; i < 5; i++) runner.step();

    expect(seen.lines()).toEqual([CHECK, PRINT, WAIT, PASS, CHECK]);
    expect(runner.view().state.passes).toBe(2);
    expect(runner.view().output).toEqual([{ text: '1' }]);
    expect(seen.effects).toEqual([{ kind: 'print', text: '1' }]);
    // Stepping prices the pass at 250, and the wait adds its 1000 at once.
    expect(seen.views.map((view) => view.millis)).toEqual([250, 250, 250, 1250, 1500]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('steps over a waiting line with no real wait', () => {
    const runner = createRunner(echo);
    runner.step();
    runner.step();
    runner.step();
    expect(runner.view()).toMatchObject({ line: WAIT, wait: true, millis: 250 });

    const before = Date.now();
    runner.step();
    expect(Date.now()).toBe(before);
    expect(runner.view()).toMatchObject({ line: PASS, wait: false, millis: 1250 });
  });

  it('runs in real time, each line lasting its cost and a line of no cost at once', () => {
    const runner = createRunner(echo);
    const seen = record(runner);
    runner.run();
    expect(runner.view().pace).toBe('run');

    vi.advanceTimersByTime(24);
    expect(runner.view().line).toBe(PASS);
    vi.advanceTimersByTime(1);
    expect(runner.view()).toMatchObject({ line: WAIT, millis: 25 });

    vi.advanceTimersByTime(999);
    expect(runner.view().line).toBe(WAIT);
    vi.advanceTimersByTime(1);
    expect(runner.view()).toMatchObject({ line: PASS, millis: 1025 });
    expect(seen.effects).toEqual([{ kind: 'print', text: '1' }]);
    expect(seen.lines()).toEqual([PASS, CHECK, PRINT, WAIT, PASS]);
    runner.dispose();
  });

  it('pauses at once, keeps the elapsed part of a wait, and continues with the rest', () => {
    const runner = createRunner(echo);
    runner.run();
    vi.advanceTimersByTime(25);
    expect(runner.view().line).toBe(WAIT);

    vi.advanceTimersByTime(400);
    runner.pause();
    expect(runner.view()).toMatchObject({ status: 'paused', line: WAIT, millis: 25 });
    expect(runner.progress()).toBeCloseTo(0.4);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(runner.view()).toMatchObject({ line: WAIT, millis: 25 });

    runner.run();
    vi.advanceTimersByTime(599);
    expect(runner.view().line).toBe(WAIT);
    vi.advanceTimersByTime(1);
    expect(runner.view()).toMatchObject({ status: 'running', line: PASS, millis: 1025 });
    runner.dispose();
  });

  it('reports how much of a waiting line has elapsed', () => {
    const runner = createRunner(echo);
    runner.run();
    vi.advanceTimersByTime(25);
    expect(runner.progress()).toBe(0);
    vi.advanceTimersByTime(250);
    expect(runner.progress()).toBeCloseTo(0.25);
    vi.advanceTimersByTime(500);
    expect(runner.progress()).toBeCloseTo(0.75);
    expect(runner.view().duration).toBe(1000);
    runner.dispose();
  });

  it('tells the simulated cost of the line about to run apart from the real time it lasts', () => {
    const runner = createRunner(echo, { slow: true });
    expect(runner.view()).toMatchObject({ line: PASS, cost: 250, duration: 500 });
    runner.step();
    expect(runner.view()).toMatchObject({ line: CHECK, cost: 0 });
    runner.dispose();
  });

  it('has a cost of 0 once the program ended', () => {
    const runner = createRunner<null>({ init: () => null, *program() { yield waitOp(WAIT, 1000); } });
    expect(runner.view().cost).toBe(1000);
    runner.step();
    expect(runner.view()).toMatchObject({ status: 'ended', cost: 0, duration: 0 });
    runner.dispose();
  });

  it('has a cost of 0 and stops in error when the cost of the line about to run throws', () => {
    const runner = createRunner<null>({
      init: () => null,
      *program() {
        yield op(PASS, undefined, () => {
          throw new Error('no clock');
        });
      },
    });
    const view = runner.view();
    expect(view).toMatchObject({ status: 'error', cost: 0, duration: 0, line: PASS });
    expect((view.error as Error).message).toBe('no clock');
    runner.dispose();
  });

  it('makes each line last at least 500 ms in slow mode, and a wait its full length', () => {
    const runner = createRunner(echo, { slow: true });
    runner.run();
    expect(runner.view()).toMatchObject({ pace: 'slow', duration: 500 });

    vi.advanceTimersByTime(499);
    expect(runner.view().line).toBe(PASS);
    vi.advanceTimersByTime(1);
    expect(runner.view()).toMatchObject({ line: CHECK, millis: 250 });

    vi.advanceTimersByTime(1000);
    expect(runner.view()).toMatchObject({ line: WAIT, duration: 1000 });
    vi.advanceTimersByTime(999);
    expect(runner.view().line).toBe(WAIT);
    vi.advanceTimersByTime(1);
    expect(runner.view()).toMatchObject({ line: PASS, millis: 1250 });
    runner.dispose();
  });

  it('switches slow mode on a line under way, keeping the time it spent', () => {
    const runner = createRunner(echo);
    runner.run();
    vi.advanceTimersByTime(10);
    runner.setSlow(true);
    vi.advanceTimersByTime(489);
    expect(runner.view().line).toBe(PASS);
    vi.advanceTimersByTime(1);
    expect(runner.view().line).toBe(CHECK);
    runner.dispose();
  });

  it('reads a sent line only when the program reaches its read line', () => {
    const runner = createRunner(echo);
    const seen = record(runner);
    const id = runner.send('hello');

    expect(runner.view().queued).toEqual([{ id, text: 'hello' }]);
    expect(runner.view().output).toEqual([{ text: 'hello', sent: id }]);
    expect(seen.effects).toEqual([{ kind: 'sent', line: { id, text: 'hello' } }]);

    runner.step();
    expect(runner.view().line).toBe(CHECK);
    expect(runner.view().queued).toHaveLength(1);
    runner.step();
    expect(runner.view().line).toBe(READ);
    expect(runner.view().state.last).toBeUndefined();

    runner.step();
    expect(runner.view().state.last).toBe('hello');
    expect(runner.view().queued).toEqual([]);
    expect(seen.effects.at(-1)).toEqual({ kind: 'read', line: { id, text: 'hello' } });

    // With nothing queued, the next pass skips the read line.
    runner.step();
    runner.step();
    runner.step();
    runner.step();
    expect(runner.view().line).toBe(PRINT);
  });

  it('restarts from the first line with fresh state, clock 0, no output and nothing queued', () => {
    const runner = createRunner(echo);
    runner.send('left over');
    for (let i = 0; i < 6; i++) runner.step();
    runner.send('queued');
    expect(runner.view().state.passes).toBe(2);

    runner.restart();
    expect(runner.view()).toMatchObject({ status: 'paused', line: PASS, millis: 0, output: [], queued: [] });
    expect(runner.view().state).toEqual({ passes: 0, last: undefined });

    runner.step();
    expect(runner.view()).toMatchObject({ line: CHECK, millis: 250 });
    expect(runner.view().state.passes).toBe(1);
  });

  it('keeps running across a restart, with the old line timer gone', () => {
    const runner = createRunner(echo);
    runner.run();
    vi.advanceTimersByTime(500);
    runner.restart();
    expect(runner.view()).toMatchObject({ status: 'running', line: PASS, millis: 0 });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(25);
    expect(runner.view()).toMatchObject({ line: WAIT, millis: 25 });
    runner.dispose();
  });

  it('pauses a running program when stepping', () => {
    const runner = createRunner(echo);
    runner.run();
    runner.step();
    expect(runner.view()).toMatchObject({ status: 'paused', line: CHECK });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer and calls no listener after dispose', () => {
    const runner = createRunner(echo);
    const listener = vi.fn();
    runner.subscribe(listener);
    runner.run();
    runner.dispose();
    expect(vi.getTimerCount()).toBe(0);

    runner.run();
    runner.step();
    runner.send('x');
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ends when the program returns', () => {
    const once: Sketch<null> = {
      init: () => null,
      *program() {
        yield op('setup();');
      },
    };
    const runner = createRunner(once);
    runner.run();
    vi.advanceTimersByTime(0);
    expect(runner.view()).toMatchObject({ status: 'ended', line: undefined });
    expect(vi.getTimerCount()).toBe(0);

    runner.restart();
    expect(runner.view()).toMatchObject({ status: 'paused', line: 'setup();' });
  });

  it('stops for good when a listener disposes it while running', () => {
    const runner = createRunner(echo);
    let lines = 0;
    runner.subscribe((view) => {
      if (view.line === CHECK) runner.dispose();
      lines++;
    });
    runner.run();
    vi.advanceTimersByTime(25);
    expect(runner.view().status).toBe('disposed');
    const seen = lines;
    vi.advanceTimersByTime(10_000);
    expect(lines).toBe(seen);
    expect(runner.view().line).toBe(CHECK);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops in error when the program throws, with no next line, until a restart', () => {
    let throws = true;
    const broken: Sketch<null> = {
      init: () => null,
      *program() {
        yield op('first();', undefined, 10);
        if (throws) throw new Error('bad program');
        yield op('second();');
      },
    };
    const runner = createRunner(broken);
    runner.run();
    vi.advanceTimersByTime(10);
    expect(runner.view()).toMatchObject({ status: 'error', line: undefined, millis: 10 });
    expect((runner.view().error as Error).message).toBe('bad program');
    expect(vi.getTimerCount()).toBe(0);

    runner.run();
    runner.step();
    expect(runner.view().status).toBe('error');

    throws = false;
    runner.restart();
    expect(runner.view()).toMatchObject({ status: 'paused', line: 'first();', millis: 0 });
    expect(runner.view().error).toBeUndefined();
  });

  it('stops in error, rather than throwing, when the sketch cannot start on a restart, until a restart that works', () => {
    let throws = false;
    const fragile: Sketch<null> = {
      init: () => {
        if (throws) throw new Error('bad init');
        return null;
      },
      *program() {
        for (;;) yield op('loop();', undefined, 10);
      },
    };
    const runner = createRunner(fragile);
    runner.run();
    throws = true;

    expect(() => runner.restart()).not.toThrow();
    expect(runner.view()).toMatchObject({ status: 'error', line: undefined, cost: 0, duration: 0 });
    expect((runner.view().error as Error).message).toBe('bad init');
    expect(vi.getTimerCount()).toBe(0);

    throws = false;
    runner.restart();
    expect(runner.view()).toMatchObject({ status: 'paused', line: 'loop();' });
    runner.dispose();
  });

  it('prices a line when it comes up and when the pace changes, never when the page reads the view', () => {
    let priced = 0;
    const counted: Sketch<null> = {
      init: () => null,
      *program(board) {
        for (;;) yield op('loop();', undefined, () => (priced++, board.pace() === 'run' ? 10 : 100));
      },
    };
    const runner = createRunner(counted);
    const before = priced;
    for (let i = 0; i < 5; i++) {
      runner.view();
      runner.progress();
    }
    expect(priced).toBe(before);

    runner.run();
    expect(runner.view()).toMatchObject({ pace: 'run', cost: 10 });
    runner.pause();
    expect(runner.view()).toMatchObject({ pace: 'step', cost: 100 });
    runner.dispose();
  });

  it('stops in error on a line whose effect throws, its cost not on the clock', () => {
    const broken: Sketch<null> = {
      init: () => null,
      *program(board) {
        yield op('setup();', undefined, 100);
        yield op(
          'fail();',
          () => {
            board.print('before');
            throw new Error('bad effect');
          },
          50,
        );
      },
    };
    const runner = createRunner(broken);
    const seen = record(runner);
    runner.step();
    runner.step();
    expect(runner.view()).toMatchObject({ status: 'error', line: 'fail();', millis: 100 });
    expect((runner.view().error as Error).message).toBe('bad effect');
    expect(runner.view().output).toEqual([{ text: 'before' }]);
    expect(seen.effects).toEqual([{ kind: 'print', text: 'before' }]);

    runner.step();
    expect(runner.view().millis).toBe(100);
  });

  it('reports which occurrence of a repeated line is about to run', () => {
    const twice: Sketch<null> = {
      init: () => null,
      *program() {
        for (;;) {
          yield waitOp('delay(wait);', 10);
          yield waitOp(nth('delay(wait);', 2), 10);
        }
      },
    };
    const runner = createRunner(twice);
    expect(runner.view()).toMatchObject({ line: 'delay(wait);', occurrence: 1 });
    runner.step();
    expect(runner.view()).toMatchObject({ line: 'delay(wait);', occurrence: 2 });
  });

  it('lets the page handle its events after 1000 lines of no cost in a row, and pauses there', () => {
    const spin: Sketch<{ lines: number }> = {
      init: () => ({ lines: 0 }),
      *program(board) {
        for (;;) yield op('spin();', () => board.state.lines++);
      },
    };
    const runner = createRunner(spin);
    runner.run();
    vi.advanceTimersToNextTimer();
    expect(runner.view().state.lines).toBe(1001);
    expect(vi.getTimerCount()).toBe(1);

    runner.pause();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(runner.view().state.lines).toBe(1001);
  });

  it('takes real time from an injected clock', () => {
    let now = 0;
    const pending: (() => void)[] = [];
    const runner = createRunner(echo, {
      clock: {
        now: () => now,
        setTimeout: (callback) => pending.push(callback),
        clearTimeout: () => {},
      },
    });
    runner.run();
    now = 10;
    expect(runner.progress()).toBeCloseTo(10 / 25);
    pending.shift()!();
    expect(runner.view().line).toBe(WAIT);
    expect(vi.getTimerCount()).toBe(0);
  });
});
