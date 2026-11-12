import { isBusy, type BoardLine, type SessionState } from '../flash';

/** How many of the lines the board printed the site keeps, for the serial monitor. */
export const KEPT_LINES = 200;

/**
 * What the site knows of the visitor's board beyond the session's state: what it runs and what it printed. It holds
 * from page to page, since the board does.
 */
export interface BoardRecord {
  /** The key the board last printed in a `sketch <key>` line since it connected, as every step of a ladder does. */
  readonly heard?: string;
  /** The key the site last flashed onto the board since it connected. */
  readonly flashed?: string;
  /** The key a page asked to flash, from the press until the board runs it or the flash fails. */
  readonly pending?: string;
  /**
   * The last {@link KEPT_LINES} lines the board printed since it connected, blank and `cfg ` lines left out, and the
   * lines the visitor sent it, marked `sent`.
   */
  readonly lines: readonly KeptLine[];
}

/** A line the board printed, or one the visitor sent it. */
export interface KeptLine extends BoardLine {
  readonly sent?: true;
}

/** What changes the record. */
export type RecordEvent =
  /** A page asked the session to flash `key`. */
  | { readonly kind: 'flash'; readonly key: string }
  | { readonly kind: 'state'; readonly from: SessionState; readonly to: SessionState }
  | { readonly kind: 'line'; readonly line: BoardLine }
  /** The visitor sent the board `line`. */
  | { readonly kind: 'sent'; readonly line: BoardLine };

export const EMPTY_RECORD: BoardRecord = { lines: [] };

/** The key a `sketch <key>` line names, which every step of a ladder prints first; `undefined` for any other line. */
export function sketchOf(line: string): string | undefined {
  return /^sketch (\S+)$/.exec(line)?.[1];
}

/** The key of the sketch the board runs, as far as the site knows: what it said, or else what the site flashed. */
export function runs(record: BoardRecord): string | undefined {
  return record.heard ?? record.flashed;
}

/** The record after `event`. */
export function recordBoard(record: BoardRecord, event: RecordEvent): BoardRecord {
  switch (event.kind) {
    case 'flash':
      return { ...record, pending: event.key };
    case 'line': {
      const { text } = event.line;
      const heard = sketchOf(text) ?? record.heard;
      if (text === '' || text.startsWith('cfg ')) return heard === record.heard ? record : { ...record, heard };
      return { ...record, heard, lines: [...record.lines, event.line].slice(-KEPT_LINES) };
    }
    case 'sent':
      return { ...record, lines: [...record.lines, { ...event.line, sent: true as const }].slice(-KEPT_LINES) };
    case 'state':
      return recordState(record, event.from, event.to);
  }
}

function recordState(record: BoardRecord, from: SessionState, to: SessionState): BoardRecord {
  if (to.kind === 'connecting') {
    // A new connection: the board restarts, and only what it says from now on counts.
    return { pending: record.pending, lines: [] };
  }
  if (to.kind === 'running') {
    // A flash ends in `running`: the board now holds the key that was pending. A refused flash wrote nothing.
    const wrote = from.kind === 'flashing' || from.kind === 'applying';
    const settled = isBusy(from) || to.flashRefused !== undefined;
    return {
      ...record,
      flashed: wrote ? (record.pending ?? record.flashed) : record.flashed,
      pending: settled ? undefined : record.pending,
    };
  }
  if (isBusy(to)) return record;
  // Idle or a failure: no board, or none the site can say anything of.
  return EMPTY_RECORD;
}
