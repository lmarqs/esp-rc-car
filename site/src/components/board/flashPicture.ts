/** The stage a flash at `pct` percent is in: writing the image, or restarting the board once it is written. */
export function flashStage(pct: number): 'writing' | 'restart' {
  return pct >= 100 ? 'restart' : 'writing';
}

/** The chip's fill in `FlashPicture`'s drawing for `pct` percent: its top and height inside the chip's body. */
export function chipLevel(pct: number): { y: number; height: number } {
  const height = (44 * Math.min(100, Math.max(0, pct))) / 100;
  return { y: 52 - height, height };
}

/** Moves the `FlashPicture` inside `root` to `pct` percent. */
export function paintFlashPicture(root: HTMLElement, pct: number): void {
  const picture = root.querySelector<HTMLElement>('[data-flash-picture]')!;
  const stage = flashStage(pct);
  picture.dataset.stage = stage;
  picture.querySelector('[data-flash-bar]')!.setAttribute('aria-valuenow', String(pct));
  const level = picture.querySelector('[data-flash-level]')!;
  const { y, height } = chipLevel(pct);
  level.setAttribute('y', String(y));
  level.setAttribute('height', String(height));
  picture.querySelector('[data-flash-percent]')!.textContent = `${pct}%`;
  picture.querySelector('[data-flash-writing]')!.textContent = stage === 'restart' ? '✓ Written' : 'Writing';
}
