import { nth, op, waitOp, type Board, type Cost, type LineRef, type Operation, type Sketch } from '../simulator';
import type { LiveValue, SliderShortcut, StepDefinition } from '../step';
import { isDigit, toInt, trim } from './arduino';

/** What the four Servo sketches keep; `sweep` and `angle` use none of it, since their angle lives in a local. */
export interface ServoState {
  /** The sketch's `angle`: the angle last written, and in `speed` where the sketch estimates the servo is. */
  angle: number;
  /** `speed`'s `target`, the angle the servo moves toward. */
  target: number;
  /** `speed`'s `speed`, in degrees a second. */
  speed: number;
  sweeping: boolean;
  /** `commands`' `step`: the way the sweep goes, 1 up or -1 down. */
  step: number;
  /** The `millis()` of `commands`' last sweep step. */
  lastStep: number;
  /** The `micros()` of `speed`'s last move. */
  lastMove: number;
}

/** What a line the Servo sketches print means. */
export type ServoEvent =
  | { readonly kind: 'sketch'; readonly key: string }
  | { readonly kind: 'angle'; readonly degrees: number }
  | { readonly kind: 'target'; readonly degrees: number }
  | { readonly kind: 'speed'; readonly degreesPerSecond: number }
  | { readonly kind: 'sweeping' }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'error'; readonly message: string };

export type ServoStep = StepDefinition<ServoState, ServoEvent>;

/** The GPIO the sketches' `EspLedcOutPin servoPin(13, 50, 16);` drives. */
export const SERVO_PIN = 13;
/** The servo's range, `PositionalServo`'s default. */
export const MAX_ANGLE = 180;
/** How long `sweep` waits on each angle: its `delay(15);`, also `commands`' step interval. */
export const SWEEP_DELAY = 15;

const SETUP_ANGLE = 90;
const DEFAULT_SPEED = 60;
const MIN_SPEED = 1;
const MAX_SPEED = 360;

const ANGLE_ERROR = 'error angle must be 0-180';
const SPEED_ERROR = 'error speed must be 1-360';
const UNKNOWN_COMMAND = 'error unknown command';

/** What one pass through a `loop()` that waits for nothing costs: slow enough to follow while stepping. */
const IDLE_MS_WATCHED = 250;
const IDLE_MS_FULL_SPEED = 25;

const initialState = (): ServoState => ({
  angle: SETUP_ANGLE,
  target: SETUP_ANGLE,
  speed: DEFAULT_SPEED,
  sweeping: false,
  step: 1,
  lastStep: 0,
  lastMove: 0,
});

/** The sketches' `isNumber(text, low, high)`: one to three digits that make a number from `low` to `high`. */
export function isNumber(text: string, low: number, high: number): boolean {
  if (text.length < 1 || text.length > 3) return false;
  if (![...text].every((char) => isDigit(char))) return false;
  return toInt(text) >= low && toInt(text) <= high;
}

/**
 * What a pass through `loop()` costs: the idle time, or less when a move falls `due` sooner, so the move comes on
 * time. A pass never costs more than the idle time, so a line sent while a slow move waits is read within it, as
 * on the board, whose passes take microseconds.
 */
function passCost(board: Board<ServoState>, due: (state: ServoState) => number | undefined): Cost {
  return () => {
    const idle = board.pace() === 'run' ? IDLE_MS_FULL_SPEED : IDLE_MS_WATCHED;
    const at = due(board.state);
    return at === undefined ? idle : Math.min(idle, Math.max(0, at - board.millis()));
  };
}

/** What `setup()` does before it writes the servo: a blank line, the sketch's name, then the servo's pin. */
function* setup(board: Board<ServoState>, key: string): Generator<Operation, void, undefined> {
  yield op('Serial.begin(115200);');
  yield op('Serial.println();', () => board.print(''));
  yield op(`Serial.println("sketch ${key}");`, () => board.print(`sketch ${key}`));
  yield op('servo.begin();');
}

/** The body of `angle`'s `writeAngle(value)`: the servo, then the angle. */
function* writeDegrees(board: Board<ServoState>, degrees: number): Generator<Operation, void, undefined> {
  yield op('servo.write(value);', () => board.turn(SERVO_PIN, degrees));
  yield op('Serial.print("angle ");');
  yield op('Serial.println(value);', () => board.print(`angle ${degrees}`));
}

/** The body of `commands`' and `speed`'s `writeAngle(value)`, which keep the angle in `angle`. */
function* writeKept(board: Board<ServoState>, degrees: number): Generator<Operation, void, undefined> {
  const state = board.state;
  yield op('angle = value;', () => (state.angle = degrees));
  yield op('servo.write(angle);', () => board.turn(SERVO_PIN, state.angle));
  yield op('Serial.print("angle ");');
  yield op('Serial.println(angle);', () => board.print(`angle ${state.angle}`));
}

/** One of `sweep`'s two `for` loops: `header` is its line, and `occurrence` tells its body's lines from the other's. */
function* sweepOnce(
  board: Board<ServoState>,
  header: string,
  from: number,
  by: number,
  holds: (angle: number) => boolean,
  occurrence: number,
): Generator<Operation, void, undefined> {
  const at = (text: string): LineRef => nth(text, occurrence);
  for (let angle = from; ; angle += by) {
    yield op(header);
    if (!holds(angle)) return;
    yield op(at('servo.write(angle);'), () => board.turn(SERVO_PIN, angle));
    yield op(at('Serial.print("angle ");'));
    yield op(at('Serial.println(angle);'), () => board.print(`angle ${angle}`));
    yield waitOp(at('delay(15);'), SWEEP_DELAY);
  }
}

const sweep: Sketch<ServoState> = {
  init: initialState,
  *program(board) {
    yield* setup(board, 'servo/sweep');
    for (;;) {
      yield* sweepOnce(board, 'for (int angle = 0; angle <= 180; angle += 1) {', 0, 1, (a) => a <= MAX_ANGLE, 1);
      yield* sweepOnce(board, 'for (int angle = 179; angle >= 1; angle -= 1) {', MAX_ANGLE - 1, -1, (a) => a >= 1, 2);
    }
  },
};

const angle: Sketch<ServoState> = {
  init: initialState,
  *program(board) {
    yield* setup(board, 'servo/angle');
    yield op('writeAngle(90);');
    yield* writeDegrees(board, SETUP_ANGLE);
    for (;;) {
      yield op('if (Serial.available()) {', undefined, passCost(board, () => undefined));
      if (!board.available()) continue;
      let line = '';
      yield op("String line = Serial.readStringUntil('\\n');", () => (line = board.read() ?? ''));
      yield op('line.trim();', () => (line = trim(line)));
      yield op('if (isNumber(line, 0, 180)) {');
      if (isNumber(line, 0, MAX_ANGLE)) {
        yield op('writeAngle(line.toInt());');
        yield* writeDegrees(board, toInt(line));
      } else {
        yield op('} else if (line.length() > 0) {');
        if (line.length > 0) yield op(`Serial.println("${ANGLE_ERROR}");`, () => board.print(ANGLE_ERROR));
      }
    }
  },
};

/**
 * The start of a pass in `commands` and `speed`: the board reads the lines sent, one whole line at a time where the
 * board reads a character at a time, and `handle` runs the branches the sketch takes for each.
 */
function* readCommands(
  board: Board<ServoState>,
  cost: Cost,
  handle: (line: string) => Generator<Operation, void, undefined>,
): Generator<Operation, void, undefined> {
  yield op('while (Serial.available()) {', undefined, cost);
  while (board.available()) {
    let line = '';
    yield op('char c = Serial.read();', () => (line = board.read() ?? ''));
    yield op("if (c != '\\n') {");
    yield op('line.trim();', () => (line = trim(line)));
    yield* handle(line);
    yield op('line = "";');
    yield op('while (Serial.available()) {');
  }
}

/** The branches after `angle` and `speed`, which `commands` and `speed` share but for what `sweep` and `stop` set. */
function* sweepOrStop(
  board: Board<ServoState>,
  line: string,
  startSweep: Generator<Operation, void, undefined>,
  stop: Generator<Operation, void, undefined>,
): Generator<Operation, void, undefined> {
  yield op('} else if (line == "sweep") {');
  if (line === 'sweep') {
    yield op('if (!sweeping) {');
    if (!board.state.sweeping) yield* startSweep;
    yield op('Serial.println("sweeping");', () => board.print('sweeping'));
    return;
  }
  yield op('} else if (line == "stop") {');
  if (line === 'stop') {
    yield* stop;
    yield op('Serial.println("stopped");', () => board.print('stopped'));
    return;
  }
  yield op('} else if (line.length() > 0) {');
  if (line.length > 0) yield op(`Serial.println("${UNKNOWN_COMMAND}");`, () => board.print(UNKNOWN_COMMAND));
}

const commands: Sketch<ServoState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'servo/commands');
    yield op('writeAngle(angle);');
    yield* writeKept(board, state.angle);
    const cost = passCost(board, (s) => (s.sweeping ? s.lastStep + SWEEP_DELAY : undefined));
    for (;;) {
      yield* readCommands(board, cost, function* (line) {
        yield op('if (line.startsWith("angle ")) {');
        if (line.startsWith('angle ')) {
          let text = '';
          yield op('String text = line.substring(6);', () => (text = line.slice(6)));
          yield op('if (isNumber(text, 0, 180)) {');
          if (isNumber(text, 0, MAX_ANGLE)) {
            yield op('sweeping = false;', () => (state.sweeping = false));
            yield op('writeAngle(text.toInt());');
            yield* writeKept(board, toInt(text));
          } else {
            yield op(`Serial.println("${ANGLE_ERROR}");`, () => board.print(ANGLE_ERROR));
          }
          return;
        }
        yield* sweepOrStop(
          board,
          line,
          (function* () {
            yield op('sweeping = true;', () => (state.sweeping = true));
            yield op('step = 1;', () => (state.step = 1));
          })(),
          (function* () {
            yield op(nth('sweeping = false;', 2), () => (state.sweeping = false));
          })(),
        );
      });
      yield op('if (sweeping && millis() - lastStep >= 15) {');
      if (!state.sweeping || board.millis() - state.lastStep < SWEEP_DELAY) continue;
      yield op('lastStep = millis();', () => (state.lastStep = board.millis()));
      yield op('if (angle == 180) {');
      if (state.angle === MAX_ANGLE) {
        yield op('step = -1;', () => (state.step = -1));
      } else {
        yield op('} else if (angle == 0) {');
        if (state.angle === 0) yield op(nth('step = 1;', 2), () => (state.step = 1));
      }
      yield op('writeAngle(angle + step);');
      yield* writeKept(board, state.angle + state.step);
    }
  },
};

/** `speed`'s move interval in microseconds: `1000000UL / speed` in integer division. */
const moveInterval = (state: ServoState): number => Math.trunc(1_000_000 / state.speed);

/** The board's `micros()`, rounded so the sum of fractional line costs lands on the microsecond a move fell due. */
const micros = (board: Board<ServoState>): number => Math.round(board.millis() * 1000);

const speed: Sketch<ServoState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'servo/speed');
    yield op('writeAngle(angle);');
    yield* writeKept(board, state.angle);
    // A sweep that reached its end turns at once, so it has a move due too.
    const moving = (s: ServoState) => s.angle !== s.target || s.sweeping;
    const cost = passCost(board, (s) => (moving(s) ? (s.lastMove + moveInterval(s)) / 1000 : undefined));
    const sweepEnd = () => (state.target = state.angle === MAX_ANGLE ? 0 : MAX_ANGLE);
    for (;;) {
      yield* readCommands(board, cost, function* (line) {
        yield op('if (line.startsWith("angle ")) {');
        if (line.startsWith('angle ')) {
          let text = '';
          yield op('String text = line.substring(6);', () => (text = line.slice(6)));
          yield op('if (isNumber(text, 0, 180)) {');
          if (isNumber(text, 0, MAX_ANGLE)) {
            yield op('sweeping = false;', () => (state.sweeping = false));
            yield op('target = text.toInt();', () => (state.target = toInt(text)));
            yield op('Serial.print("target ");');
            yield op('Serial.println(target);', () => board.print(`target ${state.target}`));
          } else {
            yield op(`Serial.println("${ANGLE_ERROR}");`, () => board.print(ANGLE_ERROR));
          }
          return;
        }
        yield op('} else if (line.startsWith("speed ")) {');
        if (line.startsWith('speed ')) {
          let text = '';
          yield op(nth('String text = line.substring(6);', 2), () => (text = line.slice(6)));
          yield op('if (isNumber(text, 1, 360)) {');
          if (isNumber(text, MIN_SPEED, MAX_SPEED)) {
            yield op('speed = text.toInt();', () => (state.speed = toInt(text)));
            yield op('Serial.print("speed ");');
            yield op('Serial.println(speed);', () => board.print(`speed ${state.speed}`));
          } else {
            yield op(`Serial.println("${SPEED_ERROR}");`, () => board.print(SPEED_ERROR));
          }
          return;
        }
        yield* sweepOrStop(
          board,
          line,
          (function* () {
            yield op('sweeping = true;', () => (state.sweeping = true));
            yield op('target = angle == 180 ? 0 : 180;', sweepEnd);
          })(),
          (function* () {
            yield op(nth('sweeping = false;', 2), () => (state.sweeping = false));
            yield op('target = angle;', () => (state.target = state.angle));
          })(),
        );
      });
      yield op('if (sweeping && angle == target) {');
      if (state.sweeping && state.angle === state.target) {
        yield op(nth('target = angle == 180 ? 0 : 180;', 2), sweepEnd);
      }
      yield op('if (angle != target && micros() - lastMove >= 1000000UL / speed) {');
      if (state.angle === state.target || micros(board) - state.lastMove < moveInterval(state)) continue;
      yield op('lastMove = micros();', () => (state.lastMove = micros(board)));
      yield op('writeAngle(angle + (target > angle ? 1 : -1));');
      yield* writeKept(board, state.angle + (state.target > state.angle ? 1 : -1));
    }
  },
};

/** Parses a line a Servo sketch printed; `undefined` for the blank line and any line no sketch prints. */
export function parseServoLine(line: string): ServoEvent | undefined {
  if (line === 'sweeping') return { kind: 'sweeping' };
  if (line === 'stopped') return { kind: 'stopped' };
  const named = /^sketch (\S+)$/.exec(line);
  if (named) return { kind: 'sketch', key: named[1] };
  const number = /^(angle|target|speed) (\d+)$/.exec(line);
  if (number?.[1] === 'angle') return { kind: 'angle', degrees: Number(number[2]) };
  if (number?.[1] === 'target') return { kind: 'target', degrees: Number(number[2]) };
  if (number?.[1] === 'speed') return { kind: 'speed', degreesPerSecond: Number(number[2]) };
  const error = /^error (.+)$/.exec(line);
  if (error) return { kind: 'error', message: error[1] };
  return undefined;
}

/** The line `angle` prints in answer to `sent`; `undefined` for a line it ignores, a blank one. */
export function angleReply(sent: string): string | undefined {
  const line = trim(sent);
  if (isNumber(line, 0, MAX_ANGLE)) return `angle ${toInt(line)}`;
  return line.length > 0 ? ANGLE_ERROR : undefined;
}

/** The line `commands` prints in answer to `sent`; `undefined` for a blank line. */
export function commandsReply(sent: string): string | undefined {
  const line = trim(sent);
  if (line.startsWith('angle ')) return isNumber(line.slice(6), 0, MAX_ANGLE) ? `angle ${toInt(line.slice(6))}` : ANGLE_ERROR;
  return sweepOrStopReply(line);
}

/** The line `speed` prints in answer to `sent`; `undefined` for a blank line. */
export function speedReply(sent: string): string | undefined {
  const line = trim(sent);
  if (line.startsWith('angle ')) return isNumber(line.slice(6), 0, MAX_ANGLE) ? `target ${toInt(line.slice(6))}` : ANGLE_ERROR;
  if (line.startsWith('speed ')) {
    return isNumber(line.slice(6), MIN_SPEED, MAX_SPEED) ? `speed ${toInt(line.slice(6))}` : SPEED_ERROR;
  }
  return sweepOrStopReply(line);
}

function sweepOrStopReply(line: string): string | undefined {
  if (line === 'sweep') return 'sweeping';
  if (line === 'stop') return 'stopped';
  return line.length > 0 ? UNKNOWN_COMMAND : undefined;
}

/**
 * What a step that answers every line it reads with one line of its own offers the live board: a printed line answers
 * a sent one when it is the very line the sketch prints for it, and a sent line waits for an answer when the sketch
 * prints one.
 */
function replies(reply: (sent: string) => string | undefined): Pick<ServoStep, 'answers' | 'expectsAnswer'> {
  return {
    answers: (line, sent) => line === reply(sent),
    expectsAnswer: (sent) => reply(sent) !== undefined,
  };
}

/** The angle slider, which shows `follows`: the angle the servo holds, or on `speed` the target it moves toward. */
function angleSlider(follows: 'angle' | 'target', command: (degrees: number) => string): SliderShortcut {
  return {
    kind: 'slider',
    label: 'angle',
    unit: 'degrees',
    min: 0,
    max: MAX_ANGLE,
    step: 1,
    initial: SETUP_ANGLE,
    follows,
    command,
  };
}

const speedSlider: SliderShortcut = {
  kind: 'slider',
  label: 'speed',
  unit: 'degrees a second',
  min: MIN_SPEED,
  max: MAX_SPEED,
  step: 1,
  initial: DEFAULT_SPEED,
  follows: 'speed',
  command: (degreesPerSecond) => `speed ${degreesPerSecond}`,
};

const commandChips = [
  { kind: 'chip', text: 'sweep' },
  { kind: 'chip', text: 'stop' },
] as const;

export const servoSweep: ServoStep = {
  key: 'servo/sweep',
  sketch: 'sketches/servo/sweep',
  program: sweep,
  shortcuts: [],
  placeholder: 'this step reads no input',
  hint: 'The horn turns when servo.write() runs, one degree every 15 ms, and the trace draws the angle. This step reads no input: press Step to run it one line at a time.',
  parse: parseServoLine,
};

export const servoAngle: ServoStep = {
  key: 'servo/angle',
  sketch: 'sketches/servo/angle',
  program: angle,
  shortcuts: [angleSlider('angle', (degrees) => String(degrees))],
  placeholder: 'a number, then Enter',
  hint: 'Send a number from 0 to 180 and the horn turns to it. Any other line gets an error reply, and the horn stays where it is.',
  parse: parseServoLine,
  ...replies(angleReply),
};

export const servoCommands: ServoStep = {
  key: 'servo/commands',
  sketch: 'sketches/servo/commands',
  program: commands,
  shortcuts: [...commandChips, angleSlider('angle', (degrees) => `angle ${degrees}`)],
  placeholder: 'a command, then Enter',
  hint: 'Send angle 45, sweep or stop: with no delay(), the board reads a command even in the middle of a sweep. Any other line gets error unknown command.',
  live: { name: 'angle', value: (state) => String(state.angle) } satisfies LiveValue<ServoState>,
  parse: parseServoLine,
  ...replies(commandsReply),
};

export const servoSpeed: ServoStep = {
  key: 'servo/speed',
  sketch: 'sketches/servo/speed',
  program: speed,
  shortcuts: [...commandChips, angleSlider('target', (degrees) => `angle ${degrees}`), speedSlider],
  placeholder: 'a command, then Enter',
  hint: 'The horn now moves one degree at a time toward the target, at the speed you set with speed 1 to 360. The dashed horn is the target, and the solid one is where the sketch estimates the servo is.',
  live: { name: 'speed', value: (state) => String(state.speed) } satisfies LiveValue<ServoState>,
  parse: parseServoLine,
  ...replies(speedReply),
};

/** The Servo project's steps in the order the page lists them. */
export const servoSteps: readonly ServoStep[] = [servoSweep, servoAngle, servoCommands, servoSpeed];
