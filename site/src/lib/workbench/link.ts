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

/** Whether the session holds a board it reads. */
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

/** The dot on the switch's My board half: `busy` while the session works, `on` while it holds a board, else `off`. */
export function boardDot(state: SessionState): 'off' | 'busy' | 'on' {
  if (isBusy(state)) return 'busy';
  return isConnected(state) ? 'on' : 'off';
}

/**
 * What the board pane shows: `simulator`, the simulated step; `live`, the visitor's board, which runs the selected
 * step and takes the visitor's lines; `waiting`, My board while the board does not run the selected step, whose tag
 * says what the board does.
 */
export type PaneMode = 'simulator' | 'live' | 'waiting';

/** What the board pane shows for the board's `status` and the half of the switch the visitor `chosen`. */
export function paneMode(status: BoardStatus, chosen: PaneChoice): PaneMode {
  if (chosen === 'simulator') return 'simulator';
  return status.kind === 'live' ? 'live' : 'waiting';
}
