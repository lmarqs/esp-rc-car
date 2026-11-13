import { isBusy, wording, type SessionState } from '../flash';
import { settingsOf } from '../flash/settings';
import type { Board } from './board';
import { flashScene, type FlashScene } from './flashScene';
import { restartConnection, type BoardModel } from './models';
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

/** What to do when a board on a flash-switch adapter runs a sketch that has not named itself, which its reset button fixes. */
function unnamedOnSwitch(opened: OpenedSketch | undefined): string {
  return opened === undefined
    ? 'Your board has not named its sketch. Press reset on its adapter to name it.'
    : `Your board has not named its sketch. Press reset on its adapter, or flash ${opened.title} to use it here.`;
}

/** The session's refusal to flash `opened`, which the dock shows only while the page still has that sketch open. */
function showsRefusal(state: SessionState, opened: OpenedSketch | undefined): boolean {
  return state.kind === 'running' && state.flashRefused !== undefined && state.flashRefused.key === opened?.key;
}

/**
 * The press that flashes `opened` onto a running board: a flash on the open port, unless the sketch has settings the
 * board does not hold yet. Then it connects anew, which opens the settings form before the write, so a sketch such as
 * a hotspot never starts with its default password unasked.
 */
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
export function connectionView({ state, record, opened, pick, pressed, tried }: ConnectionInput): ConnectionView {
  const refusal = showsRefusal(state, opened);
  const sketch = { name: opened?.title ?? record.pending ?? 'This sketch', step: opened?.step === true };
  const named = boardMessage(state, sketch, refusal, pick);
  const unnamed =
    state.kind === 'running' && !state.lost && runs(record) === undefined && pick?.flashSwitch === true
      ? ({ text: unnamedOnSwitch(opened), notice: false } satisfies BoardMessage)
      : undefined;
  const message = named ?? unnamed;
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
}

/**
 * The connection of `board`, the site's, for the board the visitor picked, `pick`. It remembers what the visitor
 * pressed while the session works on it, and the press whose work last ended, as Try again repeats it.
 */
export function createConnection(board: Board, pick: BoardPick): Connection {
  const listeners = new Set<() => void>();
  let state = board.session.state;
  let pressed: ConnectionEvent | undefined;
  let tried: ConnectionEvent | undefined;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function viewNow(): ConnectionView {
    const opened = board.opened;
    return connectionView({
      state: board.session.state,
      record: board.record,
      opened: opened && {
        key: opened.use.sketch,
        title: opened.title,
        step: opened.step === true,
        settings: settingsOf(opened.use.manifest, opened.use.sketch, opened.use.baud).length > 0,
      },
      pick: pick.model,
      ...(pressed !== undefined && { pressed }),
      ...(tried !== undefined && { tried }),
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
      case 'retry':
        await board.send(restartConnection(pick.model));
        if (board.session.state.kind === 'running' && !board.session.state.lost && board.opened !== undefined) {
          await start('flash');
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
  };
}
