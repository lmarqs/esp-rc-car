import { paintFlashPicture } from '../board/flashPicture';
import type { LinkView } from './paneView';

/** What the visitor can press in the Board cell's switch. */
export interface BoardLinkHandlers {
  /** The board half of the Board switch. */
  action(): void;
  flashAgain(): void;
  /** The simulator half of the Board switch. */
  simulator(): void;
}

/** The Board cell, its switch and the board pane's message in `root`: writes what `linkView` says. */
export function mountBoardLink(root: HTMLElement, handlers: BoardLinkHandlers) {
  const cell = root.querySelector<HTMLElement>('[data-board-cell]')!;
  const statusText = root.querySelector<HTMLElement>('[data-board-status]')!;
  let statusWord = root.querySelector<HTMLElement>('[data-board-word]')!;
  let statusSentence = root.querySelector<HTMLElement>('[data-board-sentence]')!;
  const actionButton = root.querySelector<HTMLButtonElement>('[data-board-action]');
  const actionLabel = root.querySelector<HTMLElement>('[data-board-action-label]');
  const needsBrowser = root.querySelector<HTMLElement>('[data-needs-browser]')!;
  const simulatorButton = root.querySelector<HTMLButtonElement>('[data-pane-simulator]')!;
  const flashAgain = root.querySelector<HTMLButtonElement>('[data-flash-again]');
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const message = root.querySelector<HTMLElement>('[data-board-message]')!;
  const progress = root.querySelector<HTMLElement>('[data-board-progress]')!;

  actionButton?.addEventListener('click', handlers.action);
  flashAgain?.addEventListener('click', () => {
    if (flashAgain.getAttribute('aria-disabled') !== 'true') handlers.flashAgain();
  });
  simulatorButton.addEventListener('click', handlers.simulator);

  return {
    show(view: LinkView) {
      cell.dataset.status = view.kind;
      // Set only on a change, and in one, since the status is a live region: two would be announced twice.
      if (statusWord.textContent !== view.tag.word || statusSentence.textContent !== `: ${view.tag.title}`) {
        const word = statusWord.cloneNode() as HTMLElement;
        const sentence = statusSentence.cloneNode() as HTMLElement;
        word.textContent = view.tag.word;
        sentence.textContent = `: ${view.tag.title}`;
        statusText.replaceChildren(word, sentence);
        statusWord = word;
        statusSentence = sentence;
      }

      const { action } = view;
      needsBrowser.hidden = action !== undefined;
      simulatorButton.setAttribute('aria-pressed', String(view.chosen === 'simulator'));
      // A browser that cannot reach a board has the note in the board half's place, and nothing to flash again.
      if (flashAgain !== null) flashAgain.hidden = action === undefined;
      // Dimmed, not hidden, so the switch keeps its width; aria-disabled keeps the focus on it while it flashes.
      if (view.flashAgain) flashAgain?.removeAttribute('aria-disabled');
      else flashAgain?.setAttribute('aria-disabled', 'true');
      if (actionButton !== null && actionLabel !== null) {
        actionButton.hidden = action === undefined;
        actionButton.setAttribute('aria-pressed', String(view.chosen === 'board'));
        if (action !== undefined) {
          actionLabel.textContent = action.short ?? action.label;
          if (action.short === undefined) actionButton.removeAttribute('aria-label');
          else actionButton.setAttribute('aria-label', action.label);
          actionButton.dataset.icon = action.icon;
          // aria-disabled, not disabled, so a button pressed from the keyboard keeps the focus while the session works.
          if (action.disabled) actionButton.setAttribute('aria-disabled', 'true');
          else actionButton.removeAttribute('aria-disabled');
        }
      }

      const shown = view.message;
      stage.toggleAttribute('data-message', shown !== undefined);
      const words = shown?.text ?? '';
      // Only a change of text is announced: the progress bar carries the percentage.
      if (message.textContent !== words) message.textContent = words;
      message.classList.toggle('notice', shown?.notice ?? false);
      progress.hidden = shown?.progress === undefined;
      if (shown?.progress !== undefined) paintFlashPicture(progress, shown.progress);
    },
  };
}
