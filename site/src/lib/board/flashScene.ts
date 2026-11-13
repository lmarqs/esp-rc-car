import type { BoardModel } from './models';
import type { SessionState } from '../flash';

/** Where a step of a flash is: not reached, under way, done, or where it failed. */
export type StepMark = 'todo' | 'now' | 'done' | 'failed';

/**
 * What `FlashRail` shows of a flash: its three steps, Find, Write and Restart, and how much of the image went down.
 */
export interface FlashScene {
  /**
   * How much of the image the board holds, 0 to 100, and what that part is: being written, written, cut short, or
   * written but not started.
   */
  readonly fill?: { readonly pct: number; readonly tone: 'writing' | 'written' | 'failed' | 'waiting' };
  /** Find, Write and Restart. */
  readonly steps: readonly [StepMark, StepMark, StepMark];
  /** The percentage written while the image goes down the cable, which the rail reports as its progress. */
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
      return { steps: NO_STEPS };
    case 'connecting':
      return { steps: ['now', 'todo', 'todo'] };
    case 'settings':
    case 'reading':
    case 'applying':
      return { steps: ['done', 'todo', 'todo'] };
    case 'flashing':
      if (state.pct >= 100) {
        return { fill: { pct: 100, tone: 'written' }, steps: ['done', 'done', 'now'], pct: 100 };
      }
      return { fill: { pct: state.pct, tone: 'writing' }, steps: ['done', 'now', 'todo'], pct: state.pct };
    case 'flashMode':
      return { fill: { pct: 100, tone: 'waiting' }, steps: ['done', 'done', 'failed'], hint: 'uart' };
    case 'running':
      // A board that was lost is a board the page can no longer find.
      return { steps: state.lost ? ['failed', 'todo', 'todo'] : NO_STEPS };
    case 'noPort':
    case 'portBusy':
      return { steps: ['failed', 'todo', 'todo'] };
    case 'noAnswer':
      return { steps: ['failed', 'todo', 'todo'], hint: board?.flashSwitch ? 'prog' : 'boot' };
    case 'noImage':
    case 'noDownload':
      return { steps: ['done', 'failed', 'todo'] };
    case 'dropped':
      return { fill: { pct: state.pct, tone: 'failed' }, steps: ['done', 'failed', 'todo'] };
  }
}
