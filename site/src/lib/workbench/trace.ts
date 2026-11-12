import type { Effect, RunnerView } from './simulator';

/** How much of the board's time the trace shows, in milliseconds, ending at the board's present. */
export const TRACE_WINDOW_MS = 10_000;
/** The trace's height in pixels, and where it draws the top and the bottom of the output's range. */
export const TRACE_HEIGHT = 64;
export const HIGH_Y = 11;
export const LOW_Y = 48;

/** The height the trace draws `level` at, to a tenth of a pixel. */
export function levelY(level: number): number {
  return Number((LOW_Y - level * (LOW_Y - HIGH_Y)).toFixed(1));
}

/**
 * The most changes of level and marks the trace keeps; the window drops older ones before this bound is reached. A
 * servo that sweeps one degree every 15 ms changes about 670 times in the window.
 */
export const MAX_EDGES = 1024;
const MAX_MARKS = 128;

/** `sent`: the visitor sent a line. `applied`: the program read that line, the same `id`. */
export type TraceMarkKind = 'sent' | 'applied';

export interface TraceMark {
  readonly kind: TraceMarkKind;
  /** The sent line's id, which its `applied` mark shares. */
  readonly id: number;
  readonly at: number;
}

/**
 * A change of the traced output at `at` milliseconds to `level`, its share of the output's range from 0 at the bottom
 * to 1 at the top: an LED's LOW and HIGH, or a servo's angle over 180°.
 */
export interface TraceEdge {
  readonly at: number;
  readonly level: number;
}

/** One output's level and the visitor's lines over the last {@link TRACE_WINDOW_MS} of the board's time. */
export interface Trace {
  /** The level before the first edge kept; `undefined` while the output's level is not known, which draws nothing. */
  readonly start: number | undefined;
  /** The changes of level, oldest first. */
  readonly edges: readonly TraceEdge[];
  /** The marks, oldest first. */
  readonly marks: readonly TraceMark[];
}

/** A trace with no marks that starts at `start`, as at the start of a run; an LED starts low, at 0. */
export function emptyTrace(start: number | undefined): Trace {
  return { start, edges: [], marks: [] };
}

/** The level the output has after the last edge kept. */
export function traceLevel(trace: Trace): number | undefined {
  return trace.edges.at(-1)?.level ?? trace.start;
}

/** Drops what ended before the window that ends at `now`, keeping the level the output had when the window starts. */
function prune(trace: Trace, now: number): Trace {
  const from = now - TRACE_WINDOW_MS;
  let { start } = trace;
  let first = 0;
  while (first < trace.edges.length && (trace.edges[first].at < from || trace.edges.length - first > MAX_EDGES)) {
    start = trace.edges[first].level;
    first++;
  }
  const marks = trace.marks.filter((mark) => mark.at >= from).slice(-MAX_MARKS);
  if (first === 0 && marks.length === trace.marks.length) return trace;
  return { start, edges: trace.edges.slice(first), marks };
}

/**
 * The trace after the board's output stood at `level` at `at`: a level other than the last one kept is a change. A
 * level the page does not know, `undefined`, changes nothing.
 */
export function recordLevel(trace: Trace, level: number | undefined, at: number): Trace {
  if (level === undefined || level === traceLevel(trace)) return trace;
  return prune({ ...trace, edges: [...trace.edges, { at, level }] }, at);
}

/**
 * The trace after a change on the board that did `effects`: a sent line leaves a `sent` mark at `sentAt` and a line
 * the program read an `applied` mark at `at`.
 */
export function recordEffects(trace: Trace, effects: readonly Effect[], at: number, sentAt = at): Trace {
  let next = trace;
  for (const effect of effects) {
    if (effect.kind === 'sent') {
      next = { ...next, marks: [...next.marks, { kind: 'sent', id: effect.line.id, at: sentAt }] };
    } else if (effect.kind === 'read') {
      next = { ...next, marks: [...next.marks, { kind: 'applied', id: effect.line.id, at }] };
    }
  }
  return next === trace ? trace : prune(next, Math.max(at, sentAt));
}

/**
 * The board's present for the trace: the simulated clock, moved on by the share of the line under way that has
 * elapsed, so the trace scrolls while a line takes its time. With reduced motion the trace moves only line by line.
 */
export function traceTime(
  view: Pick<RunnerView<unknown>, 'millis' | 'cost'>,
  progress: number,
  reduceMotion: boolean,
): number {
  return reduceMotion ? view.millis : view.millis + progress * view.cost;
}

/** The trace drawn `width` pixels wide and {@link TRACE_HEIGHT} high, as SVG path data. */
export interface TraceShape {
  /** A line at each second. */
  readonly grid: string;
  /** The output's level; empty while it is not known. */
  readonly level: string;
  /** A bar with a triangle at its top for each line sent. */
  readonly sent: string;
  /** A bar with a dot at its foot for each line applied. */
  readonly applied: string;
}

const px = (value: number): string => value.toFixed(1);

/** The trace as it stands at `now`, the right edge, with the window's start at the left edge. */
export function traceShape(trace: Trace, now: number, width: number): TraceShape {
  const x = (at: number) => Math.min(width, Math.max(0, width - ((now - at) / TRACE_WINDOW_MS) * width));
  const seconds = TRACE_WINDOW_MS / 1000;
  const grid = Array.from({ length: seconds - 1 }, (_, i) => `M${px((width * (i + 1)) / seconds)} 0V${TRACE_HEIGHT}`);
  let level = trace.start === undefined ? '' : `M0 ${levelY(trace.start)}`;
  for (const edge of trace.edges) {
    level += level === '' ? `M${px(x(edge.at))} ${levelY(edge.level)}` : `H${px(x(edge.at))}V${levelY(edge.level)}`;
  }
  if (level !== '') level += `H${px(width)}`;
  const bar = (at: number) => `M${px(x(at) - 1)} 3h2v${TRACE_HEIGHT - 6}h-2z`;
  const marks = (kind: TraceMarkKind, shape: (left: number) => string) =>
    trace.marks
      .filter((mark) => mark.kind === kind && now - mark.at <= TRACE_WINDOW_MS)
      .map((mark) => bar(mark.at) + shape(x(mark.at)))
      .join('');
  return {
    grid: grid.join(''),
    level,
    sent: marks('sent', (left) => `M${px(left - 5)} 2h10l-5 7z`),
    applied: marks('applied', (left) => `M${px(left - 4)} ${TRACE_HEIGHT - 6}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z`),
  };
}
