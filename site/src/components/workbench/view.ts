import { highlightLine, type Token } from '../../lib/workbench/highlight';
import type { BoardModel } from '../../lib/board/models';
import type { WatchRow } from '../../lib/workbench/board';
import type { OutputLine, RunnerView, RunStatus } from '../../lib/workbench/simulator';
import { sketchSourcePath } from '../../lib/workbench/source';
import type { SessionState } from '../../lib/flash';
import { busyWord, onSettings } from '../../lib/board/connection';
import { isConnected, type BoardStatus, type PaneMode } from '../../lib/workbench/link';
import type { SliderShortcut } from '../../lib/workbench/step';

/** How many lines of serial output the terminal shows, the newest at the bottom. */
export const SERIAL_LINES = 6;

/** Which token of a row shows the live value of the variable `name`. */
export interface LiveToken {
  readonly at: number;
  readonly name: string;
}

/**
 * One row of the editor: its 1-based number, its coloured text, whether it is new in this step, whether it calls
 * `delay()`, which gives it a clock, and which of its tokens shows a live value, if any.
 */
export interface CodeRow {
  readonly number: number;
  readonly tokens: readonly Token[];
  readonly isNew: boolean;
  readonly waits: boolean;
  readonly live?: LiveToken;
}

/**
 * The editor's rows for `source`, with the 1-based line numbers in `added` marked new. Each variable `live` names has
 * the number or boolean it is declared with at the top of the file marked to show its current value.
 */
export function codeRows(source: string, added: readonly number[], live: readonly string[] = []): CodeRow[] {
  const fresh = new Set(added);
  return source
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((line, index) => {
      const tokens = highlightLine(line);
      const row = { number: index + 1, tokens, isNew: fresh.has(index + 1), waits: callsDelay(tokens) };
      for (const name of live) {
        const at = declaredValue(line, tokens, name);
        if (at >= 0) return { ...row, live: { at, name } };
      }
      return row;
    });
}

/**
 * The index of the token that `line` declares `name` with at file scope, as `1000` in `int name = 1000;` or `false` in
 * `bool name = false;`; else -1.
 */
function declaredValue(line: string, tokens: readonly Token[], name: string): number {
  const declared = new RegExp(`^[A-Za-z_][\\w ]*\\b${name}\\s*=\\s*(\\d+|true|false)\\s*;`).exec(line);
  if (declared === null) return -1;
  return tokens.findIndex((token) => token.text === declared[1]);
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
 * Under My board, live or waiting, Pause, Step and Restart hand the pane to the simulator, and Slow, which a real
 * board cannot follow, is off.
 */
export function toolbar(mode: PaneMode, status: RunStatus, error: unknown, slow: boolean): Toolbar {
  switch (mode) {
    case 'simulator':
      return { ...debuggerControls(status, error), canRestart: true, canSlow: true, slow };
    case 'live':
    case 'waiting':
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
 * The tag on the board pane's frame: a word that names what the pane shows, and a sentence that says more, as the
 * pane's `mode` and the board's `status` have it. While My board waits, the sentence names what the `session` works
 * on, or else what the board runs; `board` is the board the visitor picked, whose adapter may need its reset pressed.
 */
export function paneTag(
  mode: PaneMode,
  status: BoardStatus,
  session: SessionState,
  board: BoardModel | undefined,
): { readonly word: string; readonly title: string } {
  switch (mode) {
    case 'simulator':
      return {
        word: 'Simulated',
        title:
          status.kind === 'live'
            ? 'Running in the browser; your board runs this step under My board'
            : 'Running in the browser',
      };
    case 'live':
      return { word: 'Live', title: 'Drawn from what your board prints' };
    case 'waiting':
      return { word: 'My board', title: sessionWord(session) ?? waitingTitle(status, board) };
  }
}

/** What the switch's My board half says of the board, as its dot shows it: what the session does, or whether it reads one. */
export function dotTitle(session: SessionState): string {
  const word = sessionWord(session);
  if (word !== undefined) return `My board: ${word.toLowerCase()}`;
  return isConnected(session) ? 'My board: connected' : 'My board: not connected';
}

/** What the page does with the board, or that the board waits for its settings; `undefined` otherwise. */
function sessionWord(session: SessionState): string | undefined {
  return busyWord(session) ?? (onSettings(session) ? 'Waiting for its settings' : undefined);
}

function waitingTitle(status: BoardStatus, board: BoardModel | undefined): string {
  switch (status.kind) {
    case 'simulated':
      return 'Not connected';
    case 'connected':
      return board?.flashSwitch
        ? 'Waiting for it to name its sketch: press reset on its adapter'
        : 'Waiting for it to name its sketch';
    case 'live':
      return 'Runs this step';
    case 'step':
      return `Runs ${status.id}`;
    case 'sketch':
      return `Runs ${status.key}`;
  }
}
