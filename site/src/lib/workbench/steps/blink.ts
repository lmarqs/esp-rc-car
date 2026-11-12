import { nth, op, waitOp, type Board, type Cost, type LineRef, type Operation, type Sketch } from '../simulator';
import type { LiveValue, SliderShortcut, StepDefinition } from '../step';
import { isDigit, toInt, trim } from './arduino';

/** What the four Blink sketches keep: the LED, the interval and, in `commands`, whether blinking is paused. */
export interface BlinkState {
  ledOn: boolean;
  /** The sketch's `blinkDelay` in milliseconds; `simple` has none and always waits 1000. */
  blinkDelay: number;
  paused: boolean;
  /** The `millis()` of the last toggle, in the two sketches that blink without `delay()`. */
  lastToggle: number;
}

/** What a line the Blink sketches print means. */
export type BlinkEvent =
  | { readonly kind: 'sketch'; readonly key: string }
  | { readonly kind: 'high' }
  | { readonly kind: 'low' }
  | { readonly kind: 'delay'; readonly ms: number }
  | { readonly kind: 'paused' }
  | { readonly kind: 'running' };

export type BlinkStep = StepDefinition<BlinkState, BlinkEvent>;

/** The GPIO the sketches' `DigitalOutPin led(2);` drives. */
export const LED_PIN = 2;

const DEFAULT_DELAY = 1000;
const MIN_DELAY = 100;
const MAX_DELAY = 2000;

/** What one pass through `loop()` costs where the sketch has no `delay()`: slow enough to follow while stepping. */
const PASS_MS_WATCHED = 250;
const PASS_MS_FULL_SPEED = 25;

function passCost(board: Board<BlinkState>): Cost {
  return () => (board.pace() === 'run' ? PASS_MS_FULL_SPEED : PASS_MS_WATCHED);
}

const initialState = (): BlinkState => ({ ledOn: false, blinkDelay: DEFAULT_DELAY, paused: false, lastToggle: 0 });

const constrain = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** What `setup()` does: a blank line, the sketch's name, then the LED pin. */
function* setup(board: Board<BlinkState>, key: string): Generator<Operation, void, undefined> {
  yield op('Serial.begin(115200);');
  yield op('Serial.println();', () => board.print(''));
  yield op(`Serial.println("sketch ${key}");`, () => board.print(`sketch ${key}`));
  yield op('led.begin();');
}

/** The lines `Serial.print("delay "); Serial.println(blinkDelay);` write as one line. */
function* announceDelay(board: Board<BlinkState>): Generator<Operation, void, undefined> {
  yield op('Serial.print("delay ");');
  yield op('Serial.println(blinkDelay);', () => board.print(`delay ${board.state.blinkDelay}`));
}

const simple: Sketch<BlinkState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'blink/simple');
    for (;;) {
      yield op('Serial.println("HIGH");', () => board.print('HIGH'));
      yield op('led.write(HIGH);', () => {
        state.ledOn = true;
        board.write(LED_PIN, true);
      });
      yield waitOp('delay(1000);', DEFAULT_DELAY);
      yield op('Serial.println("LOW");', () => board.print('LOW'));
      yield op('led.write(LOW);', () => {
        state.ledOn = false;
        board.write(LED_PIN, false);
      });
      yield waitOp(nth('delay(1000);', 2), DEFAULT_DELAY);
    }
  },
};

const input: Sketch<BlinkState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'blink/input');
    for (;;) {
      // One line per pass: the line is read only when the arrow comes back here, after both delays.
      yield op('if (Serial.available()) {');
      if (board.available()) {
        let line = '';
        yield op("String line = Serial.readStringUntil('\\n');", () => (line = board.read() ?? ''));
        yield op('line.trim();', () => (line = trim(line)));
        yield op('if (isDigit(line[0])) {');
        if (isDigit(line[0])) {
          yield op('blinkDelay = constrain(line.toInt(), 100, 2000);', () => {
            state.blinkDelay = constrain(toInt(line), MIN_DELAY, MAX_DELAY);
          });
          yield* announceDelay(board);
        }
      }
      yield op('Serial.println("HIGH");', () => board.print('HIGH'));
      yield op('led.write(HIGH);', () => {
        state.ledOn = true;
        board.write(LED_PIN, true);
      });
      yield waitOp('delay(blinkDelay);', () => state.blinkDelay);
      yield op('Serial.println("LOW");', () => board.print('LOW'));
      yield op('led.write(LOW);', () => {
        state.ledOn = false;
        board.write(LED_PIN, false);
      });
      yield waitOp(nth('delay(blinkDelay);', 2), () => state.blinkDelay);
    }
  },
};

/**
 * The lines `timer` and `commands` share: the check of the clock that toggles the LED, with `guard` the text of the
 * `if` line and `due` whether its condition holds.
 */
function* toggleWhenDue(
  board: Board<BlinkState>,
  guard: string,
  due: (state: BlinkState, now: number) => boolean,
): Generator<Operation, void, undefined> {
  const state = board.state;
  yield op(guard);
  if (!due(state, board.millis())) return;
  yield op('lastToggle = millis();', () => (state.lastToggle = board.millis()));
  yield op('ledOn = !ledOn;', () => (state.ledOn = !state.ledOn));
  yield op('Serial.println(ledOn ? "HIGH" : "LOW");', () => board.print(state.ledOn ? 'HIGH' : 'LOW'));
  yield op('led.write(ledOn);', () => board.write(LED_PIN, state.ledOn));
}

const timer: Sketch<BlinkState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'blink/timer');
    for (;;) {
      // The pass is priced where it starts; the checks after each drained line cost nothing more.
      yield op('while (Serial.available()) {', undefined, passCost(board));
      while (board.available()) {
        let line = '';
        // The board reads the line a character at a time; the visitor sends whole lines, so this step takes one.
        yield op('char c = Serial.read();', () => (line = board.read() ?? ''));
        yield op("if (c != '\\n') {");
        yield op('line.trim();', () => (line = trim(line)));
        yield op('if (isDigit(line[0])) {');
        if (isDigit(line[0])) {
          yield op('blinkDelay = constrain(line.toInt(), 100, 2000);', () => {
            state.blinkDelay = constrain(toInt(line), MIN_DELAY, MAX_DELAY);
          });
          yield* announceDelay(board);
        }
        yield op('line = "";');
        yield op('while (Serial.available()) {');
      }
      yield* toggleWhenDue(
        board,
        'if (millis() - lastToggle >= blinkDelay) {',
        (s, now) => now - s.lastToggle >= s.blinkDelay,
      );
    }
  },
};

const commands: Sketch<BlinkState> = {
  init: initialState,
  *program(board) {
    const state = board.state;
    yield* setup(board, 'blink/commands');
    for (;;) {
      yield op('while (Serial.available()) {', undefined, passCost(board));
      while (board.available()) {
        let line = '';
        yield op('char c = Serial.read();', () => (line = board.read() ?? ''));
        yield op("if (c != '\\n') {");
        yield op('line.trim();', () => (line = trim(line)));
        yield op('if (line == "pause") {');
        if (line === 'pause') {
          yield op('paused = true;', () => (state.paused = true));
          yield op('Serial.println("paused");', () => board.print('paused'));
        } else {
          yield op('} else if (line == "run") {');
          if (line === 'run') {
            yield op('paused = false;', () => (state.paused = false));
            yield op('Serial.println("running");', () => board.print('running'));
          } else {
            yield op('} else if (line.startsWith("delay ") && isDigit(line[6])) {');
            if (line.startsWith('delay ') && isDigit(line[6])) {
              yield op('blinkDelay = constrain(line.substring(6).toInt(), 100, 2000);', () => {
                state.blinkDelay = constrain(toInt(line.slice(6)), MIN_DELAY, MAX_DELAY);
              });
              yield* announceDelay(board);
            } else {
              yield op('} else if (line.length() > 0) {');
              if (line.length > 0) {
                yield op('Serial.print("? ");');
                yield op('Serial.println(line);', () => board.print(`? ${line}`));
              }
            }
          }
        }
        yield op('line = "";');
        yield op('while (Serial.available()) {');
      }
      yield* toggleWhenDue(
        board,
        'if (!paused && millis() - lastToggle >= blinkDelay) {',
        (s, now) => !s.paused && now - s.lastToggle >= s.blinkDelay,
      );
    }
  },
};

/** Parses a line a Blink sketch printed; `undefined` for the blank line and for `? <line>`, which the page ignores. */
export function parseBlinkLine(line: string): BlinkEvent | undefined {
  if (line === 'HIGH') return { kind: 'high' };
  if (line === 'LOW') return { kind: 'low' };
  if (line === 'paused') return { kind: 'paused' };
  if (line === 'running') return { kind: 'running' };
  const named = /^sketch (\S+)$/.exec(line);
  if (named) return { kind: 'sketch', key: named[1] };
  const delay = /^delay (\d+)$/.exec(line);
  if (delay) return { kind: 'delay', ms: Number(delay[1]) };
  return undefined;
}

/** The lines that answer a line the visitor sent: the new interval, the pause and run replies, or `? <line>`. */
export function answersBlinkLine(line: string): boolean {
  if (line.startsWith('? ')) return true;
  const kind = parseBlinkLine(line)?.kind;
  return kind === 'delay' || kind === 'paused' || kind === 'running';
}

/** The lines `input` and `timer` answer: those that start with a digit once trimmed, which set the interval. */
export function answersNumber(sent: string): boolean {
  return isDigit(trim(sent)[0]);
}

/** The lines `commands` answers: every line that is not blank once trimmed, unknown ones with `? <line>`. */
export function answersCommand(sent: string): boolean {
  return trim(sent).length > 0;
}

/**
 * Where the arrow sits on a board that prints `HIGH` or `LOW` just before it writes the LED and then waits: on the
 * `delay` line after that write, `wait` the line's text, which the sketch holds twice.
 */
function delayAfterWrite(wait: string): (event: BlinkEvent) => LineRef | undefined {
  return (event) => {
    if (event.kind === 'high') return wait;
    if (event.kind === 'low') return nth(wait, 2);
    return undefined;
  };
}

/** The interval the three steps that read one show in their declaration of `blinkDelay`. */
const liveDelay: LiveValue<BlinkState> = { name: 'blinkDelay', value: (state) => String(state.blinkDelay) };

function delaySlider(command: (milliseconds: number) => string): SliderShortcut {
  return {
    kind: 'slider',
    label: 'delay',
    unit: 'ms',
    min: MIN_DELAY,
    max: MAX_DELAY,
    step: 100,
    initial: DEFAULT_DELAY,
    command,
  };
}

export const blinkSimple: BlinkStep = {
  key: 'blink/simple',
  sketch: 'sketches/blink/simple',
  program: simple,
  shortcuts: [],
  placeholder: 'this step reads no input',
  hint: 'The arrow is the line the board is about to run, and the clock fills while it waits in delay(). Press Step to run one line at a time.',
  parse: parseBlinkLine,
  liveLine: delayAfterWrite('delay(1000);'),
};

export const blinkInput: BlinkStep = {
  key: 'blink/input',
  sketch: 'sketches/blink/input',
  program: input,
  shortcuts: [delaySlider((ms) => String(ms))],
  placeholder: 'a number, then Enter',
  hint: 'Send a number: the board reads it only when it is back at the Serial.available() line, after both delays, so the blink under way keeps the old pace.',
  live: liveDelay,
  parse: parseBlinkLine,
  liveLine: delayAfterWrite('delay(blinkDelay);'),
  answers: answersBlinkLine,
  expectsAnswer: answersNumber,
};

export const blinkTimer: BlinkStep = {
  key: 'blink/timer',
  sketch: 'sketches/blink/timer',
  program: timer,
  shortcuts: [delaySlider((ms) => String(ms))],
  placeholder: 'a number, then Enter',
  hint: 'There is no delay(): the board runs loop() again and again and checks the clock each time. A number you send is read on the next pass.',
  live: liveDelay,
  parse: parseBlinkLine,
  answers: answersBlinkLine,
  expectsAnswer: answersNumber,
};

export const blinkCommands: BlinkStep = {
  key: 'blink/commands',
  sketch: 'sketches/blink/commands',
  program: commands,
  shortcuts: [{ kind: 'chip', text: 'pause' }, { kind: 'chip', text: 'run' }, delaySlider((ms) => `delay ${ms}`)],
  placeholder: 'a command, then Enter',
  hint: 'The buttons and the slider type for you: drag the slider and watch the line it is about to send. The same words work in any serial monitor.',
  live: liveDelay,
  parse: parseBlinkLine,
  answers: answersBlinkLine,
  expectsAnswer: answersCommand,
};

/** The Blink project's steps in the order the page lists them. */
export const blinkSteps: readonly BlinkStep[] = [blinkSimple, blinkInput, blinkTimer, blinkCommands];
