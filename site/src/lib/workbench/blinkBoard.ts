import type { BoardModel, WatchRow } from './board';
import type { Effect } from './simulator';
import { LED_PIN, type BlinkEvent, type BlinkState } from './steps/blink';

/** What the Blink workbench shows of the board, built only from the lines the board printed. */
export interface BlinkBoard {
  readonly ledOn: boolean;
  /** The interval in milliseconds, as the board last announced it with `delay <n>`; `undefined` while unknown. */
  readonly wait: number | undefined;
  /** `undefined` while unknown: a real board followed from the middle of its run has not said yet. */
  readonly paused: boolean | undefined;
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
 * The board as the page starts following a real board that runs `step`. What the page `known` of that board before
 * stays true, since only the board's own lines change it; else the interval is known only on the step whose source
 * fixes it, and whether it is paused only on the steps that cannot pause.
 */
export function followBlink(step: string, known?: BlinkBoard): BlinkBoard {
  const fresh = initialBlinkBoard();
  if (known !== undefined) return { ...fresh, wait: known.wait, paused: known.paused };
  return {
    ...fresh,
    wait: FIXED_WAIT_STEPS.has(step) ? fresh.wait : undefined,
    paused: PAUSE_STEPS.has(step) ? undefined : false,
  };
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

/**
 * The simulated board after a line that did `effects` and left `state`, at `at` simulated milliseconds: the LED
 * follows the pin writes, so it changes at `led.write`, and `wait` and `paused` follow the sketch's variables.
 */
export function simulateBlink(board: BlinkBoard, state: BlinkState, effects: readonly Effect[], at: number): BlinkBoard {
  let next = board;
  for (const effect of effects) {
    if (effect.kind === 'write' && effect.pin === LED_PIN) {
      next = applyBlinkEvent(next, { kind: effect.high ? 'high' : 'low' }, at);
    }
  }
  if (next.wait === state.blinkDelay && next.paused === state.paused) return next;
  return { ...next, wait: state.blinkDelay, paused: state.paused };
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
    { name: 'wait', value: board.wait === undefined ? '…' : `${board.wait} ms${FIXED_WAIT_STEPS.has(step) ? ' (fixed)' : ''}` },
    { name: 'measured', value: measured === undefined ? '…' : `${measured} ms` },
  ];
  if (CLOCK_STEPS.has(step)) rows.push({ name: 'millis()', value: millis === undefined ? '…' : String(millis) });
  if (PAUSE_STEPS.has(step)) rows.push({ name: 'paused', value: board.paused === undefined ? '…' : String(board.paused) });
  return rows;
}

export const blinkBoard: BoardModel<BlinkEvent, BlinkBoard, BlinkState> = {
  fields: BLINK_WATCH_FIELDS,
  steady: ['millis()'],
  initial: initialBlinkBoard,
  follow: followBlink,
  apply: applyBlinkEvent,
  simulate: simulateBlink,
  watch: blinkWatch,
  picture: (_step, board) => ({ flags: { on: board.ledOn }, values: {} }),
  level: (board) => (board.ledOn ? 1 : 0),
  wait: (board) => board.wait,
  variable: (board, name) => {
    const known: Record<string, number | boolean | undefined> = {
      blinkDelay: board.wait,
      ledOn: board.ledOn,
      paused: board.paused,
    };
    const value = Object.hasOwn(known, name) ? known[name] : undefined;
    return value === undefined ? undefined : String(value);
  },
};
