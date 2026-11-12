import type { ManifestImage } from '../../lib/flash/manifest';
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
  /** The buttons the card shows, in order, each with the event it sends. */
  actions?: ViewAction[];
  /** The board's output, which the card shows in a terminal; absent for a sketch that prints nothing. */
  output?: ViewOutput;
  /** The links the card shows instead of a button, for a visitor whose browser cannot flash. */
  links?: ViewLink[];
}

export interface ViewAction {
  label: string;
  event: SessionEvent['type'];
}

export interface ViewOutput {
  /** Names the terminal, as `Board output, 9600 baud`. */
  label: string;
  /** The last lines the board printed, oldest first. */
  lines: readonly string[];
}

export interface ViewLink {
  label: string;
  href: string;
}

export interface ViewContext {
  /** The project's title. */
  title: string;
  /** What to do next, shown once the board runs. */
  next?: string;
  /** The speed the sketch prints at; the card shows the board's output when it is set. */
  baud?: number;
  /** The images of the project's sketch, which a visitor whose browser cannot flash downloads. */
  images?: readonly ManifestImage[];
  /** Where the images' part paths are served from, ending in a slash. */
  firmwareUrl?: string;
}

const BUILD_IT_YOURSELF = { label: 'Run it on your board', href: '#run-it-on-your-board' };

function imageLinks(images: readonly ManifestImage[], firmwareUrl: string): ViewLink[] {
  return images.flatMap((image) =>
    image.parts.map((part) => ({
      label: `${image.profile}: ${part.path.split('/').pop()}`,
      href: firmwareUrl + part.path,
    })),
  );
}

/** Maps what the session is doing to what the card shows. */
export function viewFor(state: SessionState, { title, next, baud, images, firmwareUrl }: ViewContext): View {
  switch (state.kind) {
    case 'idle':
      return {
        step: 'connect',
        message: state.released
          ? 'The board is released and keeps running. Connect again to flash it.'
          : 'Plug the board in over USB. This replaces whatever is on the board.',
        actions: [{ label: 'Connect board', event: 'connect' }],
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
      if (state.lost) {
        return {
          step: 'running',
          message: 'The board stopped talking to the page. Plug it back in and connect again.',
          notice: true,
          output: baud === undefined ? undefined : { label: `Board output, ${baud} baud`, lines: state.output },
          actions: [{ label: 'Connect again', event: 'connect' }],
        };
      }
      return {
        step: 'running',
        message: ['Done.', `Your board is running ${title}.`, next].filter(Boolean).join(' '),
        output: baud === undefined ? undefined : { label: `Board output, ${baud} baud`, lines: state.output },
        actions: [
          { label: 'Flash again', event: 'retry' },
          { label: 'Disconnect', event: 'disconnect' },
        ],
      };
    case 'unsupported':
      return {
        step: 'connect',
        message: 'This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.',
        notice: true,
        links: [...imageLinks(images ?? [], firmwareUrl ?? '/firmware/'), BUILD_IT_YOURSELF],
      };
    case 'noPort':
      return failure('No board was chosen. Plug it in and try again.', 'Connect board');
    case 'portBusy':
      return failure(
        'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.',
        'Connect board',
      );
    case 'noAnswer':
      return failure(
        'The board did not answer. Hold its BOOT button and connect again. On an ESP-01S, set the USB adapter to flash mode first.',
        'Connect board',
      );
    case 'noImage':
      return failure(
        `This board is an ${state.chip}. ${title} has images for: ${state.available.join(', ')}.`,
        'Connect another board',
      );
    case 'noDownload':
      return failure('The image did not download. Check your internet connection and try again.', 'Flash again');
    case 'dropped':
      return failure(
        `The connection dropped at ${state.pct}%. Nothing is broken. Plug the board back in and flash again.`,
        'Flash again',
      );
  }
}

/** A failure: the message as a notice, and a button that connects to a board again. */
function failure(message: string, label: string): View {
  return { step: 'connect', message, notice: true, actions: [{ label, event: 'connect' }] };
}
