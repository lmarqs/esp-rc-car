import { describe, expect, it } from 'vitest';
import type { Effect } from '../../src/lib/workbench/simulator';
import {
  emptyTrace,
  HIGH_Y,
  levelY,
  LOW_Y,
  MAX_EDGES,
  recordEffects,
  recordLevel,
  TRACE_WINDOW_MS,
  traceLevel,
  traceShape,
  traceTime,
  type Trace,
} from '../../src/lib/workbench/trace';

/** The trace after the LED was `high` or low at `at`, as the Blink board reports it. */
const led = (trace: Trace, high: boolean, at: number) => recordLevel(trace, high ? 1 : 0, at);
const sent = (id: number, text = 'x'): Effect => ({ kind: 'sent', line: { id, text } });
const read = (id: number, text = 'x'): Effect => ({ kind: 'read', line: { id, text } });

describe('recordLevel', () => {
  it('keeps a change of level, and ignores the level it already has', () => {
    let trace = led(emptyTrace(0), true, 1000);
    trace = led(trace, true, 1500);
    trace = led(trace, false, 2000);
    expect(trace.edges).toEqual([
      { at: 1000, level: 1 },
      { at: 2000, level: 0 },
    ]);
    expect(traceLevel(trace)).toBe(0);
  });

  it('keeps any share of the range, such as a servo angle, and ignores a level the page does not know', () => {
    let trace = recordLevel(emptyTrace(undefined), undefined, 0);
    expect(trace).toEqual(emptyTrace(undefined));
    trace = recordLevel(trace, 0.5, 100);
    trace = recordLevel(trace, undefined, 200);
    expect(trace.edges).toEqual([{ at: 100, level: 0.5 }]);
  });

  it('forgets what lies before the window, keeping the level the window starts with', () => {
    let trace = recordEffects(led(emptyTrace(0), true, 1000), [sent(1)], 1000);
    trace = led(trace, false, 2000);
    trace = led(trace, true, 2000 + TRACE_WINDOW_MS + 1);
    expect(trace.start).toBe(0);
    expect(trace.edges).toEqual([{ at: 2000 + TRACE_WINDOW_MS + 1, level: 1 }]);
    expect(trace.marks).toEqual([]);
  });

  it('keeps a bounded number of edges however fast the level changes', () => {
    let trace = emptyTrace(0);
    for (let at = 0; at < 2 * MAX_EDGES; at++) trace = led(trace, at % 2 === 0, at);
    expect(trace.edges.length).toBeLessThanOrEqual(MAX_EDGES);
    expect(trace.edges.at(-1)).toEqual({ at: 2 * MAX_EDGES - 1, level: 0 });
    expect(trace.start).toBe(1 - trace.edges[0].level);
  });

  it('keeps every degree of a servo sweeping one degree every 15 ms over the whole window', () => {
    let trace = emptyTrace(undefined);
    for (let at = 0; at <= TRACE_WINDOW_MS; at += 15) trace = recordLevel(trace, ((at / 15) % 180) / 180, at);
    expect(trace.edges[0].at).toBe(0);
  });
});

describe('recordEffects', () => {
  it('marks a sent line at its own time and the read of it, with the same id, when the program reads it', () => {
    let trace = recordEffects(emptyTrace(0), [sent(7, '1500')], 1000, 1400);
    trace = recordEffects(trace, [read(7, '1500')], 2000);
    expect(trace.marks).toEqual([
      { kind: 'sent', id: 7, at: 1400 },
      { kind: 'applied', id: 7, at: 2000 },
    ]);
  });

  it('ignores a print and a write, whose level the board model gives', () => {
    const trace = emptyTrace(0);
    const effects: Effect[] = [
      { kind: 'print', text: 'HIGH' },
      { kind: 'write', pin: 2, high: true },
    ];
    expect(recordEffects(trace, effects, 10)).toBe(trace);
  });
});

describe('traceTime', () => {
  it('moves on by the share of the line under way, or line by line under reduced motion', () => {
    expect(traceTime({ millis: 3000, cost: 1000 }, 0.25, false)).toBe(3250);
    expect(traceTime({ millis: 3000, cost: 1000 }, 0.25, true)).toBe(3000);
    expect(traceTime({ millis: 3000, cost: 0 }, 0.5, false)).toBe(3000);
  });
});

describe('traceShape', () => {
  it('draws the level from the left edge to the right, rising and falling at each edge', () => {
    let trace = led(emptyTrace(0), true, 5000);
    trace = led(trace, false, 7500);
    const shape = traceShape(trace, 10_000, 400);
    expect(shape.level).toBe(`M0 ${LOW_Y}H200.0V${HIGH_Y}H300.0V${LOW_Y}H400.0`);
  });

  it('draws a share of the range in between, and nothing before the first level it knows', () => {
    expect(levelY(0)).toBe(LOW_Y);
    expect(levelY(1)).toBe(HIGH_Y);
    expect(levelY(0.5)).toBe(29.5);
    expect(traceShape(emptyTrace(undefined), 10_000, 400).level).toBe('');
    const trace = recordLevel(recordLevel(emptyTrace(undefined), 0.5, 5000), 1, 7500);
    expect(traceShape(trace, 10_000, 400).level).toBe(`M200.0 29.5H300.0V${HIGH_Y}H400.0`);
  });

  it('pins an edge older than the window to the left edge', () => {
    const trace = { start: 0, edges: [{ at: 0, level: 1 }], marks: [] };
    expect(traceShape(trace, 12_000, 100).level).toBe(`M0 ${LOW_Y}H0.0V${HIGH_Y}H100.0`);
  });

  it('draws a dashed line where the trace’s source took the pane, and starts the level there', () => {
    const shape = traceShape(emptyTrace(0, 4000), 10_000, 1000);
    expect(shape.level).toBe(`M400.0 ${LOW_Y}H1000.0`);
    expect(shape.source).toBe('M400.0 0V64');
  });

  it('draws no source line, and starts the level at the left edge, when the source took the pane before the window', () => {
    const older = traceShape(emptyTrace(0, -1), 10_000, 1000);
    expect(older.source).toBe('');
    expect(older.level).toMatch(/^M0 /);
    const unset = traceShape(emptyTrace(0), 10_000, 1000);
    expect(unset.source).toBe('');
    expect(unset.level).toMatch(/^M0 /);
  });

  it('keeps when the source took the pane as the window moves on', () => {
    let trace = led(emptyTrace(0, 4000), true, 5000);
    trace = led(trace, false, 8000);
    expect(trace.since).toBe(4000);
    expect(traceShape(trace, 12_000, 1000).source).toBe('M200.0 0V64');
  });

  it('draws a sent mark and its applied mark where they happened, each in its own path', () => {
    let trace = recordEffects(emptyTrace(0), [sent(1)], 4000);
    trace = recordEffects(trace, [read(1)], 9000);
    const shape = traceShape(trace, 10_000, 1000);
    expect(shape.sent).toMatch(/^M399\.0 3h2v58h-2z/);
    expect(shape.applied).toMatch(/^M899\.0 3h2v58h-2z/);
  });

  it('draws nothing for a mark that left the window, and a line at each second', () => {
    const trace = { start: 0, edges: [], marks: [{ kind: 'sent' as const, id: 1, at: 0 }] };
    const shape = traceShape(trace, TRACE_WINDOW_MS + 1, 1000);
    expect(shape.sent).toBe('');
    expect(shape.grid.match(/M/g)).toHaveLength(9);
  });
});
