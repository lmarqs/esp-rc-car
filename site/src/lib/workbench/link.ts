import { isBusy, type SessionState } from '../flash';

/**
 * What the visitor's board runs, as the board pane's tag names it: no board, a connected board that has not named its
 * sketch yet, the selected step, another step of the project, named by its id as its tab names it, or a sketch from
 * outside the project. `key` is the key the board printed.
 */
export type BoardStatus =
  | { kind: 'simulated' }
  | { kind: 'connected' }
  | { kind: 'live' }
  | { kind: 'step'; key: string; id: string }
  | { kind: 'sketch'; key: string };

/** The half of the board pane's switch the visitor pressed: the simulated step, or their own board. */
export type PaneChoice = 'simulator' | 'board';

/** The button in the My board view that gets the visitor's board to run the selected step: what it does and shows. */
export interface BoardAction {
  /** What the button is named, read out in full. */
  readonly label: string;
  /** What the button shows when that is shorter than its name, so the button keeps its width. */
  readonly short?: string;
  readonly icon: 'plug' | 'bolt';
  /** `connect` connects to a board; `flash` flashes the selected step onto the connected one. */
  readonly event: 'connect' | 'flash';
  /** Set while the session works on the last press. */
  readonly disabled: boolean;
}

/** Whether the session holds a board it reads, so the button flashes it instead of connecting. */
export function isConnected(state: SessionState): boolean {
  return state.kind === 'running' && !state.lost;
}

/**
 * What the visitor's board runs, given the key the connected board last printed, `heard`, the selected step's key
 * and the keys and ids of the project's steps in rail order. Until the board names its sketch, it is only connected.
 */
export function boardStatus(
  state: SessionState,
  heard: string | undefined,
  selected: string,
  steps: readonly string[],
  ids: readonly string[],
): BoardStatus {
  if (!isConnected(state)) return { kind: 'simulated' };
  if (heard === undefined) return { kind: 'connected' };
  if (heard === selected) return { kind: 'live' };
  const index = steps.indexOf(heard);
  return index < 0 ? { kind: 'sketch', key: heard } : { kind: 'step', key: heard, id: ids[index] };
}

/**
 * The My board view's button for the session's `state`, or `undefined` in a browser that cannot reach a board.
 * `step` is the selected step: its key and its id, such as `simple`, as its tab names it. `pressed` is what the
 * visitor pressed on this page, which names what the session works on while it is busy.
 */
export function boardAction(
  state: SessionState,
  heard: string | undefined,
  step: { readonly key: string; readonly id: string },
  pressed?: BoardAction['event'],
): BoardAction | undefined {
  if (state.kind === 'unsupported') return undefined;
  if (isBusy(state)) {
    // A press elsewhere on the site, such as the board dock's Flash again, leaves `pressed` unset: what the session
    // does names it.
    const event = pressed ?? (state.kind === 'flashing' ? 'flash' : 'connect');
    return { label: event === 'flash' ? 'Flashing…' : 'Connecting…', icon: ICONS[event], event, disabled: true };
  }
  if (!isConnected(state)) return CONNECT;
  if (heard !== step.key) {
    const short = `Flash ${step.id}`;
    return { label: `${short} to board`, short, icon: 'bolt', event: 'flash', disabled: false };
  }
  return { label: 'Flash again', icon: 'bolt', event: 'flash', disabled: false };
}

/** The dot on the switch's My board half: `busy` while the session works, `on` while it holds a board, else `off`. */
export function boardDot(state: SessionState): 'off' | 'busy' | 'on' {
  if (isBusy(state)) return 'busy';
  return isConnected(state) ? 'on' : 'off';
}

/**
 * What the board pane shows: `simulator`, the simulated step; `live`, the visitor's board, which runs the selected
 * step and takes the visitor's lines; `waiting`, My board while the board does not run the selected step, which says
 * what to do.
 */
export type PaneMode = 'simulator' | 'live' | 'waiting';

/** What the board pane shows for the board's `status` and the half of the switch the visitor `chosen`. */
export function paneMode(status: BoardStatus, chosen: PaneChoice): PaneMode {
  if (chosen === 'simulator') return 'simulator';
  return status.kind === 'live' ? 'live' : 'waiting';
}

const ICONS: Readonly<Record<BoardAction['event'], BoardAction['icon']>> = { connect: 'plug', flash: 'bolt' };

const CONNECT: BoardAction = { label: 'Connect my board', icon: 'plug', event: 'connect', disabled: false };
