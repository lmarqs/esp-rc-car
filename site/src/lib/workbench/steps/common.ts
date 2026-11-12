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

/** What every step's `setup()` does: `output.begin` prints a blank line and the sketch's name, then `begin` runs. */
export function* setup(
  board: Pick<Board<unknown>, 'print'>,
  key: string,
  begin: string,
): Generator<Operation, void, undefined> {
  yield op(`output.begin("${key}");`, () => {
    board.print('');
    board.print(`sketch ${key}`);
  });
  yield op(begin);
}

/**
 * The start of a pass in a sketch that takes commands: while `input.ready()`, the board takes a line at `take`, the
 * line that calls `input.take()`, and `handle` runs the branches the sketch takes for it. The pass is priced at `cost`
 * where it starts; the checks after each line cost nothing.
 */
export function* readCommands<S>(
  board: Board<S>,
  cost: Cost,
  take: string,
  handle: (line: string) => Generator<Operation, void, undefined>,
): Generator<Operation, void, undefined> {
  yield op('while (input.ready()) {', undefined, cost);
  while (board.available()) {
    let line = '';
    yield op(take, () => (line = trim(board.read() ?? '')));
    yield* handle(line);
    yield op('while (input.ready()) {');
  }
}
