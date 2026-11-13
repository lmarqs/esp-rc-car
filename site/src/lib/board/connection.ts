import { wording, type SessionState } from '../flash';
import type { SessionEvent } from '../flash/session';
import type { Board, OpenedSketch } from './board';
import { flashScene, type FlashScene } from './flashScene';
import { restartConnection, type BoardModel } from './models';
import { nameOf, type SketchNames } from './names';
import type { BoardPick } from './pick';
import { runs, settingsOwner, type BoardRecord } from './record';

/** What the board pane shows in place of the picture while the page talks to the board, or after it failed. */
export interface BoardMessage {
  readonly text: string;
  /** Shown as a notice: a state that is not part of the happy path. */
  readonly notice: boolean;
}

/** What to do after a flash failed: the session let go of the port, and the button tries it all again. */
const RETRY = 'Then press Try again.';

function notice(text: string): BoardMessage {
  return { text, notice: true };
}

/**
 * Why a board of `chip` cannot be flashed with the sketch `key`, named as the site names it, whose images are for the
 * chips `available`, and what to do: use another board, or, on a workbench, pick another step.
 */
function noImageNotice(
  chip: string,
  available: readonly string[],
  key: string | undefined,
  names: SketchNames,
): BoardMessage {
  const name = key === undefined ? { title: 'This sketch', step: false } : nameOf(names, key);
  return notice(`${wording.noImage(chip, available, name.title)} ${wording.otherBoardOrStep(available, name.step)}`);
}

/**
 * The board's message for the session's `state`, or `undefined` when the bar says it all, as while it connects. A missing image
 * names the sketch `tried`, the one last flashed. `board` is the board the visitor picked, which the hints are for.
 */
function boardMessage(
  state: SessionState,
  tried: string | undefined,
  names: SketchNames,
  board: BoardModel | undefined,
): BoardMessage | undefined {
  switch (state.kind) {
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
      return noImageNotice(state.chip, state.available, tried, names);
    case 'noDownload':
      return notice(`${wording.NO_DOWNLOAD}. ${RETRY}`);
    case 'dropped':
      return notice(`${wording.droppedAt(state.pct)} Plug the board back in. ${RETRY}`);
    case 'running':
      return state.lost ? notice(wording.LOST) : undefined;
    default:
      return undefined;
  }
}

/** What a press of the board's button asks of the session. */
export type ConnectionEvent = 'connect' | 'flash';

/** A press of the board's button as the connection did it: a connection, or a flash of the sketch `key`. */
export type Press = { readonly event: 'connect' } | { readonly event: 'flash'; readonly key: string };

/**
 * The board's one button: what it says, and, unless the session works, which icon it wears and what it sends. While
 * the session works, it says what the session does and cannot be pressed.
 */
export type ConnectionAction =
  | {
      /** The button's word. */
      readonly label: string;
      readonly icon: 'plug' | 'bolt' | 'again';
      /**
       * `connect` restarts the board into the sketch it holds and reads it, and writes nothing; `flash` writes the
       * opened sketch, on the port of a running board or once a new connection answers. Only an action labelled Flash
       * sends `flash`, and Try again repeats the visitor's last press.
       */
      readonly event: ConnectionEvent;
      readonly disabled: false;
    }
  | { readonly label: string; readonly disabled: true };

/**
 * What the page does with the board, in a word, such as `Flashing…`; `undefined` while it does nothing the visitor
 * waits on, which includes the board's settings: their card shows them, and the next step is the visitor's.
 */
export function busyWord(state: SessionState): string | undefined {
  switch (state.kind) {
    case 'connecting':
      return 'Connecting…';
    case 'flashing':
      return 'Flashing…';
    default:
      return undefined;
  }
}

/** Whether the session reads, waits on or sends the board's settings, which the card of their sketch shows. */
export function onSettings(
  state: SessionState,
): state is Extract<SessionState, { kind: 'settings' | 'reading' | 'applying' }> {
  return state.kind === 'settings' || state.kind === 'reading' || state.kind === 'applying';
}

/** What {@link connectionView} reads: the session, what the site knows of the board and what the visitor has done. */
export interface ConnectionInput {
  readonly state: SessionState;
  readonly record: BoardRecord;
  /** The sketch the page has open; `undefined` on a page with none, which only connects. */
  readonly opened: OpenedSketch | undefined;
  /** The board the visitor picked, which the hints are for. */
  readonly pick: BoardModel | undefined;
  /** The visitor's last press of the button, which Try again repeats after a failure. */
  readonly lastPress: Press | undefined;
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
  /**
   * Whether the dock offers Restart board: while the site reads a board the port can restart, which a board on a flash
   * switch's adapter is not.
   */
  readonly restart: boolean;
  /** Whether the serial monitor can send a line: only while the site reads a board that is not busy. */
  readonly canSend: boolean;
}

/** What the board dock shows for the visitor's board. */
export interface ConnectionView {
  readonly bar: DockBar;
  /** The dock's main button; absent when there is nothing to press. */
  readonly action?: ConnectionAction;
  /** Connect board, or Connect again, the dock's round plug: present while no board is read and none is being read. */
  readonly connect?: ConnectionAction;
  /**
   * What the dock's panel says, which opens it: while the session writes, waits in flash mode or on the board's
   * settings, failed, lost or refused. Absent while the bar says it all, as while the session connects.
   */
  readonly panel?: BoardMessage;
  readonly scene: FlashScene;
}

/** The failures a press may get past: the visitor fixes what the message says, then presses again. */
const RETRYABLE: ReadonlySet<SessionState['kind']> = new Set(['noPort', 'portBusy', 'noAnswer', 'noDownload', 'dropped']);

/** The session's refusal to flash `opened`, which the dock shows only while the page still has that sketch open. */
function refusalOf(state: SessionState, opened: OpenedSketch | undefined, names: SketchNames): BoardMessage | undefined {
  if (state.kind !== 'running' || state.flashRefused === undefined) return undefined;
  const { key, available } = state.flashRefused;
  return key === opened?.use.sketch ? noImageNotice(state.chip, available, key, names) : undefined;
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
  const key = settingsOwner(record);
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
  // A sketch with a page of its own on the site is named; any other is the page's that asked for its settings.
  const name = key === undefined ? undefined : nameOf(names, key);
  return {
    text: name?.path
      ? `Your board waits on the settings of ${name.title}. Go back to its page to finish them, or press Disconnect.`
      : 'Your board waits on its settings. Go back to the page that asked for them, or press Disconnect.',
    notice: false,
  };
}

/**
 * What writes `opened` onto the board the session holds as `state`: a connection, which flashes once the board
 * answers, after a failure with a single request for the port, which the browser grants only on the visitor's press;
 * or a flash on the open port of a running board, unless the sketch has settings the board does not hold yet. Then it
 * connects anew, which opens the settings form before the write, so a sketch such as a hotspot never starts with its
 * default password unasked.
 */
function flashEvent(state: SessionState, opened: OpenedSketch, record: BoardRecord): SessionEvent {
  const running = state.kind === 'running' && !state.lost;
  if (!running || (opened.settings && runs(record) !== opened.use.sketch)) return { type: 'connect' };
  return { type: 'flash', key: opened.use.sketch };
}


function actionFor(
  state: SessionState,
  opened: OpenedSketch | undefined,
  title: string,
  lastPress: Press | undefined,
): ConnectionAction | undefined {
  const flash: ConnectionAction | undefined =
    opened === undefined || opened.imageless
      ? undefined
      : { label: `Flash ${title}`, icon: 'bolt', event: 'flash', disabled: false };
  // During the settings, the form in their card is the action.
  if (state.kind === 'unsupported' || onSettings(state)) return undefined;
  if (RETRYABLE.has(state.kind)) {
    return { label: 'Try again', icon: 'again', event: lastPress?.event ?? 'connect', disabled: false };
  }
  const busy = busyWord(state);
  if (busy !== undefined) return { label: busy, disabled: true };
  switch (state.kind) {
    case 'idle':
      return flash;
    case 'running':
      return state.lost ? undefined : flash;
    default:
      return undefined;
  }
}

/**
 * The round Connect button for the session's `state`: wherever the board can be read and none is, and no Try again or
 * work is under way.
 */
function connectFor(state: SessionState): ConnectionAction | undefined {
  if (state.kind === 'unsupported' || onSettings(state) || RETRYABLE.has(state.kind) || busyWord(state) !== undefined) {
    return undefined;
  }
  const connect = (label: string): ConnectionAction => ({ label, icon: 'plug', event: 'connect', disabled: false });
  switch (state.kind) {
    case 'running':
      return state.lost ? connect('Connect again') : undefined;
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
const UNNAMED_ON_SWITCH = 'is running a sketch. Press reset to name it.';

const NOTHING = { disconnect: false, restart: false, canSend: false } as const;

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
  if (onSettings(state)) {
    // Settings, read or sent: the card that asked for them shows the form and what the board answered, on the page the
    // sketch's name links to. The board stays connected, so Disconnect lets it go from any page.
    const name = nameOfKey(settingsOwner(record));
    const doing =
      name === undefined
        ? { doing: 'is busy with its settings' }
        : { doing: 'is busy with the settings of', sketch: name.title };
    return {
      shown: true,
      connected: true,
      chip: state.chip,
      ...doing,
      ...(name?.path && { path: name.path }),
      disconnect: true,
      restart: false,
      canSend: false,
    };
  }
  switch (state.kind) {
    case 'unsupported':
      return { shown: false, connected: false, chip: '', doing: '', ...NOTHING };
    case 'running': {
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
        restart: !pick?.flashSwitch,
        canSend: true,
      };
    }
    case 'flashing': {
      const title = nameOfKey(record.pending)?.title;
      const writing = title ? { doing: 'is writing', sketch: title } : { doing: 'is writing a sketch' };
      const doing = state.pct >= 100 ? { doing: 'is restarting' } : writing;
      return { shown: true, connected: true, chip: state.chip, ...doing, progress: state.pct, ...NOTHING };
    }
    case 'flashMode':
      return { shown: true, connected: false, chip: state.chip, doing: 'is in flash mode', ...NOTHING };
    case 'connecting':
      return { shown: true, connected: false, chip: 'Board', doing: 'is connecting', ...NOTHING };
    case 'noImage':
      // The session found the chip, then let go of the port: the board is plugged in, but not read.
      return { shown: true, connected: false, chip: state.chip, doing: 'cannot run this sketch', ...NOTHING };
    case 'idle':
      if (state.released) {
        // Disconnect let go of the port, not of the board, which goes on running what it holds.
        const doing = 'is released and runs on.';
        return { shown: true, connected: false, chip: 'Your board', doing, ...NOTHING };
      }
      return noBoard(pick, open);
    case 'noPort':
      return { shown: true, connected: false, chip: 'Board', doing: 'is not chosen.', ...NOTHING };
    case 'portBusy':
      return { shown: true, connected: false, chip: 'Board', doing: 'is busy in another program.', ...NOTHING };
    case 'noAnswer':
      return { shown: true, connected: false, chip: 'Board', doing: 'is silent.', ...NOTHING };
    case 'noDownload':
      return { shown: true, connected: false, chip: 'Sketch', doing: 'is not downloaded.', ...NOTHING };
    case 'dropped':
      return { shown: true, connected: false, chip: 'Board', doing: 'dropped the connection.', ...NOTHING };
    default:
      return noBoard(pick, open);
  }
}

/** The bar with no board read, and how to plug a board in unless the panel is `open` and says it. */
function noBoard(pick: BoardModel | undefined, open: boolean): DockBar {
  const plugIn = pick?.flashSwitch
    ? `yet. Plug in the ${pick.name} on PROG.`
    : 'yet. Plug one in over USB.';
  return { shown: true, connected: false, chip: 'No board', doing: open ? 'yet.' : plugIn, ...NOTHING };
}

/**
 * The board dock for the session's `state`: its bar, its one button, and what its panel says and draws.
 * `record` is what the site knows of the board; `opened` the sketch the page has open, if any; `pick` the board the
 * visitor picked; `lastPress` the visitor's last press, which Try again repeats.
 */
export function connectionView({ state, record, opened, pick, lastPress, names }: ConnectionInput): ConnectionView {
  const title = opened === undefined ? '' : nameOf(names, opened.use.sketch).title;
  // A missing image names the sketch the visitor tried to flash, whichever the page has open by now.
  const tried = lastPress?.event === 'flash' ? lastPress.key : opened?.use.sketch;
  const panel =
    boardMessage(state, tried, names, pick) ??
    refusalOf(state, opened, names) ??
    settingsMessage(state, record, opened, names);
  const action = actionFor(state, opened, title, lastPress);
  const connect = connectFor(state);
  return {
    bar: barFor(state, record, names, pick, panel !== undefined),
    ...(action !== undefined && { action }),
    ...(connect !== undefined && { connect }),
    ...(panel !== undefined && { panel }),
    scene: flashScene(state, pick, lastPress?.event),
  };
}

/** The board's connection as the dock shows it: the view, kept current, and the press of its one button. */
export interface Connection {
  readonly view: ConnectionView;
  /** Calls `listener` after the view may have changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Presses the view's button, unless there is none or the session works: resolves once its work is done. */
  press(): Promise<void>;
  /** Presses Connect board, which reads the board and writes no sketch; nothing while the view offers none. */
  pressConnect(): Promise<void>;
  /**
   * Restarts a running board into the sketch it holds on the port the site reads it on, which stays open; nothing while
   * the bar offers no Restart.
   */
  restart(): Promise<void>;
  /**
   * Lets the board go: a running one, or one whose settings form waits. A settings exchange runs to its end first,
   * since the session takes no event until then.
   */
  disconnect(): Promise<void>;
}

/**
 * The connection of `board`, the site's, for the board the visitor picked, `pick`, with `names` naming the site's
 * sketches. It remembers the visitor's last press, as Try again repeats it.
 */
export function createConnection(board: Board, pick: BoardPick, names: SketchNames): Connection {
  const listeners = new Set<() => void>();
  let lastPress: Press | undefined;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function viewNow(): ConnectionView {
    return connectionView({
      state: board.session.state,
      record: board.record,
      opened: board.opened,
      pick: pick.model,
      lastPress,
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

  board.subscribe(notify);
  pick.subscribe(notify);

  /** Starts `event`'s work; {@link Board.send} first points the session at the opened sketch. */
  async function start(event: ConnectionEvent): Promise<void> {
    const opened = board.opened;
    // A Flash repeated by Try again on a page with nothing to flash only reads the board, as Connect does.
    if (event === 'flash' && opened !== undefined && !opened.imageless) {
      lastPress = { event, key: opened.use.sketch };
      await board.send(flashEvent(board.session.state, opened, board.record));
    } else {
      lastPress = { event: 'connect' };
      await board.send(restartConnection(pick.model));
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
    async pressConnect() {
      if (viewNow().connect === undefined) return;
      await start('connect');
    },
    async restart() {
      if (!viewNow().bar.restart) return;
      await board.send({ type: 'restart' });
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
