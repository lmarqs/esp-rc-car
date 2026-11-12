import type { BoardModel, WatchRow } from './board';
import type { BlinkEvent } from './steps/blink';

/** What the Blink workbench shows of the board, built only from the lines the board printed. */
export interface BlinkBoard {
  readonly ledOn: boolean;
  /** The interval in milliseconds, as the board last announced it with `delay <n>`. */
  readonly wait: number;
  readonly paused: boolean;
  /** When the LED last changed, and the time of the change before it when there was one; oldest first. */
  readonly changes: readonly number[];
}

const DEFAULT_WAIT = 1000;

/** The watch panel's rows, in order; each step shows the ones it has. */
export const BLINK_WATCH_FIELDS = ['LED', 'wait', 'measured', 'millis()', 'paused'] as const;

/** The steps whose sketch reads `millis()`, and the one that can pause. */
const CLOCK_STEPS = new Set(['blink/timer', 'blink/commands']);
const PAUSE_STEPS = new Set(['blink/commands']);
/** The step whose interval is written into the sketch. */
const FIXED_WAIT_STEPS = new Set(['blink/simple']);

export function initialBlinkBoard(): BlinkBoard {
  return { ledOn: false, wait: DEFAULT_WAIT, paused: false, changes: [] };
}

/**
 * The board after it printed `event` at `at` milliseconds. A `sketch` line means the board started again; `HIGH` and
 * `LOW` set the LED, and each change of level is timed.
 */
export function applyBlinkEvent(board: BlinkBoard, event: BlinkEvent, at: number): BlinkBoard {
  switch (event.kind) {
    case 'sketch':
      return initialBlinkBoard();
    case 'high':
    case 'low': {
      const ledOn = event.kind === 'high';
      if (ledOn === board.ledOn) return board;
      return { ...board, ledOn, changes: [...board.changes, at].slice(-2) };
    }
    case 'delay':
      return { ...board, wait: event.ms };
    case 'paused':
      return { ...board, paused: true };
    case 'running':
      return { ...board, paused: false };
  }
}

/** The time between the last two changes of the LED, in milliseconds; `undefined` before the second change. */
export function measuredInterval(board: BlinkBoard): number | undefined {
  const [before, last] = board.changes;
  return last === undefined ? undefined : last - before;
}

/**
 * The watch panel for `step`: the LED, the interval and the measured interval on every step, `millis()` on the steps
 * that read the clock and `paused` on the one that can pause. `millis` is `undefined` when the clock is unknown.
 */
export function blinkWatch(step: string, board: BlinkBoard, millis: number | undefined): WatchRow[] {
  const measured = measuredInterval(board);
  const rows: WatchRow[] = [
    { name: 'LED', value: board.ledOn ? 'HIGH' : 'LOW' },
    { name: 'wait', value: FIXED_WAIT_STEPS.has(step) ? `${board.wait} ms (fixed)` : `${board.wait} ms` },
    { name: 'measured', value: measured === undefined ? '…' : `${measured} ms` },
  ];
  if (CLOCK_STEPS.has(step)) rows.push({ name: 'millis()', value: millis === undefined ? '…' : String(millis) });
  if (PAUSE_STEPS.has(step)) rows.push({ name: 'paused', value: String(board.paused) });
  return rows;
}

export const blinkBoard: BoardModel<BlinkEvent, BlinkBoard> = {
  fields: BLINK_WATCH_FIELDS,
  initial: initialBlinkBoard,
  apply: applyBlinkEvent,
  watch: blinkWatch,
  lit: (board) => board.ledOn,
};
