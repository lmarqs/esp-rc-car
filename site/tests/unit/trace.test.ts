import { describe, expect, it } from 'vitest';
import type { Effect } from '../../src/lib/workbench/simulator';
import {
  emptyTrace,
  HIGH_Y,
  LOW_Y,
  recordEffects,
  TRACE_WINDOW_MS,
  traceLevel,
  traceShape,
  traceTime,
} from '../../src/lib/workbench/trace';

const PIN = 2;
const write = (high: boolean, pin = PIN): Effect => ({ kind: 'write', pin, high });
const sent = (id: number, text = 'x'): Effect => ({ kind: 'sent', line: { id, text } });
const read = (id: number, text = 'x'): Effect => ({ kind: 'read', line: { id, text } });

describe('recordEffects', () => {
  it('keeps a change of level on the pin, and ignores another pin and a write of the same level', () => {
    let trace = recordEffects(emptyTrace(), [write(true)], PIN, 1000);
    trace = recordEffects(trace, [write(true), write(false, 5)], PIN, 1500);
    trace = recordEffects(trace, [write(false)], PIN, 2000);
    expect(trace.edges).toEqual([
      { at: 1000, high: true },
      { at: 2000, high: false },
    ]);
    expect(traceLevel(trace)).toBe(false);
  });

  it('marks a sent line at its own time and the read of it, with the same id, when the program reads it', () => {
    let trace = recordEffects(emptyTrace(), [sent(7, '1500')], PIN, 1000, 1400);
    trace = recordEffects(trace, [read(7, '1500')], PIN, 2000);
    expect(trace.marks).toEqual([
      { kind: 'sent', id: 7, at: 1400 },
      { kind: 'applied', id: 7, at: 2000 },
    ]);
  });

  it('ignores a print', () => {
    const trace = emptyTrace();
    expect(recordEffects(trace, [{ kind: 'print', text: 'HIGH' }], PIN, 10)).toBe(trace);
  });

  it('forgets what lies before the window, keeping the level the window starts with', () => {
    let trace = recordEffects(emptyTrace(), [write(true), sent(1)], PIN, 1000);
    trace = recordEffects(trace, [write(false)], PIN, 2000);
    trace = recordEffects(trace, [write(true)], PIN, 2000 + TRACE_WINDOW_MS + 1);
    expect(trace.start).toBe(false);
    expect(trace.edges).toEqual([{ at: 2000 + TRACE_WINDOW_MS + 1, high: true }]);
    expect(trace.marks).toEqual([]);
  });

  it('keeps a bounded number of edges however fast the pin changes', () => {
    let trace = emptyTrace();
    for (let at = 0; at < 2000; at++) trace = recordEffects(trace, [write(at % 2 === 0)], PIN, at);
    expect(trace.edges.length).toBeLessThanOrEqual(512);
    expect(trace.edges.at(-1)).toEqual({ at: 1999, high: false });
    expect(trace.start).toBe(!trace.edges[0].high);
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
    let trace = recordEffects(emptyTrace(), [write(true)], PIN, 5000);
    trace = recordEffects(trace, [write(false)], PIN, 7500);
    const shape = traceShape(trace, 10_000, 400);
    expect(shape.level).toBe(`M0 ${LOW_Y}H200.0V${HIGH_Y}H300.0V${LOW_Y}H400.0`);
  });

  it('pins an edge older than the window to the left edge', () => {
    const trace = { start: false, edges: [{ at: 0, high: true }], marks: [] };
    expect(traceShape(trace, 12_000, 100).level).toBe(`M0 ${LOW_Y}H0.0V${HIGH_Y}H100.0`);
  });

  it('draws a sent mark and its applied mark where they happened, each in its own path', () => {
    let trace = recordEffects(emptyTrace(), [sent(1)], PIN, 4000);
    trace = recordEffects(trace, [read(1)], PIN, 9000);
    const shape = traceShape(trace, 10_000, 1000);
    expect(shape.sent).toMatch(/^M399\.0 3h2v58h-2z/);
    expect(shape.applied).toMatch(/^M899\.0 3h2v58h-2z/);
  });

  it('draws nothing for a mark that left the window, and a line at each second', () => {
    const trace = { start: false, edges: [], marks: [{ kind: 'sent' as const, id: 1, at: 0 }] };
    const shape = traceShape(trace, TRACE_WINDOW_MS + 1, 1000);
    expect(shape.sent).toBe('');
    expect(shape.grid.match(/M/g)).toHaveLength(9);
  });
});
