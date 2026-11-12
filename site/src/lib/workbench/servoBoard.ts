import type { BoardModel, PictureView, WatchRow } from './board';
import type { Effect } from './simulator';
import { isNumber, MAX_ANGLE, SERVO_PIN, SWEEP_DELAY, type ServoEvent, type ServoState } from './steps/servo';
import { trim } from './steps/arduino';

/**
 * What the Servo workbench shows of the board, built only from the lines the board printed. Each value is `undefined`
 * while the page does not know it: a real board followed from the middle of its run has not said yet.
 */
export interface ServoBoard {
  /** The angle last written to the servo, as the board's `angle <n>` lines tell it; in `speed`, its estimate. */
  readonly angle: number | undefined;
  /** `speed`'s target. */
  readonly target: number | undefined;
  /** `speed`'s speed, in degrees a second. */
  readonly speed: number | undefined;
  readonly sweeping: boolean | undefined;
}

/** The watch panel's rows, in order; each step shows the ones it has. */
export const SERVO_WATCH_FIELDS = ['angle', 'target', 'speed', 'sweeping', 'millis()'] as const;

/** The steps that keep a target and a speed, and those that sweep on command and watch the clock. */
const SPEED_STEPS = new Set(['servo/speed']);
const COMMAND_STEPS = new Set(['servo/commands', 'servo/speed']);

/**
 * The board before its sketch wrote the servo: its angle unknown, since `servo.begin()` sends no pulse, and the
 * values `commands` and `speed` declare.
 */
export function initialServoBoard(): ServoBoard {
  return { angle: undefined, target: 90, speed: 60, sweeping: false };
}

/**
 * The board as the page starts following a real board that runs `step`. What the page `known` of that board before
 * stays true, since only the board's own lines change it; else nothing the board may have changed is known.
 */
export function followServo(step: string, known?: ServoBoard): ServoBoard {
  if (known !== undefined) return known;
  return {
    angle: undefined,
    target: undefined,
    speed: SPEED_STEPS.has(step) ? undefined : initialServoBoard().speed,
    sweeping: COMMAND_STEPS.has(step) ? undefined : false,
  };
}

/** The end a sweep heads for from `angle`, as the sketch picks it: 0 from 180, else 180. */
const sweepEnd = (angle: number): number => (angle === MAX_ANGLE ? 0 : MAX_ANGLE);

/**
 * The board after it printed `event`. A `sketch` line means the board started again. A sweep's target is never
 * printed: the page works it out as the sketch does, from where the sweep starts and each end it reaches.
 */
export function applyServoEvent(board: ServoBoard, event: ServoEvent): ServoBoard {
  switch (event.kind) {
    case 'sketch':
      return initialServoBoard();
    case 'angle': {
      const { degrees } = event;
      const turns = board.sweeping === true && (degrees === 0 || degrees === MAX_ANGLE);
      return { ...board, angle: degrees, target: turns ? sweepEnd(degrees) : board.target };
    }
    case 'target':
      return { ...board, target: event.degrees, sweeping: false };
    case 'speed':
      return { ...board, speed: event.degreesPerSecond };
    case 'sweeping': {
      if (board.sweeping === true) return board;
      // From a sweep the page did not know of, the target may be either end.
      const started = board.sweeping === false && board.angle !== undefined;
      return { ...board, sweeping: true, target: started ? sweepEnd(board.angle!) : undefined };
    }
    case 'stopped':
      return { ...board, sweeping: false, target: board.angle };
    case 'error':
      return board;
  }
}

/**
 * The board after it answered the line `sent`: an `angle` command stops a sweep, though `commands` answers it with the
 * same `angle <n>` line a sweep prints.
 */
export function servoAnswered(board: ServoBoard, sent: string): ServoBoard {
  const line = trim(sent);
  if (!line.startsWith('angle ') || !isNumber(line.slice(6), 0, MAX_ANGLE)) return board;
  return board.sweeping === false ? board : { ...board, sweeping: false };
}

/**
 * The simulated board after a line that did `effects` and left `state`: the angle follows the writes to the servo, so
 * it changes at `servo.write`, and the target, speed and sweep follow the sketch's variables.
 */
export function simulateServo(board: ServoBoard, state: ServoState, effects: readonly Effect[]): ServoBoard {
  let { angle } = board;
  for (const effect of effects) if (effect.kind === 'turn' && effect.pin === SERVO_PIN) angle = effect.degrees;
  const { target, speed, sweeping } = state;
  if (angle === board.angle && target === board.target && speed === board.speed && sweeping === board.sweeping) {
    return board;
  }
  return { angle, target, speed, sweeping };
}

const degrees = (value: number | undefined): string => (value === undefined ? '…' : `${value}°`);

/**
 * The watch panel for `step`: the angle on every step, the target and speed on `speed`, and whether it sweeps and
 * `millis()` on the two steps that sweep on command, in whole milliseconds as the board counts them. `millis` is
 * `undefined` when the clock is unknown.
 */
export function servoWatch(step: string, board: ServoBoard, millis: number | undefined): WatchRow[] {
  const rows: WatchRow[] = [{ name: 'angle', value: degrees(board.angle) }];
  if (SPEED_STEPS.has(step)) {
    rows.push({ name: 'target', value: degrees(board.target) });
    rows.push({ name: 'speed', value: board.speed === undefined ? '…' : `${board.speed} °/s` });
  }
  if (COMMAND_STEPS.has(step)) {
    rows.push({ name: 'sweeping', value: board.sweeping === undefined ? '…' : String(board.sweeping) });
    rows.push({ name: 'millis()', value: millis === undefined ? '…' : String(Math.floor(millis)) });
  }
  return rows;
}

/**
 * The horn at the angle, or only its hub while the angle is unknown; on `speed`, also the target as a dashed outline.
 * The custom properties `--angle` and `--target` are in degrees.
 */
export function servoPicture(step: string, board: ServoBoard): PictureView {
  const { angle, target } = board;
  const showsTarget = SPEED_STEPS.has(step) && target !== undefined;
  const middle = MAX_ANGLE / 2;
  let label = `A servo on GPIO ${SERVO_PIN}, its angle not known yet`;
  if (angle !== undefined) label = `A servo on GPIO ${SERVO_PIN}, its horn at ${angle}°`;
  if (showsTarget) {
    label =
      angle === undefined
        ? `A servo on GPIO ${SERVO_PIN}: target ${target}°, its estimate not known yet`
        : `A servo on GPIO ${SERVO_PIN}: estimated at ${angle}°, target ${target}°`;
  }
  return {
    flags: { known: angle !== undefined, aiming: showsTarget },
    values: { angle: angle ?? middle, target: target ?? angle ?? middle },
    label,
  };
}

export const servoBoard: BoardModel<ServoEvent, ServoBoard, ServoState> = {
  fields: SERVO_WATCH_FIELDS,
  // The angle changes every 15 ms in a sweep; the horn and the trace show its change.
  steady: ['angle', 'millis()'],
  initial: initialServoBoard,
  follow: followServo,
  apply: applyServoEvent,
  answered: servoAnswered,
  simulate: (board, state, effects) => simulateServo(board, state, effects),
  watch: servoWatch,
  picture: servoPicture,
  level: (board) => (board.angle === undefined ? undefined : board.angle / MAX_ANGLE),
  // Only `sweep` waits in delay(), always 15 ms.
  wait: () => SWEEP_DELAY,
  variable: (board, name) => {
    const known: Record<string, number | undefined> = { angle: board.angle, target: board.target, speed: board.speed };
    const value = Object.hasOwn(known, name) ? known[name] : undefined;
    return value === undefined ? undefined : String(value);
  },
};
