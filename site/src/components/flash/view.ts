import type { ManifestImage, SettingField } from '../../lib/flash/manifest';
import type { SessionEvent, SessionState } from '../../lib/flash/session';
import type { FieldErrors, SettingValues } from '../../lib/flash/settings';
import * as wording from '../../lib/flash/wording';

/** What the card shows for one state of the session: its sketch's settings, or where the board is connected and flashed. */
export interface View {
  message: string;
  /** Shows `message` as a notice, for a state that is not part of the happy path. */
  notice?: boolean;
  /** The button the card shows beside its form or its message, with the event it sends. */
  action?: ViewAction;
  /** The links the card shows, for a visitor whose browser cannot flash. */
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

export interface ViewLink {
  label: string;
  href: string;
}

export interface ViewContext {
  /** The project's title. */
  title: string;
  /** What to do next, shown while the board runs the card's sketch. */
  next?: string;
  /** The images of the project's sketch, which a visitor whose browser cannot flash downloads. */
  images?: readonly ManifestImage[];
  /** Where the images' part paths are served from, ending in a slash. */
  firmwareUrl?: string;
  /** The page that has the section `Run it on your board`, when it is not the page the card is on. */
  detailsHref?: string;
  /** The fields the card asks for; absent or empty when the sketch has none. */
  settings?: readonly SettingField[];
}

/** What the card says whenever its form is not open: the dock connects and flashes the board. */
export const TO_THE_BOARD_BAR = 'Connect and flash it from the board bar below.';

const CHANGE_SETTINGS: ViewAction = { label: 'Change settings', event: 'changeSettings' };

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
  const action: ViewAction = { label: 'Cancel', event: state.flashed ? 'closeSettings' : 'retry' };
  const form: ViewForm = state.flashed
    ? { submit: 'Send these settings', errors: state.errors ?? {}, values: state.opened }
    : {
        submit: 'Flash with these settings',
        errors: state.errors ?? {},
        values: state.opened,
        help: 'Values the board already stores stay unless you change them here.',
      };
  const error = firstError(form.errors, settings);
  if (error) {
    return { message: error, notice: true, form, action };
  }
  if (state.noAnswer) {
    return {
      message: `The board did not list its settings. Check that it runs ${title}, then send them again.`,
      notice: true,
      form,
      action,
    };
  }
  const message = state.flashed
    ? `Your board is running ${title}. Change its settings, then send them.`
    : `Found ${state.chip}. Check the settings, then flash the board.`;
  return { message, form, action };
}

/**
 * Maps what the session is doing to what the card shows. `ownSketch` says whether the session works on the card's
 * sketch, its settings' owner; the card shows the settings, and what the board runs, only for its own.
 */
export function viewFor(
  state: SessionState,
  ownSketch: boolean,
  { title, next, images, firmwareUrl, detailsHref = '', settings = [] }: ViewContext,
): View {
  if (state.kind === 'unsupported') {
    // The dock hides in a browser that cannot reach a board, so the card says what to do instead.
    return {
      message: wording.UNSUPPORTED,
      notice: true,
      links: [...imageLinks(images ?? [], firmwareUrl ?? '/firmware/'), { label: 'Run it on your board', href: detailsHref + BUILD_IT_YOURSELF }],
    };
  }
  if (!ownSketch) return { message: TO_THE_BOARD_BAR };
  switch (state.kind) {
    case 'settings':
      return settingsView(state, title, settings);
    case 'reading':
      return { message: "Reading the board's settings." };
    case 'applying':
      return { message: 'Sending the settings to the board.' };
    case 'running':
      if (state.lost) return { message: TO_THE_BOARD_BAR };
      return {
        message: [`Your board is running ${title}.`, next].filter(Boolean).join(' '),
        ...(settings.length > 0 && { action: CHANGE_SETTINGS }),
      };
    default:
      return { message: TO_THE_BOARD_BAR };
  }
}
