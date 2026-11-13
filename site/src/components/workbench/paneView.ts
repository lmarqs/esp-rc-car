import { flashScene, type FlashScene } from '../../lib/board/flashScene';
import type { PictureView, WatchRow } from '../../lib/workbench/board';
import type { BoardModel } from '../../lib/board/models';
import type { Followed } from '../../lib/workbench/live';
import { boardDot, type BoardAction, type BoardStatus, type PaneChoice, type PaneMode } from '../../lib/workbench/link';
import { paneAction, paneStatus, showsRefusal, type PaneProject, type PaneState } from '../../lib/workbench/pane';
import type { Snapshot } from '../../lib/workbench/simulation';
import { lineNumber } from '../../lib/workbench/source';
import { emptyTrace, traceShape, traceTime, type TraceShape } from '../../lib/workbench/trace';
import {
  boardMessage,
  clockFace,
  liveClockFace,
  notSent,
  paneTag,
  serialRows,
  toolbar,
  waitingMessage,
  type BoardMessage,
  type ClockFace,
  type SerialRow,
  type Toolbar,
} from './view';

/**
 * What the board pane shows while the pane changes, from whoever has it: the real board's followed lines when the pane
 * follows it, nothing of a board while My board waits, else the simulator's run. The page only writes these values.
 */
export interface PaneView<B> {
  /** The board the picture and the watch panel show, which the sliders that follow a variable read. */
  readonly board: B;
  readonly picture: PictureView;
  readonly rows: readonly WatchRow[];
  readonly serial: readonly SerialRow[];
  readonly controls: Toolbar;
  /** What stopped the run or the line the board did not get, in plain words; absent when there is none. */
  readonly problem: string | undefined;
  /** The 1-based number of the source line the arrow sits on; `undefined` when no line has it. */
  readonly arrow: number | undefined;
  /** The text of each of the editor's live values, by variable name; empty for a step with none. */
  readonly live: Readonly<Record<string, string>>;
}

/** The pane's followed board, or `undefined` while the pane does not follow it. */
function followedBoard<B>(pane: PaneState<B>): Followed<B> | undefined {
  return pane.mode === 'live' ? pane.followed : undefined;
}

/** What the pane shows of `pane`, whose selected step has the source `source`, with the simulator at `run`. */
export function paneView<B>(
  project: PaneProject<B>,
  pane: PaneState<B>,
  run: Snapshot<unknown, B>,
  source: string,
): PaneView<B> {
  const step = project.steps[pane.selected];
  const followed = followedBoard(pane);
  const { view } = run;
  const board = followed?.board ?? run.board;
  const controls = toolbar(pane.mode, view.status, view.error, view.slow);
  if (pane.mode === 'waiting') {
    // The pane hides the picture behind what to do, and claims no value of a board it does not follow.
    return {
      board,
      picture: project.board.picture(step.key, board),
      rows: [],
      serial: [],
      controls,
      problem: undefined,
      arrow: undefined,
      live: Object.fromEntries(step.live.map(({ name }) => [name, '…'])),
    };
  }
  const refused = followed === undefined || pane.refused === undefined ? undefined : notSent(pane.refused);
  const arrow = followed === undefined ? { text: view.line, occurrence: view.occurrence } : arrowOf(followed);
  return {
    board,
    picture: project.board.picture(step.key, board),
    // A real board's clock is unknown: it prints no time.
    rows: project.board.watch(step.key, board, followed === undefined ? view.millis : undefined),
    serial: serialRows(followed?.output ?? view.output),
    controls,
    problem: controls.problem ?? refused,
    arrow: arrow.text === undefined ? undefined : lineNumber(source, arrow.text, arrow.occurrence),
    // A value the board has not told yet shows as unknown rather than as the value in the source.
    live: Object.fromEntries(
      step.live.map(({ name, value }) => [
        name,
        (followed === undefined ? value(view.state) : project.board.variable(followed.board, name)) ?? '…',
      ]),
    ),
  };
}

/** Where the arrow sits on the followed board: only on a step whose lines place it. */
function arrowOf(followed: Followed<unknown>): { text: string | undefined; occurrence: number } {
  const ref = followed.arrow;
  if (ref === undefined || typeof ref === 'string') return { text: ref, occurrence: 1 };
  return { text: ref.text, occurrence: ref.occurrence };
}

/** What moves between changes: the running line's clock and the trace. */
export interface PaneMotion {
  readonly clock: ClockFace;
  readonly trace: TraceShape;
  /** Whether either keeps moving, so the page paints again on the next frame. */
  readonly moving: boolean;
}

/** The pane's motion at `now`, with the trace `width` pixels wide. */
export function paneMotion<B>(
  project: PaneProject<B>,
  pane: PaneState<B>,
  run: Snapshot<unknown, B>,
  now: number,
  width: number,
  reduceMotion: boolean,
): PaneMotion {
  const followed = followedBoard(pane);
  const { view, progress } = run;
  if (pane.mode === 'waiting') {
    return { clock: { waiting: false, fill: 0 }, trace: traceShape(emptyTrace(undefined), now, width), moving: false };
  }
  if (followed !== undefined) {
    const clock = liveClockFace(followed.arrowAt, project.board.wait(followed.board), now, reduceMotion);
    return { clock, trace: traceShape(followed.trace, now, width), moving: true };
  }
  const clock = clockFace(view, progress, reduceMotion);
  return {
    clock,
    trace: traceShape(run.trace, traceTime(view, progress, reduceMotion), width),
    moving: view.status === 'running' && (clock.waiting || view.cost > 0),
  };
}

/** What the switch, the board pane's frame and the My board view show for the pane. */
export interface LinkView {
  /** What the visitor's board runs. */
  readonly kind: BoardStatus['kind'];
  /** The frame's tag: its word, and the sentence that says more. */
  readonly tag: { readonly word: string; readonly title: string };
  /** The half of the switch that shows pressed. */
  readonly chosen: PaneChoice;
  /** What the frame's styles select on. */
  readonly mode: PaneMode;
  /** The dot on the switch's My board half. */
  readonly dot: 'off' | 'busy' | 'on';
  /** The key of the step the board runs, which the rail marks; absent when the board runs none of them. */
  readonly onBoard: string | undefined;
  /** The My board view's button; absent in a browser that cannot reach a board. */
  readonly action: BoardAction | undefined;
  /** What the board pane says in place of the picture: while My board waits, or over the live board a refused flash. */
  readonly message: BoardMessage | undefined;
  /** What the My board view draws of the computer, the cable and the board. */
  readonly scene: FlashScene;
}

/** What the page shows of the link between the pane and the visitor's board. */
export function linkView<B>(project: PaneProject<B>, pane: PaneState<B>, board?: BoardModel): LinkView {
  const status = paneStatus(project, pane);
  const action = paneAction(project, pane);
  const { mode } = pane;
  return {
    kind: status.kind,
    tag: paneTag(mode, status, action),
    chosen: pane.chosen,
    mode,
    dot: boardDot(pane.session),
    onBoard: status.kind === 'live' || status.kind === 'step' ? pane.heard : undefined,
    action,
    message: linkMessage(project, pane, status, board),
    scene: flashScene(pane.session, board),
  };
}

/**
 * What the board pane says in the picture's place: while My board waits, what to do; while live, only a flash the
 * session refused, which leaves the board running the step.
 */
function linkMessage<B>(
  project: PaneProject<B>,
  pane: PaneState<B>,
  status: BoardStatus,
  board: BoardModel | undefined,
): BoardMessage | undefined {
  const refusal = showsRefusal(pane);
  switch (pane.mode) {
    case 'waiting':
      return waitingMessage(pane.session, status, project.ids[pane.selected], pane.flashed, refusal, board);
    case 'live':
      return refusal ? boardMessage(pane.session, pane.flashed, refusal, board) : undefined;
    case 'simulator':
      return undefined;
  }
}
