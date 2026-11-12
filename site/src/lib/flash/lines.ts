/** How many of the board's last lines the card shows. */
export const OUTPUT_LINES = 6;

/** A line this long without a line break is cut, so a board at another speed than the reader's cannot grow it forever. */
const MAX_LINE_LENGTH = 200;

export interface LineSplitter {
  /** Adds a piece of text and returns the lines it completed, in order and without their line breaks. */
  push(text: string): string[];
}

/**
 * Cuts the text a board prints into lines. A line break is `\n`, `\r\n` or `\r`, and a line is complete once its
 * break has arrived, so a line split across pieces comes out whole. Blank lines are dropped.
 */
export function createLineSplitter(): LineSplitter {
  let pending = '';
  return {
    push(text) {
      // A `\r` at the very end waits for the next piece, which may begin with the `\n` of a `\r\n`.
      const parts = (pending + text).split(/\r\n|\n|\r(?!$)/);
      pending = parts.pop()!;
      const lines = parts.filter((line) => line !== '');
      if (pending.length > MAX_LINE_LENGTH) {
        lines.push(pending);
        pending = '';
      }
      return lines;
    },
  };
}

/** The last `limit` of `lines` once `added` follow them. */
export function keepLast(lines: readonly string[], added: readonly string[], limit = OUTPUT_LINES): string[] {
  return [...lines, ...added].slice(-limit);
}
