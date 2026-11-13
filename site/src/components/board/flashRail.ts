import type { FlashScene } from '../../lib/board/flashScene';

/** Draws `scene` in the `FlashRail` inside `root`. */
export function paintFlashRail(root: HTMLElement, scene: FlashScene): void {
  const rail = root.querySelector<HTMLElement>('[data-flash-rail]')!;

  // A progress bar only while there is progress to report: the rest of the time the message says what happens.
  if (scene.pct === undefined) {
    rail.removeAttribute('role');
    rail.removeAttribute('aria-valuenow');
  } else {
    rail.setAttribute('role', 'progressbar');
    rail.setAttribute('aria-valuenow', String(scene.pct));
  }

  const [find, write] = scene.steps;
  rail.querySelectorAll<HTMLElement>('[data-flash-step]').forEach((step, index) => {
    step.dataset.mark = scene.steps[index]!;
  });
  rail.querySelector('[data-flash-percent]')!.textContent = scene.fill === undefined ? '' : `${scene.fill.pct}%`;

  const [first, second] = rail.querySelectorAll<HTMLElement>('[data-flash-seg]') as unknown as [HTMLElement, HTMLElement];
  fillSegment(first, find === 'done' ? 100 : 0, undefined, find === 'now');
  fillSegment(second, scene.fill?.pct ?? (write === 'done' ? 100 : 0), scene.fill?.tone, write === 'now');
}

/** Fills `segment` to `pct` in `tone`, with light running along it while its step is under way. */
function fillSegment(segment: HTMLElement, pct: number, tone: string | undefined, running: boolean) {
  segment.style.setProperty('--p', `${pct}%`);
  setData(segment, 'tone', tone);
  segment.toggleAttribute('data-run', running);
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
