import type { LinkView } from './paneView';

/** What the visitor can press of the switch. */
export interface BoardLinkHandlers {
  /** The switch's Simulator half. */
  simulator(): void;
  /** The switch's My board half. */
  board(): void;
}

const DOT_TITLES: Readonly<Record<LinkView['dot'], string>> = {
  off: 'My board: not connected',
  busy: 'My board: connecting…',
  on: 'My board: connected',
};
const FLASHING_TITLE = 'My board: flashing…';

/** The switch and the board pane's frame in `root`: writes what `linkView` says. */
export function mountBoardLink(root: HTMLElement, handlers: BoardLinkHandlers) {
  const simulatorButton = root.querySelector<HTMLButtonElement>('[data-pane-simulator]')!;
  const boardButton = root.querySelector<HTMLButtonElement>('[data-pane-board]');
  const dot = root.querySelector<HTMLElement>('[data-board-dot]');
  const needsBrowser = root.querySelector<HTMLElement>('[data-needs-browser]')!;
  const frame = root.querySelector<HTMLElement>('[data-frame]')!;
  const tag = root.querySelector<HTMLElement>('[data-pane-tag]')!;
  let tagWord = root.querySelector<HTMLElement>('[data-tag-word]')!;
  let tagTitle = root.querySelector<HTMLElement>('[data-tag-title]')!;

  simulatorButton.addEventListener('click', handlers.simulator);
  boardButton?.addEventListener('click', handlers.board);

  return {
    show(view: LinkView) {
      // A browser that cannot reach a board has the note in the My board half's place.
      needsBrowser.hidden = view.reachable;
      simulatorButton.setAttribute('aria-pressed', String(view.chosen === 'simulator'));
      if (boardButton !== null && dot !== null) {
        boardButton.hidden = !view.reachable;
        boardButton.setAttribute('aria-pressed', String(view.chosen === 'board'));
        boardButton.title = view.dot === 'busy' && view.flashing ? FLASHING_TITLE : DOT_TITLES[view.dot];
        dot.dataset.link = view.dot;
      }

      frame.dataset.mode = view.mode;
      // Set only on a change, and in one, since the tag is a live region: two would be announced twice.
      if (tagWord.textContent !== view.tag.word || tagTitle.textContent !== view.tag.title) {
        const word = tagWord.cloneNode() as HTMLElement;
        const title = tagTitle.cloneNode() as HTMLElement;
        word.textContent = view.tag.word;
        title.textContent = view.tag.title;
        tag.replaceChildren(word, ' ', title);
        // The sentence is cut where the frame is narrow, so the whole tag is in the title too.
        tag.title = `${view.tag.word} ${view.tag.title}`;
        tagWord = word;
        tagTitle = title;
      }
    },
    /** Gives the focus to the switch's My board half. */
    takeFocus() {
      boardButton?.focus();
    },
  };
}
