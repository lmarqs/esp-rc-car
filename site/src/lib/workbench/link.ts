import { isBusy, type SessionState } from '../flash/session';

/**
 * Which board the workbench's pictures follow, as the Board cell names it: the simulator, the visitor's board running
 * the selected step, or the visitor's board running another sketch, named by its key.
 */
export type BoardStatus = { kind: 'simulated' } | { kind: 'live' } | { kind: 'other'; key: string };

/** What the Board cell's button does, and what it shows for it. */
export interface BoardAction {
  readonly label: 'Connect' | 'Flash step' | 'Flash again';
  readonly icon: 'plug' | 'bolt';
  /** `connect` connects to a board; `flash` flashes the selected step onto the connected one. */
  readonly event: 'connect' | 'flash';
  /** Set while the session works on the last press, which the button then keeps showing. */
  readonly disabled: boolean;
}

/** The key a `sketch <key>` line names, which every step of a ladder prints first; `undefined` for any other line. */
export function sketchOf(line: string): string | undefined {
  return /^sketch (\S+)$/.exec(line)?.[1];
}

/** Whether the session holds a board it reads, so the button flashes it instead of connecting. */
export function isConnected(state: SessionState): boolean {
  return state.kind === 'running' && !state.lost;
}

/**
 * Which board the pictures follow, given the key the connected board last printed, `heard`, and the selected step's
 * key. Until the board names its sketch, the page goes on simulating.
 */
export function boardStatus(state: SessionState, heard: string | undefined, selected: string): BoardStatus {
  if (!isConnected(state) || heard === undefined) return { kind: 'simulated' };
  return heard === selected ? { kind: 'live' } : { kind: 'other', key: heard };
}

/**
 * The button for the session's `state`, or `undefined` in a browser that cannot reach a board. `pressed` is the action
 * the visitor last pressed, which the button keeps, disabled, while the session works on it.
 */
export function boardAction(
  state: SessionState,
  heard: string | undefined,
  selected: string,
  pressed?: BoardAction,
): BoardAction | undefined {
  if (state.kind === 'unsupported') return undefined;
  if (isBusy(state)) return { ...(pressed ?? CONNECT), disabled: true };
  if (!isConnected(state)) return CONNECT;
  return { label: heard === selected ? 'Flash again' : 'Flash step', icon: 'bolt', event: 'flash', disabled: false };
}

const CONNECT: BoardAction = { label: 'Connect', icon: 'plug', event: 'connect', disabled: false };
