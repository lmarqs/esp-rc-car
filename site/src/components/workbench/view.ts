import { highlightLine, type Token } from '../../lib/workbench/highlight';
import type { WatchRow } from '../../lib/workbench/board';
import type { OutputLine, RunnerView, RunStatus } from '../../lib/workbench/simulator';
import { sketchSourcePath } from '../../lib/workbench/source';
import { wording, type SessionState } from '../../lib/flash';
import type { BoardStatus, PaneMode } from '../../lib/workbench/link';
import type { SliderShortcut } from '../../lib/workbench/step';

/** How many lines of serial output the terminal shows, the newest at the bottom. */
export const SERIAL_LINES = 6;

/**
 * One row of the editor: its 1-based number, its coloured text, whether it is new in this step, whether it calls
 * `delay()`, which gives it a clock, and which of its tokens shows the live value, if any.
 */
export interface CodeRow {
  readonly number: number;
  readonly tokens: readonly Token[];
  readonly isNew: boolean;
  readonly waits: boolean;
  readonly live?: number;
}

/**
 * The editor's rows for `source`, with the 1-based line numbers in `added` marked new. When `live` names a variable,
 * the number it is declared with at the top of the file is marked to show its current value.
 */
export function codeRows(source: string, added: readonly number[], live?: string): CodeRow[] {
  const fresh = new Set(added);
  return source
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((line, index) => {
      const tokens = highlightLine(line);
      const row = { number: index + 1, tokens, isNew: fresh.has(index + 1), waits: callsDelay(tokens) };
      const at = live === undefined ? -1 : declaredValue(line, tokens, live);
      return at < 0 ? row : { ...row, live: at };
    });
}

/** The index of the number token that `line` declares `name` with at file scope, as in `int name = 1000;`; else -1. */
function declaredValue(line: string, tokens: readonly Token[], name: string): number {
  if (!new RegExp(`^[A-Za-z_][\\w ]*\\b${name}\\s*=\\s*\\d+\\s*;`).test(line)) return -1;
  return tokens.findIndex((token) => token.kind === 'number');
}

const callsDelay = (tokens: readonly Token[]): boolean =>
  tokens.some((token) => token.kind === 'function' && token.text === 'delay');

/** The `pathLength` of the clock's fill circle, so a share of the wait maps onto its dash. */
export const CLOCK_DASH = 100;

/** The clock at the end of a `delay()` line: `waiting` while the simulator waits there, and how full it is, 0 to 1. */
export interface ClockFace {
  readonly waiting: boolean;
  readonly fill: number;
}

/**
 * The running line's clock. While running on a waiting line it fills with `progress`, the share of the wait spent; with
 * reduced motion it shows full instead of moving. Paused on a waiting line, it keeps the share spent.
 */
export function clockFace(
  view: Pick<RunnerView<unknown>, 'status' | 'wait'>,
  progress: number,
  reduceMotion: boolean,
): ClockFace {
  if (!view.wait) return { waiting: false, fill: 0 };
  const waiting = view.status === 'running';
  return { waiting, fill: waiting && reduceMotion ? 1 : progress };
}

/**
 * The clock on the `delay()` line a real board waits in: it fills from `since`, when the line that put the board there
 * arrived, over `wait` milliseconds, then stays full until the next line moves the arrow. With reduced motion it shows
 * full. Empty while the wait is unknown, since the page cannot tell how far along the board is.
 */
export function liveClockFace(
  since: number | undefined,
  wait: number | undefined,
  now: number,
  reduceMotion: boolean,
): ClockFace {
  if (since === undefined || wait === undefined) return { waiting: false, fill: 0 };
  return { waiting: true, fill: reduceMotion ? 1 : Math.min(1, Math.max(0, (now - since) / wait)) };
}

/** The breadcrumb path of a step's `.ino`, such as `sketches`, `blink`, `input`, `input.ino`. */
export function crumbs(sketch: string): string[] {
  return sketchSourcePath(sketch).split('/');
}

/** The name of a step's `.ino`, such as `input.ino`, for the editor's file tab. */
export function fileName(sketch: string): string {
  return crumbs(sketch).at(-1) ?? '';
}

/** One line of the terminal: its text, ending in a newline unless it is the last, and whether the visitor sent it. */
export interface SerialRow {
  readonly text: string;
  readonly sent: boolean;
}

/**
 * The terminal's lines: the last {@link SERIAL_LINES} lines of output, a line the visitor sent marked with `›`. Every
 * line but the last ends in a newline, so the lines read as the output's text when joined.
 */
export function serialRows(output: readonly OutputLine[]): SerialRow[] {
  const shown = output.slice(-SERIAL_LINES);
  return shown.map((line, index) => {
    const text = line.sent === undefined ? line.text : `› ${line.text}`;
    return { text: index < shown.length - 1 ? `${text}\n` : text, sent: line.sent !== undefined };
  });
}

/** What the debugger's toolbar shows for a run: the Pause button's word, which buttons work, and any problem. */
export interface DebuggerControls {
  /** The Pause button reads Continue, with a play icon. */
  readonly paused: boolean;
  readonly label: 'Pause' | 'Continue';
  readonly canContinue: boolean;
  readonly canStep: boolean;
  /** What stopped the run and what to do, in plain words; absent while the run can go on. */
  readonly problem?: string;
}

/** The toolbar for a run in `status`; `error` is what the program threw, for a run in `error`. */
export function debuggerControls(status: RunStatus, error?: unknown): DebuggerControls {
  const live = status === 'running' || status === 'paused';
  const controls = {
    paused: status !== 'running',
    label: status === 'running' ? 'Pause' : 'Continue',
    canContinue: live,
    canStep: live,
  } as const;
  if (status === 'error') return { ...controls, problem: `The simulator stopped: ${reason(error)}. Restart to try again.` };
  if (status === 'ended') return { ...controls, problem: 'The sketch has ended. Restart to run it again.' };
  return controls;
}

/** The toolbar's buttons as the board pane follows a real board: which work, and whether Slow shows pressed. */
export interface Toolbar extends DebuggerControls {
  readonly canRestart: boolean;
  readonly canSlow: boolean;
  readonly slow: boolean;
}

/**
 * The toolbar for the pane's `mode`. The simulator's comes from its run, `status` and `error`, with its `slow` setting.
 * Live, Pause, Step and Restart hand the pane to the simulator, and Slow, which a real board cannot follow, is off.
 */
export function toolbar(mode: PaneMode, status: RunStatus, error: unknown, slow: boolean): Toolbar {
  switch (mode) {
    case 'simulator':
      return { ...debuggerControls(status, error), canRestart: true, canSlow: true, slow };
    case 'live':
      return { ...debuggerControls('running'), canRestart: true, canSlow: false, slow: false };
  }
}

/**
 * The value a slider that follows a board variable shows: `known`, the variable as the board model gives it, when it
 * is a number within the slider's range; `undefined` while it is unknown, or for a slider that follows nothing.
 */
export function followedSliderValue(slider: Pick<SliderShortcut, 'follows' | 'min' | 'max'>, known: string | undefined): number | undefined {
  if (slider.follows === undefined || known === undefined) return undefined;
  const value = Number(known);
  return Number.isFinite(value) && value >= slider.min && value <= slider.max ? value : undefined;
}

/**
 * A following slider after the board's variable read `known`: it moves only when the value differs from the one it
 * last saw, `remembered`, so a value the visitor set on release stays until the board reports a change. A `held`
 * slider, under the pointer or with its line still to go out, notes the change without moving.
 */
export function followSlider(
  remembered: number | undefined,
  known: number | undefined,
  held: boolean,
): { readonly remembered: number | undefined; readonly move?: number } {
  if (known === undefined || known === remembered) return { remembered };
  return held ? { remembered: known } : { remembered: known, move: known };
}

/** What the board pane says when the port refused a line the visitor sent to the board, and what to do. */
export function notSent(text: string): string {
  return `The board did not get ${text}. Check that it is still plugged in, then send it again.`;
}

function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : (error ?? '').toString();
  return text.replace(/[.\s]+$/, '') || 'something went wrong';
}

/** The rows whose value changed from `before` to `after`, but the `steady` ones; none when there is no `before`. */
export function changedRows(
  before: readonly WatchRow[] | undefined,
  after: readonly WatchRow[],
  steady: readonly string[],
): string[] {
  if (before === undefined) return [];
  const previous = new Map(before.map((row) => [row.name, row.value]));
  return after
    .filter((row) => !steady.includes(row.name) && previous.has(row.name) && previous.get(row.name) !== row.value)
    .map((row) => row.name);
}

/**
 * What the Board cell reads for a status, short enough for its fixed width, and the sentence that names the board's
 * sketch in full, for the tooltip and for a screen reader. `detached` is set while the board runs the selected step
 * but the visitor handed the pane to the simulator.
 */
export function boardStatusText(status: BoardStatus, detached = false): { readonly word: string; readonly title: string } {
  switch (status.kind) {
    case 'simulated':
      return { word: 'Simulated', title: 'Running in the browser' };
    case 'connected':
      return { word: 'Connected', title: 'Waiting for the board to name its sketch; flash a step to use it here' };
    case 'live':
      return {
        word: 'Live',
        title: detached ? 'Live — the pane shows the simulator until Back to live' : 'Your board runs this step',
      };
    case 'step':
      return { word: `Runs step ${status.number}`, title: `Your board runs ${status.key}` };
    case 'sketch':
      return { word: 'Other sketch', title: `Your board runs ${status.key}` };
  }
}

/** What the board pane shows in place of the picture while the page talks to the board, or after it failed. */
export interface BoardMessage {
  readonly text: string;
  /** Shown as a notice: a state that is not part of the happy path. */
  readonly notice: boolean;
  /** 0 to 100 while flashing. */
  readonly progress?: number;
}

/** What to do after a flash failed: the session let go of the port, so the button reads Connect. */
const RECONNECT = 'Connect again, then press Flash step.';

/**
 * The board pane's message for the session's `state`, or `undefined` when the pane shows the picture. `key` is the
 * step last flashed, which a missing image names. `showRefusal` keeps the refusal of a step with no image for the
 * board on screen; the page drops it once the visitor picks another step.
 */
export function boardMessage(state: SessionState, key: string, showRefusal: boolean): BoardMessage | undefined {
  const notice = (text: string): BoardMessage => ({ text, notice: true });
  switch (state.kind) {
    case 'connecting':
      return { text: wording.CONNECTING, notice: false };
    case 'flashing':
      return { text: wording.found(state.chip), notice: false, progress: state.pct };
    case 'noPort':
      return notice(wording.NO_PORT);
    case 'portBusy':
      return notice(wording.PORT_BUSY);
    case 'noAnswer':
      return notice(wording.NO_ANSWER);
    case 'noImage':
      return notice(`${wording.noImage(state, key)} ${wording.otherBoardOrStep(state.available)}`);
    case 'noDownload':
      return notice(`${wording.NO_DOWNLOAD}. ${RECONNECT}`);
    case 'dropped':
      return notice(`${wording.droppedAt(state.pct)} Plug the board back in. ${RECONNECT}`);
    case 'running':
      if (state.lost) return notice(wording.LOST);
      if (state.flashRefused !== undefined && showRefusal) {
        const { key: refused, available } = state.flashRefused;
        const why = wording.noImage({ kind: 'noImage', chip: state.chip, available }, refused);
        return notice(`${why} ${wording.otherBoardOrStep(available)}`);
      }
      return undefined;
    default:
      return undefined;
  }
}
