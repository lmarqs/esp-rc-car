/**
 * A fake board that runs a sketch one source line at a time, with no DOM access. A sketch is written as a program: a
 * generator that yields one operation per line the board is about to run. The runner resumes the generator only after
 * the previous operation ran, so a condition the generator tests between two yields sees the state that line left.
 */

/**
 * How the runner is pacing the program. `step` while paused, so the visitor runs it one Step at a time; `slow` while
 * running in slow mode; `run` while running at full speed. A program reads it to price a pass of `loop()`.
 */
export type Pace = 'run' | 'slow' | 'step';

/** Simulated milliseconds, or a function the runner calls to compute them when it needs them. */
export type Cost = number | (() => number);

/** One source line the board is about to run. */
export interface Operation {
  /** The line's trimmed text, as it reads in the sketch's `.ino`; the runner reports it and does not interpret it. */
  readonly line: string;
  /** What running the line does to the program's state and the board. */
  readonly run?: () => void;
  /** How long the line takes on the simulated clock; 0 when absent. Evaluated when scheduled and again when it runs. */
  readonly cost?: Cost;
  /** Set on a line that waits, such as `delay(wait);`, so the page can show the wait filling. */
  readonly wait?: boolean;
}

/** An operation for `line` that does `run` and takes `cost` simulated milliseconds. */
export function op(line: string, run?: () => void, cost?: Cost): Operation {
  return { line, run, cost };
}

/** A waiting operation for `line`, such as `delay(wait);`, that does nothing for `cost` simulated milliseconds. */
export function waitOp(line: string, cost: Cost): Operation {
  return { line, cost, wait: true };
}

/** A line the visitor sent to the board's serial input. `id` tells it apart from another line with the same text. */
export interface SentLine {
  readonly id: number;
  readonly text: string;
}

/** A line of the serial output: printed by the program, or echoed from what the visitor sent when `sent` is set. */
export interface OutputLine {
  readonly text: string;
  readonly sent?: number;
}

/**
 * Something that happened on the board. `sent`: the visitor queued a line. `read`: the program took a queued line, at
 * the operation that reads serial input. `print`: the program printed a line.
 */
export type Effect =
  | { readonly kind: 'sent'; readonly line: SentLine }
  | { readonly kind: 'read'; readonly line: SentLine }
  | { readonly kind: 'print'; readonly text: string };

/** What a program sees of the board it runs on. */
export interface Board<S> {
  /** The program's state for this run, fresh from `Sketch.init` after every restart. */
  readonly state: S;
  /** The simulated clock in milliseconds since the run started, as `millis()` returns it. */
  millis(): number;
  /** How the runner paces the program right now. */
  pace(): Pace;
  /** How many sent lines are waiting to be read, as `Serial.available()` tells there is input. */
  available(): number;
  /** Takes the oldest sent line off the queue and reports it read; `undefined` when none waits. */
  read(): string | undefined;
  /** Prints `text` as one line of serial output. */
  print(text: string): void;
}

/** A sketch the simulator runs: its state at the start of a run and its program. */
export interface Sketch<S> {
  init(): S;
  program(board: Board<S>): Iterator<Operation, unknown, undefined>;
}

/** The real time the runner waits on. Vitest passes fake timers here or installs them on the globals. */
export interface RealClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The browser's clock, read from the globals at each call so fake timers installed later still apply. */
export const browserClock: RealClock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The least real time a line lasts in slow mode. */
export const SLOW_LINE_MS = 500;

/** How many lines that last no time the runner runs in a row before it lets the page handle its events. */
const INSTANT_LINES_PER_TURN = 1000;

/** `running` advances in real time, `paused` waits for Step or Continue, `ended` means the program returned. */
export type RunStatus = 'running' | 'paused' | 'ended';

/** Everything the page shows of the run, as of the last change. */
export interface RunnerView<S> {
  readonly status: RunStatus;
  readonly slow: boolean;
  readonly pace: Pace;
  /** The trimmed text of the line about to run; `undefined` once the program ended. */
  readonly line: string | undefined;
  /** Whether the line about to run is a waiting one. */
  readonly wait: boolean;
  /**
   * The real milliseconds the line about to run lasts from its start while running with the current slow setting: its
   * cost, or at least {@link SLOW_LINE_MS} in slow mode. 0 once the program ended.
   */
  readonly duration: number;
  /** The simulated clock; it moves when a line finishes, by that line's cost. */
  readonly millis: number;
  /** The program's state, owned by the runner: read it, do not change it. */
  readonly state: S;
  /** The serial output since the last restart, oldest first, at most `outputLimit` lines. */
  readonly output: readonly OutputLine[];
  /** The sent lines the program has not read yet, oldest first. */
  readonly queued: readonly SentLine[];
}

export interface RunnerOptions {
  /** Start in slow mode. Default: false. */
  slow?: boolean;
  /** Default: the browser's clock. */
  clock?: RealClock;
  /** How many output lines the view keeps. Default: 200. */
  outputLimit?: number;
}

export interface Runner<S> {
  view(): RunnerView<S>;
  /**
   * How much of the line about to run has elapsed in real time, from 0 to 1: the fill of a waiting line's clock. It
   * moves between notifications, so the page reads it on each frame. 0 for a line that lasts no time.
   */
  progress(): number;
  /** Runs the program in real time from where it stands. */
  run(): void;
  /** Stops in place. A waiting line keeps how much of its wait has elapsed, and the simulated clock shows its start. */
  pause(): void;
  /**
   * Pauses, then runs the line about to run at once: a waiting line adds its whole wait to the simulated clock with
   * no real wait, and the rest of a wait already under way is skipped.
   */
  step(): void;
  /** Turns slow mode on or off; a line under way keeps the time it has spent. */
  setSlow(slow: boolean): void;
  /** Back to the program's first line with fresh state, clock 0, no output and nothing queued; keeps run or pause. */
  restart(): void;
  /** Queues `text` the way the board's serial input would, echoes it to the output and returns its id. */
  send(text: string): number;
  /** Calls `listener` after every change with the new view and what happened in it; returns a function that stops it. */
  subscribe(listener: (view: RunnerView<S>, effects: readonly Effect[]) => void): () => void;
  /** Stops every timer and listener; the runner does nothing after it. */
  dispose(): void;
}

function costOf(operation: Operation): number {
  const { cost } = operation;
  return typeof cost === 'function' ? cost() : (cost ?? 0);
}

/**
 * A runner for `sketch`, paused before its first line. A line lasts its cost in real time while running, and at least
 * {@link SLOW_LINE_MS} in slow mode.
 */
export function createRunner<S>(sketch: Sketch<S>, options: RunnerOptions = {}): Runner<S> {
  const clock = options.clock ?? browserClock;
  const outputLimit = options.outputLimit ?? 200;
  const listeners = new Set<(view: RunnerView<S>, effects: readonly Effect[]) => void>();

  let status: RunStatus = 'paused';
  let slow = options.slow ?? false;
  let disposed = false;
  let nextSentId = 1;

  let state: S;
  let millis: number;
  let output: OutputLine[];
  let queue: SentLine[];
  let program: Iterator<Operation, unknown, undefined>;
  let current: Operation | undefined;
  let effects: Effect[] = [];

  // Real time spent on the current line before the last run(), and when that run() started counting.
  let elapsed = 0;
  let startedAt = 0;
  let timer: unknown;

  const pace = (): Pace => (status === 'running' ? (slow ? 'slow' : 'run') : 'step');

  const board: Board<S> = {
    get state() {
      return state;
    },
    millis: () => millis,
    pace,
    available: () => queue.length,
    read() {
      const [line, ...rest] = queue;
      if (line === undefined) return undefined;
      queue = rest;
      effects.push({ kind: 'read', line });
      return line.text;
    },
    print(text) {
      appendOutput({ text });
      effects.push({ kind: 'print', text });
    },
  };

  function appendOutput(line: OutputLine) {
    output = [...output, line].slice(-outputLimit);
  }

  function realDuration(): number {
    if (current === undefined) return 0;
    const cost = costOf(current);
    return slow ? Math.max(SLOW_LINE_MS, cost) : cost;
  }

  function view(): RunnerView<S> {
    return {
      status,
      slow,
      pace: pace(),
      line: current?.line,
      wait: current?.wait ?? false,
      duration: realDuration(),
      millis,
      state,
      output,
      queued: queue,
    };
  }

  function notify() {
    const happened = effects;
    effects = [];
    const snapshot = view();
    listeners.forEach((listener) => listener(snapshot, happened));
  }

  function stopTimer() {
    if (timer === undefined) return;
    clock.clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    stopTimer();
    if (status !== 'running') return;
    startedAt = clock.now();
    timer = clock.setTimeout(
      () => {
        timer = undefined;
        finishLine();
        notify();
        // A line that lasts no time runs at once, as it does on the board; the bound keeps a program whose lines
        // all last no time from holding the page.
        for (let i = 0; i < INSTANT_LINES_PER_TURN && status === 'running' && realDuration() === 0; i++) {
          finishLine();
          notify();
        }
        schedule();
      },
      Math.max(0, realDuration() - elapsed),
    );
  }

  function arrive() {
    elapsed = 0;
    const next = program.next();
    current = next.done ? undefined : next.value;
    if (current === undefined) {
      status = 'ended';
      stopTimer();
    }
  }

  function finishLine() {
    if (current === undefined) return;
    millis += costOf(current);
    current.run?.();
    arrive();
  }

  function begin() {
    stopTimer();
    state = sketch.init();
    millis = 0;
    output = [];
    queue = [];
    effects = [];
    program = sketch.program(board);
    if (status === 'ended') status = 'paused';
    arrive();
  }

  function settleElapsed() {
    if (status === 'running' && timer !== undefined) elapsed += clock.now() - startedAt;
  }

  begin();

  return {
    view,
    progress() {
      const duration = realDuration();
      if (duration <= 0) return 0;
      const running = status === 'running' && timer !== undefined ? clock.now() - startedAt : 0;
      return Math.min(1, (elapsed + running) / duration);
    },
    run() {
      if (disposed || status !== 'paused') return;
      status = 'running';
      schedule();
      notify();
    },
    pause() {
      if (disposed || status !== 'running') return;
      settleElapsed();
      stopTimer();
      status = 'paused';
      notify();
    },
    step() {
      if (disposed || status === 'ended') return;
      stopTimer();
      status = 'paused';
      finishLine();
      notify();
    },
    setSlow(on) {
      if (disposed || slow === on) return;
      settleElapsed();
      slow = on;
      schedule();
      notify();
    },
    restart() {
      if (disposed) return;
      begin();
      schedule();
      notify();
    },
    send(text) {
      if (disposed) return 0;
      const line = { id: nextSentId++, text };
      queue = [...queue, line];
      appendOutput({ text, sent: line.id });
      effects.push({ kind: 'sent', line });
      notify();
      return line.id;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      stopTimer();
      listeners.clear();
    },
  };
}
