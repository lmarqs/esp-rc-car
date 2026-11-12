import { awaitsRun, type SessionState } from '../flash';
import type { BoardModel } from './board';
import { sketchOf } from '../board/record';
import { boardAction, boardStatus, paneMode, type BoardAction, type BoardStatus, type PaneMode } from './link';
import { follow, receive, send, withdraw, type Followed } from './live';
import type { StepDefinition } from './step';

/** The project a workbench's board pane shows: its steps in rail order and its board. */
export interface PaneProject<B> {
  readonly steps: readonly StepDefinition<unknown, unknown>[];
  /** Each step's id, such as `simple`, as its tab names it, in rail order. */
  readonly ids: readonly string[];
  readonly board: BoardModel<unknown, B, unknown>;
}

/**
 * Who has the workbench's board pane, and what the page knows of the visitor's board. The simulator's own run is the
 * page's: the pane says only when a fresh one starts and when it waits.
 */
export interface PaneState<B> {
  /** The session the page holds with the visitor's board. */
  readonly session: SessionState;
  /** The index of the selected step in rail order. */
  readonly selected: number;
  readonly mode: PaneMode;
  /** Set when the visitor paused, stepped or restarted while live: the simulator keeps the pane until My board. */
  readonly detached: boolean;
  /** The sketch the connected board said it runs; unknown again from each connection until it says. */
  readonly heard?: string;
  /**
   * What the page last knew of the connected board, such as its interval, kept while the pane shows something else:
   * only the board's own lines change it, and those sent meanwhile went to the simulator.
   */
  readonly known?: B;
  /** The real board as its lines tell it, while the pane follows it. */
  readonly followed?: Followed<B>;
  /** A line the visitor sent that the port refused, shown until the next one goes out or the pane changes hands. */
  readonly refused?: string;
  /** Counts the times the pane started following the board, so a late answer reaches only the pane it belongs to. */
  readonly following: number;
  /** Counts the times a fresh simulator took the pane from the board; the page then starts its run again. */
  readonly simulation: number;
  /** What the visitor last pressed on the board half of the Board switch, which the session may still work on. */
  readonly pressed?: BoardAction['event'];
  /** The key of the step last flashed, or of the first step until one is: the step a missing image names. */
  readonly flashed: string;
  /** The refused flash the visitor moved on from by picking another step, which the pane no longer shows. */
  readonly dismissed?: FlashRefusal;
}

/** A flash the session refused for want of an image for the board. */
type FlashRefusal = Extract<SessionState, { kind: 'running' }>['flashRefused'];

/** What happens to the board pane. */
export type PaneEvent =
  /** The visitor picked the step at `index` in rail order. */
  | { readonly kind: 'tab'; readonly index: number }
  /** The session with the visitor's board changed. */
  | { readonly kind: 'session'; readonly state: SessionState }
  /** The board printed `text` at `at` milliseconds of the page's clock. */
  | { readonly kind: 'line'; readonly text: string; readonly at: number }
  /** Pause, Step, Restart or Simulator pressed while live: the simulator takes the pane, and the board keeps its port. */
  | { readonly kind: 'detach' }
  /**
   * The board half of the Board switch pressed: `connect` and `flash` start the session's work, which the page asks
   * of it; `live`, My board, hands the pane back to the board.
   */
  | { readonly kind: 'press'; readonly action: BoardAction['event'] }
  /** The visitor sent `text` to the board at `at`. */
  | { readonly kind: 'sent'; readonly text: string; readonly at: number }
  /** The port refused the line `id`, `text`, sent while the pane followed the board for the `pane`-th time. */
  | { readonly kind: 'refused'; readonly id: number; readonly pane: number; readonly text: string };

/**
 * The pane as the page opens: the first step, simulated, unless the board, which the site keeps connected from page to
 * page, already said it runs it, as `heard`.
 */
export function initialPane<B>(project: PaneProject<B>, session: SessionState, heard?: string): PaneState<B> {
  const flashed = project.steps[0].key;
  const opening: PaneState<B> = { session, selected: 0, mode: 'simulator', detached: false, following: 0, simulation: 0, flashed };
  return heard === undefined ? opening : sync(project, { ...opening, heard });
}

/** The Board cell's status for `state`. */
export function paneStatus<B>(project: PaneProject<B>, state: PaneState<B>): BoardStatus {
  const keys = project.steps.map((step) => step.key);
  return boardStatus(state.session, state.heard, keys[state.selected], keys, project.ids);
}

/** The board half of the Board switch for the pane; `undefined` in a browser that cannot reach a board. */
export function paneAction<B>(project: PaneProject<B>, state: PaneState<B>): BoardAction | undefined {
  const step = { key: selectedStep(project, state).key, id: project.ids[state.selected] };
  return boardAction(state.session, state.heard, step, state.pressed, state.detached);
}

/** Whether the pane shows the session's refusal to flash: until the visitor picks another step. */
export function showsRefusal<B>(state: PaneState<B>): boolean {
  return state.session.kind === 'running' && state.session.flashRefused !== state.dismissed;
}

/** The pane after `event`. */
export function reducePane<B>(project: PaneProject<B>, state: PaneState<B>, event: PaneEvent): PaneState<B> {
  switch (event.kind) {
    case 'tab':
      return sync(project, {
        ...handBack(state),
        selected: event.index,
        mode: 'simulator',
        detached: false,
        dismissed: state.session.kind === 'running' ? state.session.flashRefused : state.dismissed,
      });
    case 'session': {
      if (event.state.kind === 'flashMode') {
        // The board runs the step just written once it leaves flash mode, and the port then opens too late to hear
        // it say so.
        return sync(project, { ...state, session: event.state, heard: state.flashed, known: project.board.initial() });
      }
      const connecting = event.state.kind === 'connecting' && !awaitsRun(state.session);
      return sync(project, {
        ...state,
        session: event.state,
        heard: connecting ? undefined : state.heard,
        known: connecting ? undefined : state.known,
      });
    }
    case 'line':
      return readLine(project, state, event.text, event.at);
    case 'detach':
      return sync(project, startSimulator({ ...state, detached: true, mode: 'simulator' }));
    case 'press':
      if (event.action === 'flash') return { ...state, pressed: event.action, flashed: selectedStep(project, state).key };
      if (event.action === 'live') return sync(project, { ...state, pressed: event.action, detached: false });
      return { ...state, pressed: event.action };
    case 'sent':
      if (state.mode !== 'live' || state.followed === undefined) return state;
      return {
        ...state,
        followed: send(state.followed, selectedStep(project, state), event.text, event.at),
        refused: undefined,
      };
    case 'refused':
      // A pane started since holds other lines under the same ids.
      if (state.followed === undefined || event.pane !== state.following) return state;
      return { ...state, followed: withdraw(state.followed, event.id), refused: event.text };
  }
}

/**
 * The pane after the board printed `text`. A `sketch` line names what the board runs, which may hand the pane over.
 * Lines the board prints while the simulator has the pane are not shown, nor kept for later, but what they tell of
 * the board still counts, such as the answer to a line sent before the visitor paused. A restart sets the source's
 * values, since it wipes whatever was sent before.
 */
function readLine<B>(project: PaneProject<B>, state: PaneState<B>, text: string, at: number): PaneState<B> {
  const key = sketchOf(text);
  const named = key !== undefined && key !== state.heard ? sync(project, { ...state, heard: key }) : state;
  if (named.followed !== undefined) {
    return { ...named, followed: receive(named.followed, selectedStep(project, named), project.board, text, at) };
  }
  if (key !== undefined) return { ...named, known: project.board.initial() };
  if (named.known === undefined) return named;
  const event = (heardStep(project, named) ?? selectedStep(project, named)).parse(text);
  return event === undefined ? named : { ...named, known: project.board.apply(named.known, event, at) };
}

/** Puts the pane where the board's status and the visitor's last choice say it goes. */
function sync<B>(project: PaneProject<B>, state: PaneState<B>): PaneState<B> {
  const status = paneStatus(project, state);
  const detached = status.kind === 'live' && state.detached;
  const mode = paneMode(status, detached);
  const placed = { ...state, detached };
  if (mode === state.mode) return placed;
  return mode === 'simulator' ? startSimulator({ ...placed, mode }) : startFollowing(project, { ...placed, mode });
}

/** Hands the pane to the board, from the next line it prints; the simulator waits, paused. */
function startFollowing<B>(project: PaneProject<B>, state: PaneState<B>): PaneState<B> {
  return {
    ...state,
    refused: undefined,
    following: state.following + 1,
    followed: follow(project.board, selectedStep(project, state).key, state.known),
  };
}

/** Hands the pane to a fresh simulator at the sketch's first line. */
function startSimulator<B>(state: PaneState<B>): PaneState<B> {
  return { ...handBack(state), simulation: state.simulation + 1 };
}

/** Stops following the board, keeping what the page knew of it. */
function handBack<B>(state: PaneState<B>): PaneState<B> {
  return state.followed === undefined ? state : { ...state, known: state.followed.board, followed: undefined };
}

function selectedStep<B>(project: PaneProject<B>, state: PaneState<B>): StepDefinition<unknown, unknown> {
  return project.steps[state.selected];
}

function heardStep<B>(project: PaneProject<B>, state: PaneState<B>): StepDefinition<unknown, unknown> | undefined {
  return project.steps.find((step) => step.key === state.heard);
}
