/** One row of the watch panel: a name, such as `LED`, and its value as the page shows it. */
export interface WatchRow {
  readonly name: string;
  readonly value: string;
}

/**
 * What the workbench shows of a project's board, built from what the board printed, so the same model serves the
 * simulator and a real board. `E` is what a printed line means, `B` the board as the page knows it.
 */
export interface BoardModel<E, B> {
  /** Every watch row the project's steps can show, in the panel's order. */
  readonly fields: readonly string[];
  initial(): B;
  /** The board after it printed a line meaning `event` at `at` milliseconds. */
  apply(board: B, event: E, at: number): B;
  /**
   * The rows `step` shows, a subset of `fields` in their order; `millis` is the board's clock, `undefined` when the
   * page does not know it.
   */
  watch(step: string, board: B, millis: number | undefined): readonly WatchRow[];
  /** Whether the picture shows the board's output on, such as a lit LED. */
  lit(board: B): boolean;
}
