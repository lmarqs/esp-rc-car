import { awaitsRun, type SessionState } from '../flash';
import type { BoardModel } from './board';
import { sketchOf } from '../flash/lines';
import { boardStatus, paneMode, type BoardStatus, type PaneChoice, type PaneMode } from './link';
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
 * What the workbench's board pane shows, and what the page knows of the visitor's board. The simulator's own run is the
 * page's: the pane says only when a fresh one starts and when it waits.
 */
export interface PaneState<B> {
  /** The session the page holds with the visitor's board. */
  readonly session: SessionState;
  /** The index of the selected step in rail order. */
  readonly selected: number;
  /** The half of the switch the visitor last pressed, or that the page opened on. */
  readonly chosen: PaneChoice;
  readonly mode: PaneMode;
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
}

/** What happens to the board pane. */
export type PaneEvent =
  /** The visitor picked the step at `index` in rail order. */
  | { readonly kind: 'tab'; readonly index: number }
  /**
   * The session with the visitor's board changed. `flashed` is the key the site last flashed onto the board, which a
   * board left in flash mode runs once it restarts.
   */
  | { readonly kind: 'session'; readonly state: SessionState; readonly flashed?: string }
  /** The board printed `text` at `at` milliseconds of the page's clock. */
  | { readonly kind: 'line'; readonly text: string; readonly at: number }
  /**
   * The visitor pressed a half of the switch, or Pause, Step or Restart outside the simulator, which choose it. The
   * simulator takes the pane with the board keeping its port; My board shows the board, or waits for it.
   */
  | { readonly kind: 'choose'; readonly chosen: PaneChoice }
  /** The visitor sent `text` to the board at `at`. */
  | { readonly kind: 'sent'; readonly text: string; readonly at: number }
  /** The port refused the line `id`, `text`, sent while the pane followed the board for the `pane`-th time. */
  | { readonly kind: 'refused'; readonly id: number; readonly pane: number; readonly text: string };

/**
 * The pane as the page opens on the step at `selected` in rail order: simulated, unless the board, which the site keeps
 * connected from page to page, already said it runs the step, as `heard`: then My board, following it.
 */
export function initialPane<B>(
  project: PaneProject<B>,
  session: SessionState,
  heard?: string,
  selected = 0,
): PaneState<B> {
  const chosen = heard === project.steps[selected].key ? 'board' : 'simulator';
  const opening = { session, selected, chosen, mode: 'simulator', following: 0, simulation: 0 } as const;
  return sync(project, { ...opening, heard });
}

/** What the visitor's board runs for `state`. */
export function paneStatus<B>(project: PaneProject<B>, state: PaneState<B>): BoardStatus {
  const keys = project.steps.map((step) => step.key);
  return boardStatus(state.session, state.heard, keys[state.selected], keys, project.ids);
}

/** The pane after `event`. */
export function reducePane<B>(project: PaneProject<B>, state: PaneState<B>, event: PaneEvent): PaneState<B> {
  switch (event.kind) {
    case 'tab':
      return sync(project, {
        ...handBack(state),
        selected: event.index,
        mode: state.chosen === 'simulator' ? 'simulator' : 'waiting',
      });
    case 'session': {
      if (event.state.kind === 'flashMode') {
        // The board runs the step just written once it leaves flash mode, and the port then opens too late to hear
        // it say so.
        return sync(project, { ...state, session: event.state, heard: event.flashed, known: project.board.initial() });
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
    case 'choose':
      if (event.chosen === 'board') return sync(project, { ...state, chosen: 'board' });
      if (state.mode === 'simulator') return state;
      return startSimulator({ ...state, chosen: 'simulator', mode: 'simulator' });
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
 * Lines the board prints while the pane does not follow it are not shown, nor kept for later, but what they tell of
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

/** Puts the pane where the board's status and the visitor's choice say it goes. */
function sync<B>(project: PaneProject<B>, state: PaneState<B>): PaneState<B> {
  const mode = paneMode(paneStatus(project, state), state.chosen);
  if (mode === state.mode) return state;
  switch (mode) {
    case 'simulator':
      return startSimulator({ ...state, mode });
    case 'live':
      return startFollowing(project, { ...state, mode });
    case 'waiting':
      return handBack({ ...state, mode });
  }
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
