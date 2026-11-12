import { highlightLine, type Token } from '../../lib/workbench/highlight';
import type { OutputLine } from '../../lib/workbench/simulator';
import { sketchSourcePath } from '../../lib/workbench/source';
import type { Shortcut } from '../../lib/workbench/step';

/** How many lines of serial output the terminal shows, the newest at the bottom. */
export const SERIAL_LINES = 6;

/** One row of the editor: its 1-based number, its coloured text, and whether it is new in this step. */
export interface CodeRow {
  readonly number: number;
  readonly tokens: readonly Token[];
  readonly isNew: boolean;
}

/** The editor's rows for `source`, with the 1-based line numbers in `added` marked new. */
export function codeRows(source: string, added: readonly number[]): CodeRow[] {
  const fresh = new Set(added);
  return source
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((line, index) => ({ number: index + 1, tokens: highlightLine(line), isNew: fresh.has(index + 1) }));
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
