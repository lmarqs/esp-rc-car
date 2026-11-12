import { isBusy, type SessionState } from '../flash';

/**
 * Which board the workbench's pictures follow, as the Board cell names it: the simulator, the visitor's board running
 * the selected step, another step of the project, numbered from 1 as the rail numbers it, or a sketch from outside
 * the project. `key` is the key the board printed.
 */
export type BoardStatus =
  | { kind: 'simulated' }
  | { kind: 'live' }
  | { kind: 'step'; key: string; number: number }
  | { kind: 'sketch'; key: string };

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
 * Which board the pictures follow, given the key the connected board last printed, `heard`, the selected step's key
 * and the keys of the project's steps in rail order. Until the board names its sketch, the page goes on simulating.
 */
export function boardStatus(
  state: SessionState,
  heard: string | undefined,
  selected: string,
  steps: readonly string[],
): BoardStatus {
  if (!isConnected(state) || heard === undefined) return { kind: 'simulated' };
  if (heard === selected) return { kind: 'live' };
  const index = steps.indexOf(heard);
  return index < 0 ? { kind: 'sketch', key: heard } : { kind: 'step', key: heard, number: index + 1 };
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
