import type { BoardModel } from '../../lib/board/models';
import type { SessionState } from '../../lib/flash';

/** Where a step of a flash is: not reached, under way, done, or where it failed. */
export type StepMark = 'todo' | 'now' | 'done' | 'failed';

/**
 * What `FlashPicture` draws of the visitor's desk: the computer, the cable and the board's chip, and the three steps of
 * a flash under them, Find, Write and Restart.
 */
export interface FlashScene {
  /**
   * `loose` before a board is connected; `joined` while one is; `ping` while the page looks for it; `packets` while
   * the image runs down it; `broken` after a failure.
   */
  readonly cable: 'loose' | 'joined' | 'ping' | 'packets' | 'broken';
  /** `faint` with no board; `unknown` until its chip answers; `known` once it did. */
  readonly chip: 'faint' | 'unknown' | 'known';
  /**
   * How much of the image the chip holds, 0 to 100, and what that part is: being written, written, cut short, or
   * written but not started.
   */
  readonly fill?: { readonly pct: number; readonly tone: 'writing' | 'written' | 'failed' | 'waiting' };
  /** Where a failure happened, which says what to look at: the computer, the cable or the board. */
  readonly broken?: 'computer' | 'cable' | 'chip';
  /** Find, Write and Restart. */
  readonly steps: readonly [StepMark, StepMark, StepMark];
  /** The percentage written while the image goes down the cable, which the picture reports as its progress. */
  readonly pct?: number;
  /**
   * What the visitor has to do with their hands, drawn beside the words: hold the BOOT button, or slide the adapter's
   * switch to PROG or to UART.
   */
  readonly hint?: 'boot' | 'prog' | 'uart';
}

const NO_STEPS = ['todo', 'todo', 'todo'] as const;

/** The scene for the session's `state`, with `board` the board the visitor picked, which the hints are for. */
export function flashScene(state: SessionState, board?: BoardModel): FlashScene {
  switch (state.kind) {
    case 'unsupported':
    case 'idle':
      return { cable: 'loose', chip: 'faint', steps: NO_STEPS };
    case 'connecting':
      return { cable: 'ping', chip: 'unknown', steps: ['now', 'todo', 'todo'] };
    case 'settings':
    case 'reading':
    case 'applying':
      return { cable: 'joined', chip: 'known', steps: ['done', 'todo', 'todo'] };
    case 'flashing':
      if (state.pct >= 100) {
        return { cable: 'joined', chip: 'known', fill: { pct: 100, tone: 'written' }, steps: ['done', 'done', 'now'], pct: 100 };
      }
      return {
        cable: 'packets',
        chip: 'known',
        fill: { pct: state.pct, tone: 'writing' },
        steps: ['done', 'now', 'todo'],
        pct: state.pct,
      };
    case 'flashMode':
      return {
        cable: 'joined',
        chip: 'known',
        fill: { pct: 100, tone: 'waiting' },
        steps: ['done', 'done', 'failed'],
        hint: 'uart',
      };
    case 'running':
      if (state.lost) return { cable: 'broken', chip: 'known', broken: 'cable', steps: NO_STEPS };
      return { cable: 'joined', chip: 'known', steps: NO_STEPS };
    case 'noPort':
    case 'portBusy':
      return { cable: 'broken', chip: 'unknown', broken: 'computer', steps: ['failed', 'todo', 'todo'] };
    case 'noAnswer':
      return {
        cable: 'broken',
        chip: 'unknown',
        broken: 'chip',
        steps: ['failed', 'todo', 'todo'],
        hint: board?.flashSwitch ? 'prog' : 'boot',
      };
    case 'noImage':
      return { cable: 'broken', chip: 'known', broken: 'chip', steps: ['done', 'failed', 'todo'] };
    case 'noDownload':
      return { cable: 'broken', chip: 'known', broken: 'computer', steps: ['done', 'failed', 'todo'] };
    case 'dropped':
      return {
        cable: 'broken',
        chip: 'known',
        broken: 'cable',
        fill: { pct: state.pct, tone: 'failed' },
        steps: ['done', 'failed', 'todo'],
      };
  }
}

/** The chip's fill in `FlashPicture`'s drawing for `pct` percent: its top and height inside the chip's body. */
export function chipLevel(pct: number): { y: number; height: number } {
  const height = (44 * Math.min(100, Math.max(0, pct))) / 100;
  return { y: 52 - height, height };
}

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
