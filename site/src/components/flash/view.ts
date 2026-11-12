import type { ManifestImage, SettingField } from '../../lib/flash/manifest';
import type { SessionEvent, SessionState } from '../../lib/flash/session';
import type { FieldErrors, SettingValues } from '../../lib/flash/settings';
import * as wording from '../../lib/flash/wording';

/** The card's steps, in the order the visitor goes through them. */
export const STEPS = ['connect', 'settings', 'flash', 'running'] as const;
export type Step = (typeof STEPS)[number];

/** The steps of a card: Settings only for a sketch that has some. */
export function stepsFor(hasSettings: boolean): Step[] {
  return STEPS.filter((step) => hasSettings || step !== 'settings');
}

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
  /** The settings form, when the card shows it. */
  form?: ViewForm;
}

export interface ViewForm {
  /** The label of the button that sends the form. */
  submit: string;
  /** What to show beside each field that is wrong, by key. */
  errors: FieldErrors;
  /** The values the form opens with, by key; a new object each time it opens, so the card fills it once. */
  values: SettingValues;
  /** What the form says under its fields about the values it leaves out. */
  help?: string;
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
  /** The page that has the section `Run it on your board`, when it is not the page the card is on. */
  detailsHref?: string;
  /** The fields the card asks for; absent or empty when the sketch has none. */
  settings?: readonly SettingField[];
}

const BUILD_IT_YOURSELF = '#run-it-on-your-board';

function imageLinks(images: readonly ManifestImage[], firmwareUrl: string): ViewLink[] {
  return images.flatMap((image) =>
    image.parts.map((part) => ({
      label: `${image.profile}: ${part.path.split('/').pop()} at 0x${part.offset.toString(16)}`,
      href: firmwareUrl + part.path,
    })),
  );
}

/** The first field in form order that has an error, as `Check <label>: <error>`. */
function firstError(errors: FieldErrors, settings: readonly SettingField[]): string | undefined {
  const field = settings.find((candidate) => candidate.key in errors);
  return field && `Check ${field.label}: ${errors[field.key]}`;
}

function settingsView(state: Extract<SessionState, { kind: 'settings' }>, title: string, settings: readonly SettingField[]): View {
  const actions: ViewAction[] = [{ label: 'Cancel', event: state.flashed ? 'closeSettings' : 'retry' }];
  const form: ViewForm = state.flashed
    ? { submit: 'Send these settings', errors: state.errors ?? {}, values: state.opened }
    : {
        submit: 'Flash with these settings',
        errors: state.errors ?? {},
        values: state.opened,
        help: 'Values the board already stores stay unless you change them here.',
      };
  const step = state.flashed ? 'running' : 'settings';
  const error = firstError(form.errors, settings);
  if (error) {
    return { step, message: error, notice: true, form, actions };
  }
  if (state.noAnswer) {
    return {
      step,
      message: `The board did not list its settings. Check that it runs ${title}, then send them again.`,
      notice: true,
      form,
      actions,
    };
  }
  const message = state.flashed
    ? `Your board is running ${title}. Change its settings, then send them.`
    : `Found ${state.chip}. Check the settings, then flash the board.`;
  return { step, message, form, actions };
}

/** Maps what the session is doing to what the card shows. */
export function viewFor(
  state: SessionState,
  { title, next, baud, images, firmwareUrl, detailsHref = '', settings = [] }: ViewContext,
): View {
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
      return { step: 'connect', message: wording.CONNECTING };
    case 'settings':
      return settingsView(state, title, settings);
    case 'flashing':
      return { step: 'flash', message: wording.found(state.chip), progress: state.pct };
    case 'reading':
      return { step: 'running', message: "Reading the board's settings." };
    case 'applying':
      return { step: 'running', message: 'Sending the settings to the board.' };
    case 'running':
      if (state.lost) {
        return {
          step: 'running',
          message: wording.LOST,
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
          ...(settings.length > 0 ? [{ label: 'Change settings', event: 'changeSettings' } as const] : []),
          { label: 'Flash again', event: 'connect' },
          { label: 'Disconnect', event: 'disconnect' },
        ],
      };
    case 'unsupported':
      return {
        step: 'connect',
        message: wording.UNSUPPORTED,
        notice: true,
        links: [...imageLinks(images ?? [], firmwareUrl ?? '/firmware/'), { label: 'Run it on your board', href: detailsHref + BUILD_IT_YOURSELF }],
      };
    case 'noPort':
      return failure(wording.NO_PORT, 'Connect board');
    case 'portBusy':
      return failure(wording.PORT_BUSY, 'Connect board');
    case 'noAnswer':
      return failure(wording.NO_ANSWER, 'Connect board');
    case 'noImage':
      return failure(wording.noImage(state, title), 'Connect another board');
    case 'noDownload':
      return failure(`${wording.NO_DOWNLOAD} and try again.`, 'Flash again');
    case 'dropped':
      return failure(`${wording.droppedAt(state.pct)} Plug the board back in and flash again.`, 'Flash again');
  }
}

/** A failure: the message as a notice, and a button that connects to a board again. */
function failure(message: string, label: string): View {
  return { step: 'connect', message, notice: true, actions: [{ label, event: 'connect' }] };
}
