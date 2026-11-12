import type { WatchRow } from '../../lib/workbench/board';
import { changedRows } from './view';

/** How long a watch value stays highlighted after it changes. */
const HIGHLIGHT_MS = 900;

/**
 * The watch panel of `root`: writes the rows a pane shows and marks, for a moment, the value that just changed.
 * `steady` lists the rows that change all the time and are never marked.
 */
export function mountWatchPanel(root: HTMLElement, steady: readonly string[]) {
  const rows = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-watch-row]')].map((row) => [row.dataset.watchRow!, row]),
  );
  // The rows as last shown; undefined after a reset, so the values the panel starts with are not marked.
  let shown: readonly WatchRow[] | undefined;
  const timers = new Map<string, number>();

  function mark(name: string) {
    const value = rows.get(name)?.querySelector('dd');
    if (value == null) return;
    value.setAttribute('data-changed', '');
    clearTimeout(timers.get(name));
    timers.set(name, window.setTimeout(() => value.removeAttribute('data-changed'), HIGHLIGHT_MS));
  }

  return {
    /** Shows `next`: a row the pane does not have is hidden. */
    show(next: readonly WatchRow[]) {
      for (const [name, element] of rows) {
        const row = next.find((candidate) => candidate.name === name);
        element.hidden = row === undefined;
        if (row !== undefined) element.querySelector('dd')!.textContent = row.value;
      }
      for (const name of changedRows(shown, next, steady)) mark(name);
      shown = next;
    },
    /** Forgets what was shown and clears the marks, as the pane starts over. */
    reset() {
      shown = undefined;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const row of rows.values()) row.querySelector('dd')?.removeAttribute('data-changed');
    },
  };
}
