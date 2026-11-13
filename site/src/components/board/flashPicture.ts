import { chipLevel, type FlashScene } from '../../lib/board/flashScene';

const STEP_WORDS = ['Find', 'Write', 'Restart'] as const;

/** Draws `scene` in the `FlashPicture` inside `root`. */
export function paintFlashPicture(root: HTMLElement, scene: FlashScene): void {
  const picture = root.querySelector<HTMLElement>('[data-flash-picture]')!;
  picture.dataset.cable = scene.cable;
  picture.dataset.chip = scene.chip;
  setData(picture, 'fill', scene.fill?.tone);
  setData(picture, 'broken', scene.broken);

  // A progress bar only while there is progress to report: the rest of the time the words say what happens.
  const bar = picture.querySelector<HTMLElement>('[data-flash-bar]')!;
  if (scene.pct === undefined) {
    bar.removeAttribute('role');
    bar.removeAttribute('aria-valuenow');
  } else {
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', String(scene.pct));
  }

  const level = picture.querySelector('[data-flash-level]')!;
  const { y, height } = chipLevel(scene.fill?.pct ?? 0);
  level.setAttribute('y', String(y));
  level.setAttribute('height', String(height));
  picture.querySelector('[data-flash-percent]')!.textContent = scene.fill === undefined ? '' : `${scene.fill.pct}%`;

  picture.querySelectorAll<HTMLElement>('[data-flash-step]').forEach((step, index) => {
    const mark = scene.steps[index]!;
    step.dataset.mark = mark;
    step.textContent = `${mark === 'done' ? '✓ ' : mark === 'failed' ? '✕ ' : ''}${STEP_WORDS[index]}`;
  });
}

function setData(element: HTMLElement, key: string, value: string | undefined) {
  if (value === undefined) delete element.dataset[key];
  else element.dataset[key] = value;
}

/** Shows the `HandHint` inside `root` drawing `hint`, or hides it without one. */
export function paintHandHint(root: HTMLElement, hint: FlashScene['hint']): void {
  const drawing = root.querySelector<HTMLElement>('[data-hand-hint]');
  if (drawing === null) return;
  drawing.hidden = hint === undefined;
  if (hint === undefined) delete drawing.dataset.hint;
  else drawing.dataset.hint = hint;
}
