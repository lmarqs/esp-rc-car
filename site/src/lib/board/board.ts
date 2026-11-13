import { createFlasher, createSession, isBusy, type FlashSession, type Manifest, type SessionState } from '../flash';
import type { SessionEvent, SessionOptions } from '../flash/session';
import { EMPTY_RECORD, recordBoard, type BoardRecord, type RecordEvent } from './record';

/** The speed a board connected from a page with no sketch of its own is read at: every ladder step prints at it. */
export const DEFAULT_BAUD = 115200;

/** What a page points the board's session at: its images, the sketch it has open and the speed it prints at. */
export type BoardUse = Omit<SessionOptions, 'flasher'>;

/** The sketch a page part opened: what the session needs to work with it, and the name the visitor knows it by. */
export interface OpenedSketch {
  readonly use: BoardUse;
  /** The sketch's name as the page shows it, such as `Blink · 2 input`. */
  readonly title: string;
  /** Set for a step of a workbench, whose page lets the visitor pick another step. */
  readonly step?: true;
}

/**
 * The visitor's board, one for the whole site: the session that holds its port, and what the site knows of it. Pages
 * come and go around it, so each opens its sketch on it with {@link Board.open} and asks it for work with
 * {@link Board.send}, which keeps the record of what the board runs.
 */
export interface Board {
  readonly session: FlashSession;
  readonly record: BoardRecord;
  /** The sketch the visitor has open, such as the workbench's selected step, which the dock flashes. */
  readonly opened: OpenedSketch | undefined;
  /** Calls `listener` after the session's state or the record changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /**
   * Asks the session for `event`'s work, noting the key a flash writes. Unless the session is busy, whose work belongs
   * to the sketch it started with, the session is first pointed at the opened sketch's {@link BoardUse}.
   */
  send(event: SessionEvent): Promise<void>;
  /** Writes `text` to the board and keeps it among the lines; rejects as {@link FlashSession.sendLine} does. */
  sendLine(text: string): Promise<void>;
  /** Forgets the lines kept so far; what the board runs stays known. */
  clearLines(): void;
  /**
   * Names `use`, shown as `title`, the sketch the visitor has open, until `signal` aborts as its page goes or another
   * is opened; `step` marks a workbench's step. Opening does not point the session at it; the next {@link Board.send}
   * does.
   */
  open(use: BoardUse, title: string, signal: AbortSignal, options?: { step?: boolean }): void;
  /** Adds `manifest`'s images to the ones the session knows, so a key it names can be flashed again from any page. */
  know(manifest: Manifest): void;
}

/**
 * The key `event` flashes onto the board: a flash's own, or `sketch` for a connection that is not a restart, which
 * flashes the session's sketch after its settings if it has any; `undefined` for any other event.
 */
export function keyFlashedBy(event: SessionEvent, sketch: string): string | undefined {
  if (event.type === 'flash') return event.key;
  if (event.type === 'connect' && !event.reset) return sketch;
  return undefined;
}

/** Creates a board; the site holds one, from {@link theBoard}. */
export function createBoard(session: FlashSession): Board {
  const listeners = new Set<() => void>();
  let record = EMPTY_RECORD;
  let opened: OpenedSketch | undefined;
  let state: SessionState = session.state;
  let current: BoardUse = { manifest: { sketches: {} }, sketch: '', baud: DEFAULT_BAUD };

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function change(event: RecordEvent) {
    const next = recordBoard(record, event);
    if (next === record && event.kind !== 'state') return;
    record = next;
    notify();
  }

  session.subscribe((to) => {
    const from = state;
    state = to;
    change({ kind: 'state', from, to });
  });
  session.subscribeLines((line) => change({ kind: 'line', line }));

  return {
    session,
    get record() {
      return record;
    },
    get opened() {
      return opened;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(event) {
      if (opened !== undefined && !isBusy(session.state)) {
        current = opened.use;
        session.configure(current);
      }
      const key = keyFlashedBy(event, current.sketch);
      if (key !== undefined) change({ kind: 'flash', key });
      return session.send(event);
    },
    async sendLine(text) {
      await session.sendLine(text);
      change({ kind: 'sent', line: { text, at: Date.now() } });
    },
    clearLines() {
      change({ kind: 'clear' });
    },
    open(use, title, signal, options) {
      const sketch: OpenedSketch = { use, title, ...(options?.step === true && { step: true }) };
      opened = sketch;
      notify();
      signal.addEventListener(
        'abort',
        () => {
          if (opened !== sketch) return;
          opened = undefined;
          notify();
        },
        { once: true },
      );
    },
    know(manifest) {
      session.configure({ ...current, manifest });
    },
  };
}

const KEY = Symbol.for('robomania.board');

/**
 * The site's board. It lives on the window, not in a module, so every page script reaches the same one, however the
 * build splits them.
 */
export function theBoard(): Board {
  const holder = globalThis as { [KEY]?: Board };
  holder[KEY] ??= createBoard(
    createSession({ flasher: createFlasher(), manifest: { sketches: {} } satisfies Manifest, sketch: '', baud: DEFAULT_BAUD }),
  );
  return holder[KEY];
}
