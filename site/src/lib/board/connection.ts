import { isBusy, wording, type SessionState } from '../flash';
import type { Board, OpenedSketch } from './board';
import { flashScene, type FlashScene } from './flashScene';
import { restartConnection, type BoardModel } from './models';
import { nameOf, type SketchNames } from './names';
import type { BoardPick } from './pick';
import { runs, type BoardRecord } from './record';

/** What the board pane shows in place of the picture while the page talks to the board, or after it failed. */
export interface BoardMessage {
  readonly text: string;
  /** Shown as a notice: a state that is not part of the happy path. */
  readonly notice: boolean;
}

/** What to do after a flash failed: the session let go of the port, and the button tries it all again. */
const RETRY = 'Then press Try again.';

/** The sketch a missing image names: by `name`, and as a `step` of a workbench when the visitor can pick another. */
export interface NamedSketch {
  readonly name: string;
  readonly step: boolean;
}

/**
 * The board's message for the session's `state`, or `undefined` when the dock shows only the picture. `sketch` is the
 * sketch last flashed, which a missing image names. `showRefusal` keeps the refusal of a sketch with no image for the
 * board on screen; the page drops it once the visitor opens another.
 */
export function boardMessage(
  state: SessionState,
  sketch: NamedSketch,
  showRefusal: boolean,
  board?: BoardModel,
): BoardMessage | undefined {
  const notice = (text: string): BoardMessage => ({ text, notice: true });
  switch (state.kind) {
    case 'connecting':
      return { text: wording.CONNECTING, notice: false };
    case 'flashing':
      return { text: `${wording.found(state.chip)}. Keep the board plugged in.`, notice: false };
    case 'flashMode':
      return notice(wording.FLASH_MODE);
    case 'noPort':
      return notice(wording.NO_PORT);
    case 'portBusy':
      return notice(wording.PORT_BUSY);
    case 'noAnswer':
      return notice(wording.noAnswer(board));
    case 'noImage':
      return notice(`${wording.noImage(state, sketch.name)} ${wording.otherBoardOrStep(state.available, sketch.step)}`);
    case 'noDownload':
      return notice(`${wording.NO_DOWNLOAD}. ${RETRY}`);
    case 'dropped':
      return notice(`${wording.droppedAt(state.pct)} Plug the board back in. ${RETRY}`);
    case 'running':
      if (state.lost) return notice(wording.LOST);
      if (state.flashRefused !== undefined && showRefusal) {
        const { available } = state.flashRefused;
        const why = wording.noImage({ kind: 'noImage', chip: state.chip, available }, sketch.name);
        return notice(`${why} ${wording.otherBoardOrStep(available, sketch.step)}`);
      }
      return undefined;
    default:
      return undefined;
  }
}

/** What a press of the board's button asks of the session. */
export type ConnectionEvent = 'connect' | 'flash' | 'retry';

/** The board's one button: what it says, which icon it wears, what it sends and whether it can be pressed. */
export interface ConnectionAction {
  /** The button's word. */
  readonly label: string;
  readonly icon: 'plug' | 'bolt' | 'again';
  /**
   * `connect` connects to a board; `flash` flashes the opened sketch onto the connected one; `retry` does both, after a
   * flash failed and the session let go of the port.
   */
  readonly event: ConnectionEvent;
  /** Set while the session works on the last press. */
  readonly disabled: boolean;
}

/** What {@link connectionView} reads: the session, what the site knows of the board and what the visitor has done. */
export interface ConnectionInput {
  readonly state: SessionState;
  readonly record: BoardRecord;
  /** The sketch the page has open; `undefined` on a page with none, which only connects. */
  readonly opened: OpenedSketch | undefined;
  /** The board the visitor picked, which the hints are for. */
  readonly pick: BoardModel | undefined;
  /** What the visitor pressed while the session works on it, which names that work. */
  readonly pressed?: ConnectionEvent;
  /** The press whose work the session last finished, as Try again repeats it after a failure. */
  readonly tried?: ConnectionEvent;
  /** The site's sketches by key, which name the opened sketch and the one whose settings the session waits on. */
  readonly names: SketchNames;
}

/** What the dock's bar says of the visitor's board. */
export interface DockBar {
  /** Whether the dock shows at all: not in a browser that cannot reach a board. */
  readonly shown: boolean;
  /** Whether the site reads a board, which lights the dock's dot. */
  readonly connected: boolean;
  /** The board's chip, such as `ESP32`, or what the dock says in its place: the subject of what it does. */
  readonly chip: string;
  /** What the board does, or what the visitor does next, in words that follow the chip, such as `is running`. */
  readonly doing: string;
  /** The sketch the board runs or is written with, named after `doing`. */
  readonly sketch?: string;
  /** The page of the project whose sketch the board runs, which `sketch` links to. */
  readonly path?: string;
  /** The last line the board printed, shown in the Serial button that opens the rest. */
  readonly last?: string;
  /** The flash's percentage while one writes. */
  readonly progress?: number;
  /** Whether the dock offers Disconnect: while the site reads a board, or holds one for its settings. */
  readonly disconnect: boolean;
  /** Whether the serial monitor can send a line: only while the site reads a board that is not busy. */
  readonly canSend: boolean;
}

/** What the board dock shows for the visitor's board. */
export interface ConnectionView {
  readonly bar: DockBar;
  /** The dock's one button; absent when there is nothing to press. */
  readonly action?: ConnectionAction;
  /**
   * What the dock's panel says, which opens it: while the session works, waits in flash mode, failed, lost or refused.
   * Absent while the dock shows only its bar.
   */
  readonly panel?: BoardMessage;
  readonly scene: FlashScene;
}

/** The failures a press may get past: the visitor fixes what the message says, then presses again. */
const RETRYABLE: ReadonlySet<SessionState['kind']> = new Set(['noPort', 'portBusy', 'noAnswer', 'noDownload', 'dropped']);

const ICONS: Readonly<Record<ConnectionEvent, ConnectionAction['icon']>> = {
  connect: 'plug',
  flash: 'bolt',
  retry: 'again',
};

/** The session's refusal to flash `opened`, which the dock shows only while the page still has that sketch open. */
function showsRefusal(state: SessionState, opened: OpenedSketch | undefined): boolean {
  return state.kind === 'running' && state.flashRefused !== undefined && state.flashRefused.key === opened?.use.sketch;
}

/** Whether the session reads, waits on or sends the board's settings, which the card of their sketch shows. */
function onSettings(state: SessionState): state is Extract<SessionState, { kind: 'settings' | 'reading' | 'applying' }> {
  return state.kind === 'settings' || state.kind === 'reading' || state.kind === 'applying';
}

/**
 * Where the settings the session works on are: in the card of `opened` on this page, or on the page of the sketch they
 * belong to, the one the session flashes or the board runs. Away from the card, Disconnect lets the board go.
 */
function settingsMessage(
  state: SessionState,
  record: BoardRecord,
  opened: OpenedSketch | undefined,
  names: SketchNames,
): BoardMessage | undefined {
  if (!onSettings(state)) return undefined;
  const key = record.pending ?? runs(record);
  const own = key !== undefined && opened?.use.sketch === key ? nameOf(names, key) : undefined;
  if (own !== undefined && !own.step) {
    const card = `The ${own.title} card on this page`;
    switch (state.kind) {
      case 'settings': {
        const then = state.flashed ? 'send them' : 'flash the board';
        return { text: `${card} asks for the settings. Check them, then ${then}.`, notice: false };
      }
      case 'reading':
        return { text: `${card} is reading the board's settings.`, notice: false };
      case 'applying':
        return { text: `${card} is sending the settings to the board.`, notice: false };
    }
  }
  const title = key !== undefined && Object.hasOwn(names, key) ? names[key]!.title : undefined;
  return {
    text:
      title === undefined
        ? 'Your board waits on its settings. Go back to the page that asked for them, or press Disconnect.'
        : `Your board waits on the settings of ${title}. Go back to its page to finish them, or press Disconnect.`,
    notice: false,
  };
}

/**
 * The press that flashes `opened` onto a running board: a flash on the open port, unless the sketch has settings the
 * board does not hold yet. Then it connects anew, which opens the settings form before the write, so a sketch such as
 * a hotspot never starts with its default password unasked.
 */
function flashFromRunning(opened: OpenedSketch, record: BoardRecord): ConnectionEvent {
  return opened.settings && runs(record) !== opened.use.sketch ? 'connect' : 'flash';
}

function actionFor(
  state: SessionState,
  record: BoardRecord,
  opened: OpenedSketch | undefined,
  title: string,
  pressed: ConnectionEvent | undefined,
  tried: ConnectionEvent | undefined,
): ConnectionAction | undefined {
  const flash = (event: ConnectionEvent): ConnectionAction | undefined =>
    opened === undefined || opened.imageless
      ? undefined
      : { label: `Flash ${title}`, icon: 'bolt', event, disabled: false };
  const connect = (label: string): ConnectionAction => ({ label, icon: 'plug', event: 'connect', disabled: false });
  if (state.kind === 'unsupported') return undefined;
  if (RETRYABLE.has(state.kind)) {
    // A flash that failed is tried again in one press: the connection, then the flash.
    const event = tried === 'flash' || tried === 'retry' ? 'retry' : 'connect';
    return { label: 'Try again', icon: 'again', event, disabled: false };
  }
  if (isBusy(state)) {
    // A press made elsewhere leaves `pressed` unset: what the session does names it.
    const event = pressed ?? (state.kind === 'flashing' ? 'flash' : 'connect');
    // A connection with a sketch open, and Try again, flash once connected: once the session writes, the button says so.
    const flashing = event === 'flash' || state.kind === 'flashing';
    return { label: flashing ? 'Flashing…' : 'Connecting…', icon: ICONS[event], event, disabled: true };
  }
  switch (state.kind) {
    case 'idle':
      return flash('connect') ?? connect('Connect board');
    case 'running':
      if (state.lost) return connect('Connect again');
      return opened === undefined ? undefined : flash(flashFromRunning(opened, record));
    case 'flashMode':
      return connect('Connect again');
    default:
      return connect('Connect board');
  }
}

/**
 * A flash-switch board is reached without a restart, so it never printed its `sketch <key>` line; the reset button
 * on its adapter restarts it, and it prints the line as it starts.
 */
const UNNAMED_ON_SWITCH = 'is running a sketch. Press reset on its adapter to name it.';

const NOTHING = { disconnect: false, canSend: false } as const;

/**
 * The dock's bar for the session's `state`, the `record` of the board and the board the visitor picked, `pick`. While
 * the panel is `open`, the bar names the state only: what to do is the panel's to say.
 */
function barFor(
  state: SessionState,
  record: BoardRecord,
  names: SketchNames,
  pick: BoardModel | undefined,
  open: boolean,
): DockBar {
  const nameOfKey = (key: string | undefined) => (key === undefined ? undefined : nameOf(names, key));
  if (state.kind === 'unsupported') {
    return { shown: false, connected: false, chip: '', doing: '', ...NOTHING };
  }
  if (state.kind === 'running') {
    if (state.lost) {
      return { shown: true, connected: false, chip: state.chip, doing: 'lost the connection', ...NOTHING };
    }
    const name = nameOfKey(runs(record));
    const last = record.lines.findLast((line) => !line.sent)?.text;
    return {
      shown: true,
      connected: true,
      chip: state.chip,
      doing: name !== undefined ? 'is running' : pick?.flashSwitch ? UNNAMED_ON_SWITCH : 'is running a sketch',
      ...(name !== undefined && { sketch: name.title }),
      ...(name?.path && { path: name.path }),
      ...(last !== undefined && { last }),
      disconnect: true,
      canSend: true,
    };
  }
  if (state.kind === 'flashing') {
    const title = nameOfKey(record.pending)?.title;
    const writing = title ? { doing: 'is writing', sketch: title } : { doing: 'is writing a sketch' };
    const doing = state.pct >= 100 ? { doing: 'is restarting' } : writing;
    return { shown: true, connected: true, chip: state.chip, ...doing, progress: state.pct, ...NOTHING };
  }
  if (state.kind === 'flashMode') {
    return { shown: true, connected: false, chip: state.chip, doing: 'is in flash mode', ...NOTHING };
  }
  if (state.kind === 'connecting') {
    return { shown: true, connected: false, chip: 'Board', doing: 'is connecting', ...NOTHING };
  }
  if (isBusy(state)) {
    // Settings, read or sent: the card that asked for them shows the form and what the board answered, on the page the
    // sketch's name links to. The board stays connected, so Disconnect lets it go from any page.
    const chip = 'chip' in state ? state.chip : 'Board';
    const name = nameOfKey(record.pending ?? runs(record));
    const doing =
      name === undefined
        ? { doing: 'is busy with its settings' }
        : { doing: 'is busy with the settings of', sketch: name.title };
    return {
      shown: true,
      connected: true,
      chip,
      ...doing,
      ...(name?.path && { path: name.path }),
      disconnect: true,
      canSend: false,
    };
  }
  // One line, beside the buttons: how to plug a board in, unless the panel says what to do.
  const plugIn = pick?.flashSwitch
    ? `is connected. Plug the ${pick.name} in with its adapter set to PROG.`
    : 'is connected. Plug one in over USB.';
  return { shown: true, connected: false, chip: 'No board', doing: open ? 'is connected.' : plugIn, ...NOTHING };
}

/**
 * The board dock for the session's `state`: its bar, its one button, and what its panel says and draws.
 * `record` is what the site knows of the board; `opened` the sketch the page has open, if any; `pick` the board the
 * visitor picked. `pressed` and `tried` are the last press made while the session worked and the press whose work
 * ended in the session's failure, which Try again repeats.
 */
export function connectionView({ state, record, opened, pick, pressed, tried, names }: ConnectionInput): ConnectionView {
  const refusal = showsRefusal(state, opened);
  const name = opened && nameOf(names, opened.use.sketch);
  const sketch = { name: name?.title ?? record.pending ?? 'This sketch', step: name?.step === true };
  const panel = boardMessage(state, sketch, refusal, pick) ?? settingsMessage(state, record, opened, names);
  const action = actionFor(state, record, opened, sketch.name, pressed, tried);
  return {
    bar: barFor(state, record, names, pick, panel !== undefined),
    ...(action !== undefined && { action }),
    ...(panel !== undefined && { panel }),
    scene: flashScene(state, pick),
  };
}

/** The board's connection as the dock shows it: the view, kept current, and the press of its one button. */
export interface Connection {
  readonly view: ConnectionView;
  /** Calls `listener` after the view may have changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Presses the view's button, unless there is none or the session works: resolves once its work is done. */
  press(): Promise<void>;
  /**
   * Lets the board go: a running one, or one whose settings form waits. A settings exchange runs to its end first,
   * since the session takes no event until then.
   */
  disconnect(): Promise<void>;
}

/**
 * The connection of `board`, the site's, for the board the visitor picked, `pick`, with `names` naming the site's
 * sketches. It remembers what the visitor pressed while the session works on it, and the press whose work last ended,
 * as Try again repeats it.
 */
export function createConnection(board: Board, pick: BoardPick, names: SketchNames): Connection {
  const listeners = new Set<() => void>();
  let state = board.session.state;
  let pressed: ConnectionEvent | undefined;
  let tried: ConnectionEvent | undefined;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function viewNow(): ConnectionView {
    return connectionView({
      state: board.session.state,
      record: board.record,
      opened: board.opened,
      pick: pick.model,
      ...(pressed !== undefined && { pressed }),
      ...(tried !== undefined && { tried }),
      names,
    });
  }

  /** Resolves once the session no longer reads or sends the board's settings. */
  function exchanged(): Promise<void> {
    const exchanging = () => board.session.state.kind === 'reading' || board.session.state.kind === 'applying';
    return new Promise((resolve) => {
      if (!exchanging()) return resolve();
      const stop = board.subscribe(() => {
        if (exchanging()) return;
        stop();
        resolve();
      });
    });
  }

  board.subscribe(() => {
    const next = board.session.state;
    if (next !== state) {
      const busy = isBusy(next);
      // Once the session is done with the press, a press elsewhere, such as the workbench's, names its work.
      tried = busy || !isBusy(state) ? tried : pressed;
      pressed = busy ? pressed : undefined;
      state = next;
    }
    notify();
  });
  pick.subscribe(notify);

  /** Starts `event`'s work; {@link Board.send} first points the session at the opened sketch. */
  async function start(event: ConnectionEvent): Promise<void> {
    pressed = event;
    notify();
    const opened = board.opened;
    switch (event) {
      case 'connect':
        // A connection that is not a restart flashes the opened sketch; with none, the session's sketch is another
        // page's, and with one the page has no image of, nothing can be flashed: the board is only restarted and read.
        return board.send(opened?.imageless === false ? { type: 'connect' } : restartConnection(pick.model));
      case 'flash':
        if (opened !== undefined) await board.send({ type: 'flash', key: opened.use.sketch });
        return;
      case 'retry': {
        await board.send(restartConnection(pick.model));
        // The sketch open now may be another page's, with settings: it is flashed as from any running board.
        const now = board.opened;
        if (board.session.state.kind === 'running' && !board.session.state.lost && now?.imageless === false) {
          await start(flashFromRunning(now, board.record));
        }
      }
    }
  }

  return {
    get view() {
      return viewNow();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async press() {
      const { action } = viewNow();
      if (action === undefined || action.disabled) return;
      await start(action.event);
    },
    async disconnect() {
      await exchanged();
      const { kind } = board.session.state;
      if (kind === 'running') await board.send({ type: 'disconnect' });
      // The session releases the port from the form on retry, as the card's Cancel before a flash does.
      else if (kind === 'settings') await board.send({ type: 'retry' });
    },
  };
}
