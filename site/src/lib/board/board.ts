import { createFlasher, createSession, isBusy, type FlashSession, type Manifest, type SessionState } from '../flash';
import type { SessionEvent, SessionOptions } from '../flash/session';
import { EMPTY_RECORD, recordBoard, type BoardRecord, type RecordEvent } from './record';

/** The speed a board connected from a page with no sketch of its own is read at: every ladder step prints at it. */
export const DEFAULT_BAUD = 115200;

/** What a page points the board's session at: its images, the sketch its card flashes and the speed it prints at. */
export type BoardUse = Omit<SessionOptions, 'flasher'>;

/**
 * The visitor's board, one for the whole site: the session that holds its port, and what the site knows of it. Pages
 * come and go around it, so each points it at its own sketches with {@link Board.use} and asks it for work with
 * {@link Board.send}, which keeps the record of what the board runs.
 */
export interface Board {
  readonly session: FlashSession;
  readonly record: BoardRecord;
  /** The page part that last pointed the session at its sketches, such as `card:blink/simple`. */
  readonly owner: string | undefined;
  /** Calls `listener` after the session's state or the record changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /**
   * Points the session at `use` on behalf of `owner`. Refused, returning `false`, while the session is busy, since
   * the work under way belongs to the sketch it started with.
   */
  use(owner: string, use: BoardUse): boolean;
  /** Asks the session for `event`'s work, noting the key a flash writes. */
  send(event: SessionEvent): Promise<void>;
  /** Writes `text` to the board and keeps it among the lines; rejects as {@link FlashSession.sendLine} does. */
  sendLine(text: string): Promise<void>;
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
  let owner: string | undefined;
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
    get owner() {
      return owner;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use(next, use) {
      if (isBusy(session.state)) return false;
      const changed = next !== owner;
      owner = next;
      current = use;
      session.configure(use);
      // Another part of the page may have shown the board as its own until now.
      if (changed) notify();
      return true;
    },
    send(event) {
      const key = keyFlashedBy(event, current.sketch);
      if (key !== undefined) change({ kind: 'flash', key });
      return session.send(event);
    },
    async sendLine(text) {
      await session.sendLine(text);
      change({ kind: 'sent', line: { text, at: Date.now() } });
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
