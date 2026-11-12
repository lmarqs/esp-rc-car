import type { SessionEvent, SessionState } from '../../lib/flash/session';

/** The card's three steps, in the order the visitor goes through them. */
export const STEPS = ['connect', 'flash', 'running'] as const;
export type Step = (typeof STEPS)[number];

/** What the card shows for one state of the session. */
export interface View {
  /** The step the visitor is on. */
  step: Step;
  message: string;
  /** 0 to 100 when the card shows the progress bar. */
  progress?: number;
  /** Shows `message` as a notice, for a state that is not part of the happy path. */
  notice?: boolean;
  /** The button the card shows, and the event it sends. */
  action?: { label: string; event: SessionEvent['type'] };
}

export interface ViewContext {
  /** The project's title. */
  title: string;
  /** What to do next, shown once the board runs. */
  next?: string;
}

/** Maps what the session is doing to what the card shows. */
export function viewFor(state: SessionState, { title, next }: ViewContext): View {
  switch (state.kind) {
    case 'idle':
      return {
        step: 'connect',
        message: 'Plug the board in over USB. This replaces whatever is on the board.',
        action: { label: 'Connect board', event: 'connect' },
      };
    case 'connecting':
      return { step: 'connect', message: 'Connecting to the board.' };
    case 'settings':
    case 'flashing':
      return {
        step: 'flash',
        message: `Found ${state.chip}`,
        progress: state.kind === 'flashing' ? state.pct : 0,
      };
    case 'running':
      return {
        step: 'running',
        message: [`Your board is running ${title}.`, next].filter(Boolean).join(' '),
        action: { label: 'Flash again', event: 'retry' },
      };
    default:
      return {
        step: 'connect',
        message: state.kind,
        notice: true,
        action: state.kind === 'unsupported' ? undefined : { label: 'Try again', event: 'retry' },
      };
  }
}
