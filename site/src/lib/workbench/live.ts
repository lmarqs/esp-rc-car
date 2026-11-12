import type { BoardModel } from './board';
import type { Effect, LineRef, OutputLine, SentLine } from './simulator';
import type { StepDefinition } from './step';
import { emptyTrace, recordEffects, type Trace } from './trace';

/** The most lines of output a followed board keeps, far more than the terminal shows. */
const MAX_OUTPUT = 64;

/**
 * The board pane of a real board, built from the lines the board printed since the page began following it and the
 * lines the visitor sent it. Times are the milliseconds of the page's clock at which each line arrived or left.
 */
export interface Followed<B> {
  readonly board: B;
  readonly trace: Trace;
  readonly output: readonly OutputLine[];
  /** The lines sent that the board has not answered yet, oldest first. */
  readonly unanswered: readonly SentLine[];
  readonly nextId: number;
  /** The source line the arrow sits on; `undefined` until a printed line places it, and on a step none places. */
  readonly arrow?: LineRef;
  /** When the printed line that put the arrow where it is arrived. */
  readonly arrowAt?: number;
}

/**
 * The pane as the page starts following a board that runs `step`, before it printed anything: the board as the model
 * says the page knows it, given what the page `known` of it before.
 */
export function follow<B>(
  model: Pick<BoardModel<unknown, B, unknown>, 'follow'>,
  step: string,
  known?: B,
): Followed<B> {
  return { board: model.follow(step, known), trace: emptyTrace(), output: [], unanswered: [], nextId: 1 };
}

const keep = (output: readonly OutputLine[], line: OutputLine) => [...output, line].slice(-MAX_OUTPUT);

/**
 * The pane after the board printed `text` at `at`. The board model applies what the line means, the trace takes the
 * LED's change of level on `pin`, and the arrow moves where the step places it. A line that answers a sent line marks
 * the oldest unanswered one applied, since a real board never reports reading a line.
 */
export function receive<E, B>(
  followed: Followed<B>,
  step: Pick<StepDefinition<unknown, E>, 'parse' | 'liveLine' | 'answers'>,
  model: Pick<BoardModel<E, B, unknown>, 'apply' | 'lit'>,
  pin: number,
  text: string,
  at: number,
): Followed<B> {
  const event = step.parse(text);
  const board = event === undefined ? followed.board : model.apply(followed.board, event, at);
  const placed = event === undefined ? undefined : step.liveLine?.(event);
  const arrow = placed ?? followed.arrow;
  const arrowAt = placed === undefined ? followed.arrowAt : at;
  const effects: Effect[] = [];
  if (model.lit(board) !== model.lit(followed.board)) effects.push({ kind: 'write', pin, high: model.lit(board) });
  let unanswered = followed.unanswered;
  if (unanswered.length > 0 && step.answers?.(text)) {
    effects.push({ kind: 'read', line: unanswered[0] });
    unanswered = unanswered.slice(1);
  }
  const trace = recordEffects(followed.trace, effects, pin, at);
  return { ...followed, board, arrow, arrowAt, unanswered, trace, output: keep(followed.output, { text }) };
}

/** The pane without the sent line `id`, which never reached the board: its line in the output and its marks go. */
export function withdraw<B>(followed: Followed<B>, id: number): Followed<B> {
  return {
    ...followed,
    output: followed.output.filter((line) => line.sent !== id),
    trace: { ...followed.trace, marks: followed.trace.marks.filter((mark) => mark.id !== id) },
    unanswered: followed.unanswered.filter((line) => line.id !== id),
  };
}

/**
 * The pane after the visitor sent `text` to the board at `at`: the terminal shows it as sent and the trace marks it.
 * It waits for an answer only when the step's sketch answers that line, so an answer is never matched to a line the
 * board ignored.
 */
export function send<B>(
  followed: Followed<B>,
  step: Pick<StepDefinition<unknown, unknown>, 'expectsAnswer'>,
  pin: number,
  text: string,
  at: number,
): Followed<B> {
  const line: SentLine = { id: followed.nextId, text };
  return {
    ...followed,
    nextId: line.id + 1,
    output: keep(followed.output, { text, sent: line.id }),
    trace: recordEffects(followed.trace, [{ kind: 'sent', line }], pin, at),
    unanswered: step.expectsAnswer?.(text) ? [...followed.unanswered, line] : followed.unanswered,
  };
}
