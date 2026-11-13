import type { PictureView, WatchRow } from '../../lib/workbench/board';
import type { BoardModel } from '../../lib/board/models';
import type { Followed } from '../../lib/workbench/live';
import { boardDot, type BoardStatus, type PaneChoice, type PaneMode } from '../../lib/workbench/link';
import { paneStatus, type PaneProject, type PaneState } from '../../lib/workbench/pane';
import type { Snapshot } from '../../lib/workbench/simulation';
import { lineNumber } from '../../lib/workbench/source';
import { emptyTrace, traceShape, traceTime, type TraceShape } from '../../lib/workbench/trace';
import {
  clockFace,
  liveClockFace,
  notSent,
  paneTag,
  serialRows,
  toolbar,
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
    // The picture and the watch keep their place, dimmed, and claim no value of a board the pane does not follow.
    return {
      board,
      picture: project.board.picture(step.key, project.board.initial()),
      rows: project.board.watch(step.key, board, undefined).map((row) => ({ ...row, value: '…' })),
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

/** What the switch and the board pane's frame show for the pane. */
export interface LinkView {
  /** What the visitor's board runs. */
  readonly kind: BoardStatus['kind'];
  /** The frame's tag: its word, and the sentence that says more. */
  readonly tag: { readonly word: string; readonly title: string };
  /** The half of the switch that shows pressed. */
  readonly chosen: PaneChoice;
  /** What the frame's styles select on. */
  readonly mode: PaneMode;
  /** Whether the browser can reach a board, which gives the switch its My board half. */
  readonly reachable: boolean;
  /** The dot on the switch's My board half. */
  readonly dot: 'off' | 'busy' | 'on';
  /** Whether the session writes the board, which the busy dot names. */
  readonly flashing: boolean;
  /** The key of the step the board runs, which the rail marks; absent when the board runs none of them. */
  readonly onBoard: string | undefined;
}

/** What the page shows of the link between the pane and the visitor's board, picked as `board`. */
export function linkView<B>(project: PaneProject<B>, pane: PaneState<B>, board?: BoardModel): LinkView {
  const status = paneStatus(project, pane);
  const { mode, session } = pane;
  return {
    kind: status.kind,
    tag: paneTag(mode, status, session, board),
    chosen: pane.chosen,
    mode,
    reachable: session.kind !== 'unsupported',
    dot: boardDot(session),
    flashing: session.kind === 'flashing',
    onBoard: status.kind === 'live' || status.kind === 'step' ? pane.heard : undefined,
  };
}
