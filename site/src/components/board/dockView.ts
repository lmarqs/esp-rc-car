import { isBusy, wording, type SessionState } from '../../lib/flash';
import type { SketchName } from '../../lib/board/names';
import { runs, type BoardRecord } from '../../lib/board/record';

/** What the board dock shows for the visitor's board. */
export interface DockView {
  /** Whether the dock shows at all: not in a browser that cannot reach a board. */
  readonly shown: boolean;
  /** Whether the site reads a board, which lights the dock's dot. */
  readonly connected: boolean;
  /** The board's chip, such as `ESP32`, or what the dock says in its place: the subject of what it does. */
  readonly chip: string;
  /** What the board does, or what the visitor does next, in words that follow the chip, such as `is running`. */
  readonly doing: string;
  /** The sketch the board runs or is written with, named after `doing`. */
  readonly sketch?: string;
  /** The page of the project whose sketch the board runs, which `sketch` links to. */
  readonly path?: string;
  /** The last line the board printed, shown in the Serial button that opens the rest. */
  readonly last?: string;
  /** The flash's percentage while one writes. */
  readonly progress?: number;
  /** Which buttons the dock offers. */
  readonly connect: boolean;
  readonly flashAgain: boolean;
  readonly disconnect: boolean;
  /** Whether the serial monitor can send a line: only while the site reads a board that is not busy. */
  readonly canSend: boolean;
}

const NOTHING = { connect: false, flashAgain: false, disconnect: false, canSend: false } as const;

/** The name of the sketch `key`, or a plain one for a sketch outside the site. */
function nameOf(names: Readonly<Record<string, SketchName>>, key: string | undefined): SketchName | undefined {
  if (key === undefined) return undefined;
  // The key is whatever the board printed, so a key such as `constructor` must not reach the object's prototype.
  return Object.hasOwn(names, key) ? names[key] : { title: key, path: '' };
}

/**
 * The dock for the session's `state`, the record of the board, the names of the site's sketches and the keys of those
 * it has images of, `flashable`.
 */
export function dockView(
  state: SessionState,
  record: BoardRecord,
  names: Readonly<Record<string, SketchName>>,
  flashable: ReadonlySet<string>,
): DockView {
  if (state.kind === 'unsupported') {
    return { shown: false, connected: false, chip: '', doing: '', ...NOTHING };
  }
  if (state.kind === 'running') {
    if (state.lost) {
      return {
        shown: true,
        connected: false,
        chip: state.chip,
        doing: wording.STOPPED_TALKING,
        ...NOTHING,
        connect: true,
      };
    }
    const key = runs(record);
    const name = nameOf(names, key);
    const last = record.lines.findLast((line) => !line.sent)?.text;
    return {
      shown: true,
      connected: true,
      chip: state.chip,
      doing: name === undefined ? 'is running a sketch' : 'is running',
      ...(name !== undefined && { sketch: name.title }),
      ...(name?.path && { path: name.path }),
      ...(last !== undefined && { last }),
      connect: false,
      flashAgain: key !== undefined && flashable.has(key),
      disconnect: true,
      canSend: true,
    };
  }
  if (state.kind === 'flashing') {
    const title = nameOf(names, record.pending)?.title;
    const writing = title ? { doing: 'is writing', sketch: title } : { doing: 'is writing a sketch' };
    const doing = state.pct >= 100 ? { doing: 'is restarting' } : writing;
    return { shown: true, connected: true, chip: state.chip, ...doing, progress: state.pct, ...NOTHING };
  }
  if (state.kind === 'connecting') {
    return { shown: true, connected: false, chip: 'Board', doing: 'is connecting', ...NOTHING };
  }
  if (isBusy(state)) {
    // Settings, read or sent: the card that asked for them shows the form and what the board answered.
    const chip = 'chip' in state ? state.chip : 'Board';
    return { shown: true, connected: true, chip, doing: 'is busy with its settings', ...NOTHING };
  }
  return {
    shown: true,
    connected: false,
    chip: 'No board',
    doing: 'is connected. Plug one in over USB.',
    ...NOTHING,
    connect: true,
  };
}
