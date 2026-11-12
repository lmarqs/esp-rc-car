import { op, type Board, type Cost, type Operation } from '../simulator';
import { trim } from './arduino';

/** What one pass through `loop()` costs where the sketch has no `delay()`: slow enough to follow while stepping. */
const PASS_MS_WATCHED = 250;
const PASS_MS_FULL_SPEED = 25;

/**
 * What a pass through `loop()` costs: the idle time, or less when something the sketch times falls `due` sooner, at
 * that time in milliseconds, so it comes on time. A pass never costs more than the idle time, so a line sent while the
 * sketch waits is read within it, as on the board, whose passes take microseconds.
 */
export function passCost<S>(board: Board<S>, due?: (state: S) => number | undefined): Cost {
  return () => {
    const idle = board.pace() === 'run' ? PASS_MS_FULL_SPEED : PASS_MS_WATCHED;
    const at = due?.(board.state);
    return at === undefined ? idle : Math.min(idle, Math.max(0, at - board.millis()));
  };
}

/** What every step's `setup()` does: a blank line, the sketch's name, then `begin`, the line that starts its output. */
export function* setup(
  board: Pick<Board<unknown>, 'print'>,
  key: string,
  begin: string,
): Generator<Operation, void, undefined> {
  yield op('Serial.begin(115200);');
  yield op('Serial.println();', () => board.print(''));
  yield op(`Serial.println("sketch ${key}");`, () => board.print(`sketch ${key}`));
  yield op(begin);
}

/**
 * The start of a pass in a sketch that takes commands: the board reads the lines sent, one whole line at a time where
 * the board reads a character at a time, since the visitor sends whole lines, and `handle` runs the branches the
 * sketch takes for each. The pass is priced at `cost` where it starts; the checks after each line read cost nothing.
 */
export function* readCommands<S>(
  board: Board<S>,
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
