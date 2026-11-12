import { highlightLine, type Token } from '../../lib/workbench/highlight';
import type { WatchRow } from '../../lib/workbench/board';
import type { OutputLine, RunnerView, RunStatus } from '../../lib/workbench/simulator';
import { sketchSourcePath } from '../../lib/workbench/source';

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
