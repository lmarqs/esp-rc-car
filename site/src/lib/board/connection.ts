import { isBusy, wording, type SessionState } from '../flash';
import { settingsOf } from '../flash/settings';
import type { Board } from './board';
import { flashScene, type FlashScene } from './flashScene';
import { restartConnection, type BoardModel } from './models';
import type { SketchName } from './names';
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

/** The sketch the visitor has open on the page, as the board's button names it. */
export interface OpenedSketch {
  readonly key: string;
  readonly title: string;
  /** Set for a step of a workbench, whose page lets the visitor pick another step. */
  readonly step?: boolean;
  /** Set for a sketch with settings, whose form comes before its flash. */
  readonly settings?: boolean;
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
  /** The site's sketches by key, which name the sketch whose settings the session waits on away from its card. */
  readonly names?: Readonly<Record<string, SketchName>>;
}

/** What the board dock shows for the visitor's board. */
export interface ConnectionView {
  /** The dock's one button; absent when there is nothing to press. */
  readonly action?: ConnectionAction;
  readonly message?: BoardMessage;
  readonly scene: FlashScene;
  /** Whether the dock's panel is open: while the session works, waits in flash mode, failed, lost or refused. */
  readonly open: boolean;
}

/** The failures a press may get past: the visitor fixes what the message says, then presses again. */
const RETRYABLE: ReadonlySet<SessionState['kind']> = new Set(['noPort', 'portBusy', 'noAnswer', 'noDownload', 'dropped']);

const FAILED: ReadonlySet<SessionState['kind']> = new Set([...RETRYABLE, 'noImage']);

const ICONS: Readonly<Record<ConnectionEvent, ConnectionAction['icon']>> = {
  connect: 'plug',
  flash: 'bolt',
  retry: 'again',
};

/** The session's refusal to flash `opened`, which the dock shows only while the page still has that sketch open. */
function showsRefusal(state: SessionState, opened: OpenedSketch | undefined): boolean {
  return state.kind === 'running' && state.flashRefused !== undefined && state.flashRefused.key === opened?.key;
}

/**
 * The press that flashes `opened` onto a running board: a flash on the open port, unless the sketch has settings the
 * board does not hold yet. Then it connects anew, which opens the settings form before the write, so a sketch such as
 * a hotspot never starts with its default password unasked.
 */
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
  names: Readonly<Record<string, SketchName>>,
): BoardMessage | undefined {
  if (!onSettings(state)) return undefined;
  const key = record.pending ?? runs(record);
  if (opened !== undefined && opened.step !== true && opened.key === key) {
    const card = `The ${opened.title} card on this page`;
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

function flashFromRunning(opened: OpenedSketch, record: BoardRecord): ConnectionEvent {
  return opened.settings === true && runs(record) !== opened.key ? 'connect' : 'flash';
}

function actionFor(
  state: SessionState,
  record: BoardRecord,
  opened: OpenedSketch | undefined,
  pressed: ConnectionEvent | undefined,
  tried: ConnectionEvent | undefined,
): ConnectionAction | undefined {
  const flash = (event: ConnectionEvent): ConnectionAction | undefined =>
    opened === undefined ? undefined : { label: `Flash ${opened.title}`, icon: 'bolt', event, disabled: false };
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
      return opened && flash(flashFromRunning(opened, record));
    case 'flashMode':
      return connect('Connect again');
    default:
      return connect('Connect board');
  }
}

/**
 * The board dock for the session's `state`: its one button, what it says and draws, and whether its panel is open.
 * `record` is what the site knows of the board; `opened` the sketch the page has open, if any; `pick` the board the
 * visitor picked. `pressed` and `tried` are the last press made while the session worked and the press whose work
 * ended in the session's failure, which Try again repeats.
 */
export function connectionView({ state, record, opened, pick, pressed, tried, names = {} }: ConnectionInput): ConnectionView {
  const refusal = showsRefusal(state, opened);
  const sketch = { name: opened?.title ?? record.pending ?? 'This sketch', step: opened?.step === true };
  const message = boardMessage(state, sketch, refusal, pick) ?? settingsMessage(state, record, opened, names);
  const action = actionFor(state, record, opened, pressed, tried);
  const lost = state.kind === 'running' && state.lost === true;
  const open = isBusy(state) || state.kind === 'flashMode' || FAILED.has(state.kind) || lost || refusal;
  return {
    ...(action !== undefined && { action }),
    ...(message !== undefined && { message }),
    scene: flashScene(state, pick),
    open,
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
export function createConnection(
  board: Board,
  pick: BoardPick,
  names: Readonly<Record<string, SketchName>> = {},
): Connection {
  const listeners = new Set<() => void>();
  let state = board.session.state;
  let pressed: ConnectionEvent | undefined;
  let tried: ConnectionEvent | undefined;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  /** The sketch the page has open, as the board's button names it. */
  function openedNow(): OpenedSketch | undefined {
    const opened = board.opened;
    return (
      opened && {
        key: opened.use.sketch,
        title: opened.title,
        step: opened.step === true,
        settings: settingsOf(opened.use.manifest, opened.use.sketch, opened.use.baud).length > 0,
      }
    );
  }

  function viewNow(): ConnectionView {
    return connectionView({
      state: board.session.state,
      record: board.record,
      opened: openedNow(),
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
        // page's, so the board is only restarted and read.
        return board.send(opened === undefined ? restartConnection(pick.model) : { type: 'connect' });
      case 'flash':
        if (opened !== undefined) await board.send({ type: 'flash', key: opened.use.sketch });
        return;
      case 'retry': {
        await board.send(restartConnection(pick.model));
        // The sketch open now may be another page's, with settings: it is flashed as from any running board.
        const now = openedNow();
        if (board.session.state.kind === 'running' && !board.session.state.lost && now !== undefined) {
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
