import type { Flasher, MonitorOptions } from './flasher';
import { keepLast, sketchOf } from './lines';
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
   * The sketch is written, but the board did not start it: an ESP8266 that its adapter keeps in flash mode, which the
   * port cannot restart. The port is released; the visitor takes the adapter out of flash mode, plugs it back in and
   * connects again.
   */
  | { kind: 'flashMode'; chip: string }
  /**
   * `output` is the last lines the board printed, which stay empty when the session has no baud to read at. `lost`
   * is set when the port stopped answering without the visitor disconnecting it.
   */
  | {
      kind: 'running';
      chip: string;
      output: readonly string[];
      lost?: true;
      /**
       * Set when `flash` was refused: the manifest has no image of `key` for the board's chip. The port is not touched.
       */
      flashRefused?: { key: string; available: ChipFamily[] };
    }
  /** Asking the board that runs the sketch for its settings, to open the form at them. */
  | { kind: 'reading'; chip: string }
  /** Sending the settings to the board that runs the sketch, one `cfg` line at a time. */
  | { kind: 'applying'; chip: string }
  /** `awaitingRun` is set when the visitor was reconnecting to a board that came out of flash mode. */
  | { kind: 'noPort'; awaitingRun?: true }
  | { kind: 'portBusy'; awaitingRun?: true }
  | { kind: 'noAnswer'; awaitingRun?: true }
  | { kind: 'noImage'; chip: string; available: ChipFamily[] }
  | { kind: 'noDownload' }
  | { kind: 'dropped'; pct: number };

export type SessionEvent =
  /**
   * From `idle`, a failure or `running`: asks for a port and connects to the board. From `running`, it releases the
   * port first, so "Flash again" flashes in the same click. With `reset`, it flashes nothing and asks for no settings:
   * it restarts the board into the sketch it holds, so the board prints its `sketch <key>` line, and goes to
   * `running`, reading at the session's baud. It is the connection of the workbench, which flashes with `flash`.
   * From `flashMode`, or a failure to connect after it, it asks for a port and reads the board as it runs, without its
   * bootloader, and sends the settings the flash was asked with, if any.
   */
  | { type: 'connect'; reset?: true }
  /**
   * From `running` on a board that is not lost: flashes the sketch that `key` names in the manifest onto the open
   * port, without asking for one, and goes back to `running` with the port open and the board's lines flowing to
   * `subscribeLines`. The sketch's settings are not asked for. The session's `baud` and settings belong to the
   * session's `sketch`, so a flashed key is expected to print at the same baud, as the steps of a ladder do (115200).
   * A key with no image for the board's chip is refused before the port is touched: the session stays `running`
   * with `flashRefused` set.
   */
  | { type: 'flash'; key: string }
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

/** One line the board printed, as `subscribeLines` delivers it. */
export interface BoardLine {
  /** The line without its break; blank, `cfg ` and every other line is delivered. */
  text: string;
  /** When the line arrived, in milliseconds since the epoch. */
  at: number;
}

export interface FlashSession {
  readonly state: SessionState;
  /** Calls `listener` with every state the session enters, and returns a function that stops it. */
  subscribe(listener: (state: SessionState) => void): () => void;
  /**
   * Calls `listener` with every line the board prints while the session reads it, in order: the `cfg ` lines of the
   * settings exchange and the blank lines included, which the `output` of `running` leaves out. Lines keep coming
   * across a flash. Returns a function that stops it.
   */
  subscribeLines(listener: (line: BoardLine) => void): () => void;
  /**
   * Writes `line` and a line break to the board. Rejects while the session is not reading the board: before it
   * connected, while it flashes, once the port is lost or released, or when the sketch has no baud to read at.
   */
  sendLine(line: string): Promise<void>;
  /** Resolves once the event's work has settled: a state that waits for the next event, or a failure. */
  send(event: SessionEvent): Promise<void>;
  /**
   * Points the session at another page's sketch: `manifest`'s images join the ones it knows, so a key it flashed
   * before can be flashed again, and `sketch` and `baud` replace its own for the next connection. A board it reads
   * goes on being read at the speed it was opened at.
   */
  configure(options: Omit<SessionOptions, 'flasher'>): void;
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
/**
 * How long an ESP8266 has to print its `sketch <key>` line after a write. One on an adapter without auto-reset stays in
 * flash mode and prints nothing.
 */
const SKETCH_START_MS = 3000;
/** The chip whose boards are often on an adapter that the port cannot restart: the ESP-01S. */
const RESETLESS_CHIP = 'ESP8266';

/** Whether the session is talking to the board, so that leaving it would leave a write half-done. */
/**
 * Whether the board was written and has yet to be read: in flash mode, or after a failed reconnect from it. It runs what
 * the site flashed, and said so before the port opened.
 */
export function awaitsRun(state: SessionState): boolean {
  return state.kind === 'flashMode' || ('awaitingRun' in state && state.awaitingRun === true);
}

export function isBusy(state: SessionState): boolean {
  return BUSY_KINDS.has(state.kind);
}

function isDownloadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'DownloadError';
}

export function createSession(options: SessionOptions): FlashSession {
  const { flasher } = options;
  let { manifest, sketch, baud } = options;
  const listeners = new Set<(state: SessionState) => void>();
  let state: SessionState = flasher ? { kind: 'idle' } : { kind: 'unsupported' };
  let image: ManifestImage | undefined;
  let lastPct = 0;
  let downloading = false;
  let reading = 0;
  /** The `reading` of the monitor that is reading now; `0` when none is. */
  let live = 0;
  const lineListeners = new Set<(line: BoardLine) => void>();
  let lost = false;
  let output: readonly string[] = [];
  let onReply: ((reply: CfgReply) => void) | undefined;
  let fields = settingsOf(manifest, sketch, baud);
  /** Set from `flashMode` until the board runs again: its chip, and the settings to send it then. */
  let awaitingRun: { chip: string; request?: SettingsRequest } | undefined;

  function enter(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener(next));
  }

  async function connect(active: Flasher, resetOnly?: true) {
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

    if (resetOnly) {
      await restart(active, chip);
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

  /**
   * Restarts the board into the sketch it holds, and reads it. With a baud, the restart comes from the monitor once it
   * reads, so the line the sketch prints first is not missed.
   */
  async function restart(active: Flasher, chip: string) {
    if (baud === undefined) {
      try {
        await active.reset();
      } catch (error) {
        console.error(error);
        await active.disconnect();
        enter({ kind: 'dropped', pct: 0 });
        return;
      }
    }
    output = [];
    enter({ kind: 'running', chip, output });
    if (baud !== undefined) {
      read(active, baud, { restart: true });
    }
  }

  /** Flashes `key` onto the port the running board holds, which it reaches the bootloader of again. */
  async function flashKey(active: Flasher, running: Extract<SessionState, { kind: 'running' }>, key: string) {
    const known = imageFor(manifest, key, running.chip);
    if (isMissing(known)) {
      enter({ kind: 'running', chip: running.chip, output, flashRefused: { key, available: known.available } });
      return;
    }
    reading++;
    enter({ kind: 'connecting' });
    let chip: string;
    try {
      chip = await active.connect({ reusePort: true });
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter({ kind: connectFailure(error) });
      return;
    }
    const found = imageFor(manifest, key, chip);
    if (isMissing(found)) {
      await active.disconnect();
      enter({ kind: 'noImage', chip, available: found.available });
      return;
    }
    image = found;
    await flash(active, chip, undefined, true);
  }

  /**
   * Flashes the board and, with `request`, sends it the settings once it runs the sketch. With `restartWhileReading`,
   * the monitor restarts the board once it reads, instead of a reset before it.
   */
  async function flash(active: Flasher, chip: string, request?: SettingsRequest, restartWhileReading?: true) {
    const restartInMonitor = restartWhileReading && baud !== undefined;
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
      if (!restartInMonitor) {
        await active.reset();
      }
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter({ kind: 'dropped', pct: lastPct });
      return;
    }
    output = [];
    if (chip === RESETLESS_CHIP && baud !== undefined) {
      read(active, baud, restartInMonitor ? { restart: true } : undefined);
      if (!(await sketchStarts())) {
        reading++;
        await active.disconnect();
        awaitingRun = { chip, ...(request && { request }) };
        enter({ kind: 'flashMode', chip });
        return;
      }
      await run(active, chip, request);
      return;
    }
    if (request) {
      read(active, baud!);
      await apply(active, chip, request);
      return;
    }
    enter({ kind: 'running', chip, output });
    if (baud !== undefined) {
      read(active, baud, restartInMonitor ? { restart: true } : undefined);
    }
  }

  /** Goes on with a board that the monitor reads and that runs the sketch: sends it `request`, or shows it running. */
  async function run(active: Flasher, chip: string, request?: SettingsRequest) {
    if (request) {
      await apply(active, chip, request);
      return;
    }
    enter({ kind: 'running', chip, output });
  }

  /** Resolves with whether the board printed a `sketch <key>` line within {@link SKETCH_START_MS}. */
  function sketchStarts(): Promise<boolean> {
    return new Promise((resolve) => {
      const stop = (started: boolean) => {
        clearTimeout(timer);
        lineListeners.delete(listen);
        resolve(started);
      };
      const listen = (line: BoardLine) => {
        if (sketchOf(line.text) !== undefined) stop(true);
      };
      const timer = setTimeout(() => stop(false), SKETCH_START_MS);
      lineListeners.add(listen);
    });
  }

  /** Reads a board that came out of flash mode, through a port opened without its bootloader. */
  async function reattach(active: Flasher, { chip, request }: NonNullable<typeof awaitingRun>) {
    enter({ kind: 'connecting' });
    try {
      await active.attach();
    } catch (error) {
      console.error(error);
      await active.disconnect();
      enter({ kind: connectFailure(error), awaitingRun: true });
      return;
    }
    awaitingRun = undefined;
    output = [];
    if (baud !== undefined) read(active, baud);
    await run(active, chip, request);
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

  function deliver(text: string) {
    const line = { text, at: Date.now() };
    for (const listener of [...lineListeners]) {
      try {
        listener(line);
      } catch (error) {
        // One subscriber must not keep the others, or the settings exchange, from the line.
        console.error(error);
      }
    }
  }

  /**
   * Reads the board until the port is released: hands each `cfg` line to the settings exchange, and shows the other
   * lines while the card is on `running`.
   */
  function read(active: Flasher, speed: number, options?: MonitorOptions) {
    const reader = ++reading;
    live = reader;
    lost = false;
    const markLost = () => {
      if (reader !== reading) {
        return;
      }
      live = 0;
      lost = true;
      if (state.kind === 'running' || (state.kind === 'settings' && state.flashed)) {
        enter({ kind: 'running', chip: state.chip, output, lost: true });
      }
    };
    const onLines = (lines: string[]) => {
      if (reader !== reading) {
        return;
      }
      const printed: string[] = [];
      for (const line of lines) {
        deliver(line);
        if (line.startsWith('cfg ')) {
          const reply = parseCfgLine(line);
          if (reply) onReply?.(reply);
        } else if (line !== '') {
          printed.push(line);
        }
      }
      if (printed.length > 0) {
        output = keepLast(output, printed);
        if (state.kind === 'running') {
          enter({ ...state, output });
        }
      }
    };
    active.monitor(speed, onLines, options).then(markLost, (error) => {
      console.error(error);
      markLost();
    });
  }

  async function release(active: Flasher, released?: true) {
    reading++;
    awaitingRun = undefined;
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
    subscribeLines(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    configure(next) {
      manifest = { sketches: { ...manifest.sketches, ...next.manifest.sketches } };
      sketch = next.sketch;
      baud = next.baud;
      fields = settingsOf(manifest, sketch, baud);
    },
    async sendLine(line) {
      // Only on `running`, so a line cannot interleave with the `cfg` exchange of the settings.
      if (!flasher || state.kind !== 'running' || live === 0 || live !== reading) {
        throw new Error('Not reading the board.');
      }
      await flasher.send(line);
    },
    async send(event) {
      if (!flasher || downloading) {
        return;
      }
      const { kind } = state;
      switch (event.type) {
        case 'connect':
          if (awaitingRun && (kind === 'flashMode' || FAILURE_KINDS.has(kind))) {
            await reattach(flasher, awaitingRun);
          } else if (kind === 'running') {
            reading++;
            // Ignores a second click while the old port is released.
            enter({ kind: 'connecting' });
            await flasher.disconnect();
            await connect(flasher, event.reset);
          } else if (kind === 'idle' || FAILURE_KINDS.has(kind)) {
            await connect(flasher, event.reset);
          }
          break;
        case 'flash':
          if (state.kind === 'running' && !state.lost) {
            await flashKey(flasher, state, event.key);
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
          if (kind === 'settings' || kind === 'running' || kind === 'flashMode' || FAILURE_KINDS.has(kind)) {
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
