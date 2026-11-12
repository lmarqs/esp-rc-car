import { isBusy, type SessionState } from '../flash';

export { sketchOf } from '../board/record';

/**
 * Which board the workbench's pictures follow, as the Board cell names it: the simulator with no board, the simulator
 * beside a connected board that has not named its sketch yet, the visitor's board running the selected step, another
 * step of the project, numbered from 1 as the rail numbers it, or a sketch from outside the project. `key` is the key
 * the board printed.
 */
export type BoardStatus =
  | { kind: 'simulated' }
  | { kind: 'connected' }
  | { kind: 'live' }
  | { kind: 'step'; key: string; number: number }
  | { kind: 'sketch'; key: string };

/**
 * The board half of the Board switch: what pressing it does, and what it shows for it. The other half is the
 * simulator, which drives the pane whenever the board does not.
 */
export interface BoardAction {
  readonly label: string;
  readonly icon: 'plug' | 'bolt' | 'dot';
  /**
   * `connect` connects to a board; `flash` flashes the selected step onto the connected one; `live` hands the board
   * pane to the board that runs the selected step, which it may already have.
   */
  readonly event: 'connect' | 'flash' | 'live';
  /** Set while the session works on the last press. */
  readonly disabled: boolean;
}


/** Whether the session holds a board it reads, so the button flashes it instead of connecting. */
export function isConnected(state: SessionState): boolean {
  return state.kind === 'running' && !state.lost;
}

/**
 * Which board the pictures follow, given the key the connected board last printed, `heard`, the selected step's key
 * and the keys of the project's steps in rail order. Until the board names its sketch, the page goes on simulating
 * and says the board is connected.
 */
export function boardStatus(
  state: SessionState,
  heard: string | undefined,
  selected: string,
  steps: readonly string[],
): BoardStatus {
  if (!isConnected(state)) return { kind: 'simulated' };
  if (heard === undefined) return { kind: 'connected' };
  if (heard === selected) return { kind: 'live' };
  const index = steps.indexOf(heard);
  return index < 0 ? { kind: 'sketch', key: heard } : { kind: 'step', key: heard, number: index + 1 };
}

/**
 * The board half of the Board switch for the session's `state`, or `undefined` in a browser that cannot reach a board.
 * `step` is the selected step, its key and its number in the rail. `pressed` is what the visitor last pressed, which
 * names what the session works on while it is busy. `detached` is set while the visitor has the simulator in the
 * board pane although the board runs the selected step.
 */
export function boardAction(
  state: SessionState,
  heard: string | undefined,
  step: { readonly key: string; readonly number: number },
  pressed?: BoardAction['event'],
  detached = false,
): BoardAction | undefined {
  if (state.kind === 'unsupported') return undefined;
  if (isBusy(state)) {
    // A press elsewhere on the site, such as Flash again in the board dock, is named by what the session does.
    const event = pressed ?? (state.kind === 'flashing' ? 'flash' : 'connect');
    return { label: event === 'flash' ? 'Flashing…' : 'Connecting…', icon: ICONS[event], event, disabled: true };
  }
  if (!isConnected(state)) return CONNECT;
  if (heard !== step.key) return { label: `Flash step ${step.number} to board`, icon: 'bolt', event: 'flash', disabled: false };
  return { label: detached ? 'My board' : 'My board, live', icon: 'dot', event: 'live', disabled: false };
}

/**
 * What drives the board pane: `simulator`, the simulated step; `live`, the board, which runs the selected step and
 * takes the visitor's lines.
 */
export type PaneMode = 'simulator' | 'live';

/**
 * What drives the board pane for the board's `status`: the board only while it runs the selected step, so a step the
 * board does not run is simulated like any other. `detached` is set when the visitor paused, stepped or restarted
 * while live, which hands the pane to the simulator until they press My board.
 */
export function paneMode(status: BoardStatus, detached: boolean): PaneMode {
  return status.kind === 'live' && !detached ? 'live' : 'simulator';
}

const ICONS: Readonly<Record<BoardAction['event'], BoardAction['icon']>> = { connect: 'plug', flash: 'bolt', live: 'dot' };

const CONNECT: BoardAction = { label: 'Connect my board', icon: 'plug', event: 'connect', disabled: false };
