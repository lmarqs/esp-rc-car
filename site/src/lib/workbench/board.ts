import type { Effect } from './simulator';

/** One row of the watch panel: a name, such as `LED`, and its value as the page shows it. */
export interface WatchRow {
  readonly name: string;
  readonly value: string;
}

/**
 * What the board pane's picture shows, for the page to paint without knowing the project: the classes the picture
 * carries, such as `on` for a lit LED, and the numbers its styles read as custom properties, such as `--angle` for a
 * servo's horn.
 */
export interface PictureView {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly values: Readonly<Record<string, number>>;
  /** The picture's name for a screen reader, which says what it shows; absent on a picture whose name never changes. */
  readonly label?: string;
}

/**
 * What the workbench shows of a project's board. A real board is known only from what it printed; the simulator's
 * board follows the lines the program runs. `E` is what a printed line means, `B` the board as the page knows it and
 * `S` the simulated program's state.
 */
export interface BoardModel<E, B, S> {
  /** Every watch row the project's steps can show, in the panel's order. */
  readonly fields: readonly string[];
  /** The rows that change on every pass, such as a clock, which the page does not highlight when they change. */
  readonly steady: readonly string[];
  initial(): B;
  /**
   * The board as the page starts following a real board that runs `step`: what the page `known` of it before, else
   * only what the step's source fixes, since the board may be in the middle of its run.
   */
  follow(step: string, known?: B): B;
  /** The board after it printed a line meaning `event` at `at` milliseconds. */
  apply(board: B, event: E, at: number): B;
  /**
   * The simulated board after the program ran one line, which did `effects` and left `state`, at `at` simulated
   * milliseconds. A value changes only when the line that sets it runs.
   */
  simulate(board: B, state: S, effects: readonly Effect[], at: number): B;
  /**
   * The rows `step` shows, a subset of `fields` in their order; `millis` is the board's clock, `undefined` when the
   * page does not know it.
   */
  watch(step: string, board: B, millis: number | undefined): readonly WatchRow[];
  /** What the picture shows of `board` while the page shows `step`. */
  picture(step: string, board: B): PictureView;
  /**
   * The output the trace draws, as a share of its range from 0 to 1, such as an LED's LOW and HIGH; `undefined` while
   * the page does not know it.
   */
  level(board: B): number | undefined;
  /**
   * The board after its line answered the line `sent`, for what the answer alone does not tell, such as a sweep that
   * an `angle` command stopped. Absent where every answer tells it all.
   */
  answered?(board: B, sent: string): B;
  /**
   * The value of the sketch's variable `name` as the board's lines tell it, such as `blinkDelay` from `delay <n>`, for
   * the editor's live value on a real board; `undefined` for a variable the lines do not tell, or have not told yet.
   */
  variable(board: B, name: string): string | undefined;
  /** How long the board waits in its `delay()` lines, in milliseconds; `undefined` while the page does not know. */
  wait(board: B): number | undefined;
}
