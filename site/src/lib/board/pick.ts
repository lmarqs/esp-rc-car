import { boardModel, type BoardModel } from './models';

/** The part of the browser's `localStorage` the pick uses. */
export type PickStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The board the visitor said they have, one for the whole site, kept in the browser between visits. */
export interface BoardPick {
  readonly model: BoardModel | undefined;
  /** Picks the model with `id`, or none with `undefined`. */
  choose(id: string | undefined): void;
  /** Calls `listener` after the pick changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = 'robomania.board';

/** Creates a pick kept in `storage`; the site holds one, from {@link thePick}. */
export function createPick(storage: PickStorage | undefined): BoardPick {
  const listeners = new Set<() => void>();
  let model = boardModel(read(storage) ?? '');

  return {
    get model() {
      return model;
    },
    choose(id) {
      const next = id === undefined ? undefined : boardModel(id);
      if (next === model) return;
      model = next;
      write(storage, next?.id);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// The browser may refuse storage, as in a private window; the pick then lasts as long as the page.
function read(storage: PickStorage | undefined): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function write(storage: PickStorage | undefined, id: string | undefined) {
  try {
    if (id === undefined) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, id);
  } catch {
    // Kept for this page only.
  }
}

const KEY = Symbol.for('robomania.boardPick');

/** The site's pick, on the window like {@link theBoard}, so every page script reaches the same one. */
export function thePick(): BoardPick {
  const holder = globalThis as { [KEY]?: BoardPick };
  holder[KEY] ??= createPick(safeLocalStorage());
  return holder[KEY];
}

function safeLocalStorage(): PickStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
