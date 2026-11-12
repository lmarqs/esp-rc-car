import type { PictureView, WatchRow } from '../../lib/workbench/board';
import type { Followed } from '../../lib/workbench/live';
import type { BoardAction, BoardStatus } from '../../lib/workbench/link';
import { paneAction, paneStatus, showsRefusal, type PaneProject, type PaneState } from '../../lib/workbench/pane';
import type { Snapshot } from '../../lib/workbench/simulation';
import { lineNumber } from '../../lib/workbench/source';
import { traceShape, traceTime, type TraceShape } from '../../lib/workbench/trace';
import {
  boardMessage,
  boardStatusText,
  clockFace,
  liveClockFace,
  notSent,
  serialRows,
  toolbar,
  type BoardMessage,
  type ClockFace,
  type SerialRow,
  type Toolbar,
} from './view';

/**
 * What the board pane shows while the pane changes, from whoever has it: the real board's followed lines when the pane
 * follows it, else the simulator's run. The page only writes these values.
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

/** The pane's followed board, or `undefined` while the simulator has it. */
function followedBoard<B>(pane: PaneState<B>): Followed<B> | undefined {
  return pane.mode === 'simulator' ? undefined : pane.followed;
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

/** What the Board cell, its switch and the board pane's message show for the pane. */
export interface LinkView {
  /** What the Board cell's styles select on. */
  readonly kind: BoardStatus['kind'];
  /** The cell's short word, and the sentence that names the board's sketch in full. */
  readonly word: string;
  readonly title: string;
  /** The key of the step the board runs, which the rail marks; absent when the board runs none of them. */
  readonly onBoard: string | undefined;
  /** The board half of the Board switch; absent in a browser that cannot reach a board. */
  readonly action: BoardAction | undefined;
  /** Whether the board has the pane, so the board half of the switch is pressed and the simulator half is not. */
  readonly live: boolean;
  /** Whether Flash again shows, so the visitor can flash the step onto the board that is already live. */
  readonly flashAgain: boolean;
  /** What the board pane shows in place of the picture; absent while it shows the picture. */
  readonly message: BoardMessage | undefined;
}

/** What the page shows of the link between the pane and the visitor's board. */
export function linkView<B>(project: PaneProject<B>, pane: PaneState<B>): LinkView {
  const status = paneStatus(project, pane);
  const action = paneAction(project, pane);
  const live = pane.mode === 'live';
  return {
    kind: status.kind,
    ...boardStatusText(status, pane.detached),
    onBoard: status.kind === 'live' || status.kind === 'step' ? pane.heard : undefined,
    action,
    live,
    flashAgain: live && action?.disabled === false,
    message: boardMessage(pane.session, pane.flashed, showsRefusal(pane)),
  };
}
