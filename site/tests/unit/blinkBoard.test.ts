import { describe, expect, it } from 'vitest';
import {
  applyBlinkEvent,
  blinkBoard,
  blinkWatch,
  followBlink,
  initialBlinkBoard,
  measuredInterval,
  simulateBlink,
  type BlinkBoard,
} from '../../src/lib/workbench/blinkBoard';
import { createRunner } from '../../src/lib/workbench/simulator';
import { blinkInput, LED_PIN, type BlinkEvent, type BlinkState } from '../../src/lib/workbench/steps/blink';

function after(events: readonly [BlinkEvent, number][], board: BlinkBoard = initialBlinkBoard()): BlinkBoard {
  return events.reduce((state, [event, at]) => applyBlinkEvent(state, event, at), board);
}

const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

describe('applyBlinkEvent', () => {
  it('starts with the LED off, a wait of 1000 ms, not paused and nothing measured', () => {
    const board = initialBlinkBoard();
    expect(board).toEqual({ ledOn: false, wait: 1000, paused: false, changes: [] });
    expect(measuredInterval(board)).toBeUndefined();
  });

  it('sets the LED from HIGH and LOW and measures the time between the last two changes', () => {
    const board = after([
      [{ kind: 'high' }, 10],
      [{ kind: 'low' }, 1010],
      [{ kind: 'high' }, 1510],
    ]);
    expect(board.ledOn).toBe(true);
    expect(measuredInterval(board)).toBe(500);
  });

  it('does not time a line that repeats the level the LED already has', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'low' }, 1000],
      [{ kind: 'low' }, 1500],
    ]);
    expect(measuredInterval(board)).toBe(1000);
  });

  it('takes the wait from a delay line and the pause from paused and running', () => {
    expect(after([[{ kind: 'delay', ms: 300 }, 0]]).wait).toBe(300);
    expect(after([[{ kind: 'paused' }, 0]]).paused).toBe(true);
    expect(
      after([
        [{ kind: 'paused' }, 0],
        [{ kind: 'running' }, 5],
      ]).paused,
    ).toBe(false);
  });

  it('starts over when the board prints its sketch line', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'delay', ms: 300 }, 5],
      [{ kind: 'sketch', key: 'blink/input' }, 9],
    ]);
    expect(board).toEqual(initialBlinkBoard());
  });
});

describe('blinkWatch', () => {
  it('shows LED, wait and measured on every step, millis() on timer and commands, paused on commands', () => {
    const board = initialBlinkBoard();
    expect(names(blinkWatch('blink/simple', board, 0))).toEqual(['LED', 'wait', 'measured']);
    expect(names(blinkWatch('blink/input', board, 0))).toEqual(['LED', 'wait', 'measured']);
    expect(names(blinkWatch('blink/timer', board, 0))).toEqual(['LED', 'wait', 'measured', 'millis()']);
    expect(names(blinkWatch('blink/commands', board, 0))).toEqual(['LED', 'wait', 'measured', 'millis()', 'paused']);
  });

  it('writes each value as the panel shows it', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'low' }, 1000],
      [{ kind: 'delay', ms: 300 }, 1000],
      [{ kind: 'paused' }, 1000],
    ]);
    expect(blinkWatch('blink/commands', board, 1234)).toEqual([
      { name: 'LED', value: 'LOW' },
      { name: 'wait', value: '300 ms' },
      { name: 'measured', value: '1000 ms' },
      { name: 'millis()', value: '1234' },
      { name: 'paused', value: 'true' },
    ]);
  });

  it('marks the written-in wait of simple as fixed, and an unknown measure or clock with an ellipsis', () => {
    const rows = blinkWatch('blink/timer', initialBlinkBoard(), undefined);
    expect(rows).toContainEqual({ name: 'measured', value: '…' });
    expect(rows).toContainEqual({ name: 'millis()', value: '…' });
    expect(blinkWatch('blink/simple', initialBlinkBoard(), 0)).toContainEqual({ name: 'wait', value: '1000 ms (fixed)' });
  });
});

describe('simulateBlink', () => {
  const state = (changes: Partial<BlinkState> = {}): BlinkState => ({
    ledOn: false,
    blinkDelay: 1000,
    paused: false,
    lastToggle: 0,
    ...changes,
  });

  it('follows pin writes for the LED and times them in simulated ms', () => {
    let board = simulateBlink(initialBlinkBoard(), state(), [{ kind: 'write', pin: LED_PIN, high: true }], 0);
    board = simulateBlink(board, state(), [{ kind: 'write', pin: LED_PIN, high: false }], 700);
    expect(board.ledOn).toBe(false);
    expect(measuredInterval(board)).toBe(700);
  });

  it('ignores a print of HIGH and a write to another pin', () => {
    const board = simulateBlink(
      initialBlinkBoard(),
      state(),
      [
        { kind: 'print', text: 'HIGH' },
        { kind: 'write', pin: LED_PIN + 1, high: true },
      ],
      0,
    );
    expect(board).toEqual(initialBlinkBoard());
  });

  it('takes wait and paused from the sketch variables, and keeps the board when nothing changed', () => {
    const board = initialBlinkBoard();
    expect(simulateBlink(board, state(), [], 5)).toBe(board);
    expect(simulateBlink(board, state({ blinkDelay: 300, paused: true }), [], 5)).toMatchObject({
      wait: 300,
      paused: true,
    });
  });

  it('changes wait only when the blinkDelay line of the running sketch runs', () => {
    const runner = createRunner(blinkInput.program);
    let board = initialBlinkBoard();
    const waits: string[] = [];
    runner.subscribe((view, effects) => {
      board = simulateBlink(board, view.state, effects, view.millis);
    });
    runner.send('300');
    for (let i = 0; i < 12; i++) {
      const line = runner.view().line;
      runner.step();
      waits.push(`${line} ${board.wait}`);
    }
    runner.dispose();
    const assignment = waits.findIndex((entry) => entry.startsWith('blinkDelay = '));
    expect(waits[assignment - 1]).toMatch(/ 1000$/);
    expect(waits[assignment]).toBe('blinkDelay = constrain(line.toInt(), 100, 2000); 300');
  });
});

describe('followBlink', () => {
  it('knows the interval only on simple, and whether it is paused only where nothing pauses', () => {
    expect(followBlink('blink/simple')).toEqual({ ...initialBlinkBoard(), wait: 1000, paused: false });
    expect(followBlink('blink/input')).toEqual({ ...initialBlinkBoard(), wait: undefined, paused: false });
    expect(followBlink('blink/commands')).toEqual({ ...initialBlinkBoard(), wait: undefined, paused: undefined });
  });

  it('keeps the interval and the pause it knew, but not the LED, which changed meanwhile', () => {
    const known = { ledOn: true, wait: 500, paused: true, changes: [1, 2] };
    expect(followBlink('blink/commands', known)).toEqual({ ledOn: false, wait: 500, paused: true, changes: [] });
  });

  it('shows what it does not know as …', () => {
    expect(blinkWatch('blink/commands', followBlink('blink/commands'), undefined).map((row) => row.value)).toEqual([
      'LOW',
      '…',
      '…',
      '…',
      '…',
    ]);
    expect(blinkBoard.variable(followBlink('blink/input'), 'blinkDelay')).toBeUndefined();
  });
});

describe('the variable a real board tells', () => {
  it('is blinkDelay, from the interval the board last announced', () => {
    expect(blinkBoard.variable(initialBlinkBoard(), 'blinkDelay')).toBe('1000');
    expect(blinkBoard.variable(after([[{ kind: 'delay', ms: 500 }, 10]]), 'blinkDelay')).toBe('500');
  });

  it('is unknown for any other variable', () => {
    expect(blinkBoard.variable(initialBlinkBoard(), 'lastToggle')).toBeUndefined();
  });
});

describe('the picture and the trace', () => {
  it('light the LED and draw the level HIGH while the LED is on, and LOW while it is off', () => {
    const on = after([[{ kind: 'high' }, 10]]);
    expect(blinkBoard.picture('blink/simple', on)).toEqual({ flags: { on: true }, values: {} });
    expect(blinkBoard.level(on)).toBe(1);
    expect(blinkBoard.picture('blink/simple', initialBlinkBoard())).toEqual({ flags: { on: false }, values: {} });
    expect(blinkBoard.level(initialBlinkBoard())).toBe(0);
  });
});
