import type { Flasher } from './flasher';
import { keepLast } from './lines';
import { imageFor, isMissing, type ChipFamily, type Manifest, type ManifestImage } from './manifest';
import {
  boardValues,
  changedValues,
  defaultValues,
  NO_ANSWER,
  parseCfgLine,
  refusalText,
  sendOrder,
  settingsOf,
  validate,
  type CfgReply,
  type FieldErrors,
  type SettingValues,
} from './settings';

export type SessionState =
  | { kind: 'unsupported' }
  /** `released` is set once the visitor disconnected a running board, which goes on running its sketch. */
  | { kind: 'idle'; released?: true }
  | { kind: 'connecting' }
  /**
   * The form of the sketch's settings. `opened` holds the values it opened with: the defaults before a flash, and what
   * the board lists once it runs the sketch. `flashed` is set once the board runs the sketch, so submitting it sends
   * the values without flashing. `errors` holds what is wrong with each value, found by the page or refused by the
   * board; `noAnswer` is set when the board did not list its settings.
   */
  | {
      kind: 'settings';
      chip: string;
      opened: SettingValues;
      flashed?: true;
      errors?: FieldErrors;
      noAnswer?: true;
    }
  | { kind: 'flashing'; chip: string; pct: number }
  /**
   * `output` is the last lines the board printed, which stay empty when the session has no baud to read at. `lost`
   * is set when the port stopped answering without the visitor disconnecting it.
   */
  | { kind: 'running'; chip: string; output: readonly string[]; lost?: true }
  /** Asking the board that runs the sketch for its settings, to open the form at them. */
  | { kind: 'reading'; chip: string }
  /** Sending the settings to the board that runs the sketch, one `cfg` line at a time. */
  | { kind: 'applying'; chip: string }
  | { kind: 'noPort' }
  | { kind: 'portBusy' }
  | { kind: 'noAnswer' }
  | { kind: 'noImage'; chip: string; available: ChipFamily[] }
  | { kind: 'noDownload' }
  | { kind: 'dropped'; pct: number };

export type SessionEvent =
  /**
   * From `idle`, a failure or `running`: asks for a port and connects to the board. From `running`, it releases the
   * port first, so "Flash again" flashes in the same click.
   */
  | { type: 'connect' }
  /**
   * From `settings`: checks the values against their limits, flashes the board unless it already runs the sketch,
   * then sends the board each value the visitor changed that differs from what it holds. `restoreDefaults`, from "Use
   * the defaults", sends every default that differs from what the board holds, and puts the default back over each
   * password the board stores.
   */
  | { type: 'submitSettings'; values: SettingValues; restoreDefaults?: boolean }
  /**
   * From `running`, for a sketch with settings: asks the board for its settings and reopens the form at them, to send
   * values without flashing.
   */
  | { type: 'changeSettings' }
  /** From the form a running board reopened: returns to `running` and sends nothing. */
  | { type: 'closeSettings' }
  /** From a failure, `settings` or `running`: releases the port and returns to `idle`. */
  | { type: 'retry' }
  /** From `running`: releases the port and returns to `idle`. */
  | { type: 'disconnect' };

export interface SessionOptions {
  /** The flasher to use, or `null` in a browser that cannot reach a USB board. */
  flasher: Flasher | null;
  manifest: Manifest;
  sketch: string;
  /**
   * The speed the sketch prints at. Absent when the sketch prints nothing, and then the session reads nothing and
   * asks for no settings, which the board answers on that port.
   */
  baud?: number;
}

export interface FlashSession {
  readonly state: SessionState;
  /** Calls `listener` with every state the session enters, and returns a function that stops it. */
  subscribe(listener: (state: SessionState) => void): () => void;
  /** Resolves once the event's work has settled: a state that waits for the next event, or a failure. */
  send(event: SessionEvent): Promise<void>;
}

type SettingsRequest = Omit<Extract<SessionEvent, { type: 'submitSettings' }>, 'type'> & { opened: SettingValues };

type Failure = Extract<SessionState['kind'], 'noPort' | 'portBusy' | 'noAnswer'>;

const FAILURE_KINDS: ReadonlySet<SessionState['kind']> = new Set([
  'noPort',
  'portBusy',
  'noAnswer',
  'noImage',
  'noDownload',
  'dropped',
]);

/**
 * Web Serial rejects `requestPort` with `NotFoundError` when the visitor closes the picker and `SecurityError` when
 * they deny the permission, and `open` with `InvalidStateError` when the port is already open or `NetworkError` when
 * the system refuses it. Anything else that
 * stops the connection, such as esptool-js failing to sync with the ROM bootloader, means the board stayed silent.
 */
function connectFailure(error: unknown): Failure {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  if (name === 'NotFoundError' || name === 'SecurityError') {
    return 'noPort';
  }
  if (name === 'InvalidStateError' || name === 'NetworkError') {
    return 'portBusy';
  }
  return 'noAnswer';
}

const BUSY_KINDS: ReadonlySet<SessionState['kind']> = new Set([
  'connecting',
  'settings',
  'flashing',
  'reading',
  'applying',
]);

/** `cfg get` is sent this often, as many times, until the board lists its settings; it may still be starting. */
const GET_INTERVAL_MS = 1000;
const GET_TRIES = 10;
/** How long the board has to answer one `cfg set`. */
const SET_TIMEOUT_MS = 3000;

/** Whether the session is talking to the board, so that leaving it would leave a write half-done. */
export function isBusy(state: SessionState): boolean {
  return BUSY_KINDS.has(state.kind);
}

function isDownloadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'DownloadError';
}

export function createSession({ flasher, manifest, sketch, baud }: SessionOptions): FlashSession {
  const listeners = new Set<(state: SessionState) => void>();
  let state: SessionState = flasher ? { kind: 'idle' } : { kind: 'unsupported' };
  let image: ManifestImage | undefined;
  let lastPct = 0;
  let downloading = false;
  let reading = 0;
  let lost = false;
  let output: readonly string[] = [];
  let onReply: ((reply: CfgReply) => void) | undefined;
  const fields = settingsOf(manifest, sketch, baud);

  function enter(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener(next));
  }

  async function connect(active: Flasher) {
    enter({ kind: 'connecting' });
    let chip: string;
    try {
      chip = await active.connect();
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter({ kind: connectFailure(error) });
      return;
    }

    const found = imageFor(manifest, sketch, chip);
    if (isMissing(found)) {
      await active.disconnect();
      enter({ kind: 'noImage', chip, available: found.available });
      return;
    }
    image = found;

    if (fields.length > 0) {
      enter({ kind: 'settings', chip, opened: defaultValues(fields) });
      return;
    }
    await flash(active, chip);
  }

  /** Flashes the board and, with `request`, sends it the settings once it runs the sketch. */
  async function flash(active: Flasher, chip: string, request?: SettingsRequest) {
    downloading = true;
    if (request) {
      // Replaces the form, which the download would otherwise leave on screen and unanswered.
      enter({ kind: 'flashing', chip, pct: 0 });
    }
    try {
      await active.load(image!.parts);
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter(isDownloadError(error) ? { kind: 'noDownload' } : { kind: 'dropped', pct: 0 });
      return;
    } finally {
      downloading = false;
    }

    lastPct = 0;
    if (state.kind !== 'flashing') {
      enter({ kind: 'flashing', chip, pct: 0 });
    }
    try {
      await active.write(image!.parts, (pct) => {
        const clamped = Math.min(100, Math.max(0, Math.floor(pct)));
        if (clamped > lastPct) {
          lastPct = clamped;
          enter({ kind: 'flashing', chip, pct: clamped });
        }
      });
      await active.reset();
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter({ kind: 'dropped', pct: lastPct });
      return;
    }
    output = [];
    if (request) {
      read(active, baud!);
      await apply(active, chip, request);
      return;
    }
    enter({ kind: 'running', chip, output });
    if (baud !== undefined) {
      read(active, baud);
    }
  }

  async function submit(
    active: Flasher,
    form: Extract<SessionState, { kind: 'settings' }>,
    event: Omit<SettingsRequest, 'opened'>,
  ) {
    const errors = validate(fields, event.values);
    if (Object.keys(errors).length > 0) {
      enter({ kind: 'settings', chip: form.chip, opened: form.opened, ...(form.flashed && { flashed: true }), errors });
      return;
    }
    const request = { ...event, opened: form.opened };
    if (form.flashed) {
      await apply(active, form.chip, request);
    } else {
      await flash(active, form.chip, request);
    }
  }

  /** Opens the form of a board that runs the sketch at the values it lists. */
  async function reopen(active: Flasher, chip: string) {
    enter({ kind: 'reading', chip });
    const board = await readBoard(active);
    if (lost) {
      enter({ kind: 'running', chip, output, lost: true });
    } else if (!board) {
      enter({ kind: 'settings', chip, opened: defaultValues(fields), flashed: true, noAnswer: true });
    } else {
      enter({ kind: 'settings', chip, opened: boardValues(fields, board), flashed: true });
    }
  }

  /**
   * Sends `line` and waits up to `timeout` for the reply that `isLast` accepts, handing it every `cfg` reply until
   * then. Resolves with that reply, or `undefined` when none came in time.
   */
  function exchange(active: Flasher, line: string, isLast: (reply: CfgReply) => boolean, timeout: number) {
    return new Promise<CfgReply | undefined>((resolve) => {
      const finish = (reply?: CfgReply) => {
        clearTimeout(timer);
        onReply = undefined;
        resolve(reply);
      };
      const timer = setTimeout(finish, timeout);
      onReply = (reply) => {
        if (isLast(reply)) finish(reply);
      };
      // A line the port refuses gets no reply, which the timeout reports.
      active.send(line).catch(() => {});
    });
  }

  /**
   * The values the board's next boot uses, by key, as `cfg get` lists them; `undefined` when it never does. A list
   * that misses a field, such as one whose start answered an earlier `cfg get`, is asked for again.
   */
  async function readBoard(active: Flasher): Promise<Record<string, string> | undefined> {
    for (let attempt = 0; attempt < GET_TRIES && !lost; attempt++) {
      const listed: Record<string, string> = {};
      const end = await exchange(
        active,
        'cfg get',
        (reply) => {
          if (reply.kind === 'value') listed[reply.key] = reply.value;
          return reply.kind === 'end' && fields.every((field) => field.key in listed);
        },
        GET_INTERVAL_MS,
      );
      if (end) {
        return listed;
      }
    }
    return undefined;
  }

  /**
   * Sends the board each value `changedValues` picks, one line at a time, and restarts it once every one is
   * accepted. A refused value keeps the visitor on the form, with the board not restarted.
   */
  async function apply(active: Flasher, chip: string, { values, opened, restoreDefaults }: SettingsRequest) {
    enter({ kind: 'applying', chip });
    const board = await readBoard(active);
    if (lost) {
      enter({ kind: 'running', chip, output, lost: true });
      return;
    }
    if (!board) {
      enter({ kind: 'settings', chip, opened, flashed: true, noAnswer: true });
      return;
    }

    const errors: Record<string, string> = {};
    // The order assumed every value of a group is accepted, so after a refusal the rest of the group waits in the form.
    const refusedGroups = new Set<string>();
    const order = sendOrder(fields, changedValues(fields, values, opened, board, restoreDefaults), board);
    for (const [key, value] of order) {
      const field = fields.find((candidate) => candidate.key === key)!;
      if (field.group && refusedGroups.has(field.group)) {
        continue;
      }
      const reply = await exchange(
        active,
        `cfg set ${key} ${value}`,
        (candidate) => (candidate.kind === 'ok' || candidate.kind === 'err') && candidate.key === key,
        SET_TIMEOUT_MS,
      );
      if (lost) {
        enter({ kind: 'running', chip, output, lost: true });
        return;
      }
      if (reply?.kind !== 'ok') {
        errors[key] = refusalText(field, reply?.kind === 'err' ? reply.reason : NO_ANSWER);
        if (field.group) refusedGroups.add(field.group);
      }
    }
    if (Object.keys(errors).length > 0) {
      enter({ kind: 'settings', chip, opened, flashed: true, errors });
      return;
    }
    if (order.length > 0) {
      // The values take effect at the next boot.
      await active.send('cfg restart').catch(() => {});
    }
    enter(lost ? { kind: 'running', chip, output, lost: true } : { kind: 'running', chip, output });
  }

  /**
   * Reads the board until the port is released: hands each `cfg` line to the settings exchange, and shows the other
   * lines while the card is on `running`.
   */
  function read(active: Flasher, speed: number) {
    const reader = ++reading;
    lost = false;
    const markLost = () => {
      if (reader !== reading) {
        return;
      }
      lost = true;
      if (state.kind === 'running' || (state.kind === 'settings' && state.flashed)) {
        enter({ kind: 'running', chip: state.chip, output, lost: true });
      }
    };
    active
      .monitor(speed, (lines) => {
        if (reader !== reading) {
          return;
        }
        const printed: string[] = [];
        for (const line of lines) {
          if (line.startsWith('cfg ')) {
            const reply = parseCfgLine(line);
            if (reply) onReply?.(reply);
          } else {
            printed.push(line);
          }
        }
        if (printed.length > 0) {
          output = keepLast(output, printed);
          if (state.kind === 'running') {
            enter({ ...state, output });
          }
        }
      })
      .then(markLost, (error) => {
        console.error(error);
        markLost();
      });
  }

  async function release(active: Flasher, released?: true) {
    reading++;
    await active.disconnect();
    enter(released ? { kind: 'idle', released } : { kind: 'idle' });
  }

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async send(event) {
      if (!flasher || downloading) {
        return;
      }
      const { kind } = state;
      switch (event.type) {
        case 'connect':
          if (kind === 'running') {
            reading++;
            // Ignores a second click while the old port is released.
            enter({ kind: 'connecting' });
            await flasher.disconnect();
            await connect(flasher);
          } else if (kind === 'idle' || FAILURE_KINDS.has(kind)) {
            await connect(flasher);
          }
          break;
        case 'submitSettings':
          if (state.kind === 'settings') {
            await submit(flasher, state, event);
          }
          break;
        case 'changeSettings':
          if (state.kind === 'running' && !state.lost && fields.length > 0) {
            await reopen(flasher, state.chip);
          }
          break;
        case 'closeSettings':
          if (state.kind === 'settings' && state.flashed) {
            enter({ kind: 'running', chip: state.chip, output });
          }
          break;
        case 'retry':
          if (kind === 'settings' || kind === 'running' || FAILURE_KINDS.has(kind)) {
            await release(flasher);
          }
          break;
        case 'disconnect':
          if (kind === 'running') {
            await release(flasher, true);
          }
          break;
      }
    },
  };
}
