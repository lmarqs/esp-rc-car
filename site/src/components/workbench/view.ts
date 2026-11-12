import { highlightLine, type Token } from '../../lib/workbench/highlight';
import type { OutputLine, RunnerView } from '../../lib/workbench/simulator';
import { sketchSourcePath } from '../../lib/workbench/source';
import type { Shortcut } from '../../lib/workbench/step';

/** How many lines of serial output the terminal shows, the newest at the bottom. */
export const SERIAL_LINES = 6;

/**
 * One row of the editor: its 1-based number, its coloured text, whether it is new in this step, and whether it calls
 * `delay()`, which gives it a clock.
 */
export interface CodeRow {
  readonly number: number;
  readonly tokens: readonly Token[];
  readonly isNew: boolean;
  readonly waits: boolean;
}

/** The editor's rows for `source`, with the 1-based line numbers in `added` marked new. */
export function codeRows(source: string, added: readonly number[]): CodeRow[] {
  const fresh = new Set(added);
  return source
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((line, index) => {
      const tokens = highlightLine(line);
      return { number: index + 1, tokens, isNew: fresh.has(index + 1), waits: callsDelay(tokens) };
    });
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

/** The terminal's text: the last {@link SERIAL_LINES} lines of output, a line the visitor sent marked with `›`. */
export function serialText(output: readonly OutputLine[]): string {
  return output
    .slice(-SERIAL_LINES)
    .map((line) => (line.sent === undefined ? line.text : `› ${line.text}`))
    .join('\n');
}

/** What each of a step's shortcuts sends or sets, such as `pause run delay`; empty for a step with none. */
export function shortcutNames(shortcuts: readonly Shortcut[]): string {
  return shortcuts.map((shortcut) => (shortcut.kind === 'chip' ? shortcut.text : shortcut.label)).join(' ');
}
