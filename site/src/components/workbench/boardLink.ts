import { paintFlashPicture, paintHandHint } from '../board/flashPicture';
import type { LinkView } from './paneView';

/** What the visitor can press of the switch, the board pane's frame and the My board view. */
export interface BoardLinkHandlers {
  /** The switch's Simulator half. */
  simulator(): void;
  /** The switch's My board half. */
  board(): void;
  /** The My board view's button. */
  action(): void;
  flashAgain(): void;
}

const DOT_TITLES: Readonly<Record<LinkView['dot'], string>> = {
  off: 'My board: not connected',
  busy: 'My board: connecting…',
  on: 'My board: connected',
};
const FLASHING_TITLE = 'My board: flashing…';

/** The switch, the board pane's frame and the My board view in `root`: writes what `linkView` says. */
export function mountBoardLink(root: HTMLElement, handlers: BoardLinkHandlers) {
  const simulatorButton = root.querySelector<HTMLButtonElement>('[data-pane-simulator]')!;
  const boardButton = root.querySelector<HTMLButtonElement>('[data-pane-board]');
  const dot = root.querySelector<HTMLElement>('[data-board-dot]');
  const needsBrowser = root.querySelector<HTMLElement>('[data-needs-browser]')!;
  const frame = root.querySelector<HTMLElement>('[data-frame]')!;
  const tag = root.querySelector<HTMLElement>('[data-pane-tag]')!;
  let tagWord = root.querySelector<HTMLElement>('[data-tag-word]')!;
  let tagTitle = root.querySelector<HTMLElement>('[data-tag-title]')!;
  const flashAgain = root.querySelector<HTMLButtonElement>('[data-flash-again]')!;
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const message = root.querySelector<HTMLElement>('[data-board-message]')!;
  const link = root.querySelector<HTMLElement>('[data-board-link]')!;
  const actionButton = root.querySelector<HTMLButtonElement>('[data-board-action]');
  const actionLabel = root.querySelector<HTMLElement>('[data-board-action-label]');

  simulatorButton.addEventListener('click', handlers.simulator);
  boardButton?.addEventListener('click', handlers.board);
  actionButton?.addEventListener('click', handlers.action);
  flashAgain.addEventListener('click', handlers.flashAgain);

  return {
    show(view: LinkView) {
      const { action } = view;
      // A browser that cannot reach a board has the note in the My board half's place.
      needsBrowser.hidden = action !== undefined;
      simulatorButton.setAttribute('aria-pressed', String(view.chosen === 'simulator'));
      if (boardButton !== null && dot !== null) {
        boardButton.hidden = action === undefined;
        boardButton.setAttribute('aria-pressed', String(view.chosen === 'board'));
        // The busy action's event says which work it is.
        boardButton.title = view.dot === 'busy' && action?.event === 'flash' ? FLASHING_TITLE : DOT_TITLES[view.dot];
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
      // The press hides Flash again as the flash starts: the focus goes on to the button that says what it does. The
      // My board view's button goes as the pane goes live, and the focus goes back to Flash again.
      const refocus = !view.flashAgain && document.activeElement === flashAgain;
      const toFlashAgain = view.flashAgain && actionButton !== null && document.activeElement === actionButton;
      flashAgain.hidden = !view.flashAgain;

      const waiting = view.mode === 'waiting';
      stage.toggleAttribute('data-message', view.message !== undefined);
      const shown = view.message;
      const words = shown?.text ?? '';
      // Only a change of text is announced: the picture carries the percentage.
      if (message.textContent !== words) message.textContent = words;
      message.classList.toggle('notice', shown?.notice ?? false);
      paintFlashPicture(link, view.scene);
      paintHandHint(link, view.scene.hint);

      if (actionButton !== null && actionLabel !== null) {
        actionButton.hidden = action === undefined;
        // Live, the board runs the step: Flash again on the frame flashes it, and a refusal shows with no button. The
        // button keeps its room, so the stage keeps its height.
        actionButton.toggleAttribute('data-off', !waiting);
        if (action !== undefined) {
          actionLabel.textContent = action.short ?? action.label;
          if (action.short === undefined) actionButton.removeAttribute('aria-label');
          else actionButton.setAttribute('aria-label', action.label);
          actionButton.dataset.icon = action.icon;
          // aria-disabled, not disabled, so a button pressed from the keyboard keeps the focus while the session works.
          if (action.disabled) actionButton.setAttribute('aria-disabled', 'true');
          else actionButton.removeAttribute('aria-disabled');
        }
        if (refocus && waiting && !actionButton.hidden) actionButton.focus();
      }
      if (toFlashAgain) flashAgain.focus();
    },
    /** Gives the focus to the My board view's button, or to the switch's My board half while the view shows none. */
    takeFocus() {
      if (actionButton !== null && !actionButton.hidden && !actionButton.hasAttribute('data-off')) actionButton.focus();
      else boardButton?.focus();
    },
  };
}
