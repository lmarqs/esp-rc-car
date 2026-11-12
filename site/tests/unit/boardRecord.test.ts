import { describe, expect, it } from 'vitest';
import { EMPTY_RECORD, KEPT_LINES, recordBoard, runs, sketchOf, type BoardRecord } from '../../src/lib/board/record';
import type { SessionState } from '../../src/lib/flash';

const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const line = (text: string, at = 0) => ({ kind: 'line', line: { text, at } }) as const;
const state = (from: SessionState, to: SessionState) => ({ kind: 'state', from, to }) as const;

describe('sketchOf', () => {
  it('reads the key of a sketch line, and nothing from any other line', () => {
    expect(sketchOf('sketch blink/input')).toBe('blink/input');
    expect(['HIGH', 'sketch', 'sketch a b'].map(sketchOf)).toEqual([undefined, undefined, undefined]);
  });
});

describe('the board record', () => {
  it('runs what the board said it runs, over what the site flashed', () => {
    expect(runs({ lines: [], flashed: 'blink/simple' })).toBe('blink/simple');
    expect(runs({ lines: [], flashed: 'blink/simple', heard: 'blink/input' })).toBe('blink/input');
    expect(runs(EMPTY_RECORD)).toBeUndefined();
  });

  it('hears the sketch a line names, and keeps the printed lines but not the blank or cfg ones', () => {
    let record = recordBoard(EMPTY_RECORD, line('sketch blink/serial', 1));
    record = recordBoard(record, line('', 2));
    record = recordBoard(record, line('cfg end', 3));
    record = recordBoard(record, line('HIGH', 4));

    expect(record.heard).toBe('blink/serial');
    expect(record.lines.map((kept) => kept.text)).toEqual(['sketch blink/serial', 'HIGH']);
  });

  it(`keeps the last ${KEPT_LINES} lines`, () => {
    let record: BoardRecord = EMPTY_RECORD;
    for (let at = 0; at < KEPT_LINES + 5; at++) record = recordBoard(record, line(`n ${at}`, at));

    expect(record.lines).toHaveLength(KEPT_LINES);
    expect(record.lines[0]!.text).toBe('n 5');
  });

  it('holds the key a flash writes once the board runs it', () => {
    let record = recordBoard(EMPTY_RECORD, { kind: 'flash', key: 'blink/timer' });
    record = recordBoard(record, state(running, { kind: 'connecting' }));
    record = recordBoard(record, state({ kind: 'connecting' }, { kind: 'flashing', chip: 'ESP32', pct: 0 }));
    expect(record.flashed).toBeUndefined();
    record = recordBoard(record, state({ kind: 'flashing', chip: 'ESP32', pct: 100 }, running));

    expect(record).toEqual({ flashed: 'blink/timer', lines: [] });
  });

  it('forgets what the board ran and printed on a new connection', () => {
    const before: BoardRecord = { heard: 'blink/input', flashed: 'blink/input', lines: [{ text: 'HIGH', at: 0 }] };

    expect(recordBoard(before, state(running, { kind: 'connecting' }))).toEqual({ lines: [] });
  });

  it('forgets everything once the board is released or a connection fails', () => {
    const before: BoardRecord = { heard: 'blink/input', lines: [{ text: 'HIGH', at: 0 }] };

    expect(recordBoard(before, state(running, { kind: 'idle', released: true }))).toEqual(EMPTY_RECORD);
    expect(recordBoard(before, state({ kind: 'connecting' }, { kind: 'noPort' }))).toEqual(EMPTY_RECORD);
  });

  it('drops the key of a refused flash, which wrote nothing', () => {
    let record = recordBoard({ flashed: 'blink/simple', lines: [] }, { kind: 'flash', key: 'servo/sweep' });
    record = recordBoard(record, state(running, { ...running, flashRefused: { key: 'servo/sweep', available: [] } }));

    expect(record).toEqual({ flashed: 'blink/simple', lines: [] });
  });
});

describe('the record of a board left in flash mode', () => {
  const flashing: SessionState = { kind: 'flashing', chip: 'ESP8266', pct: 100 };
  const flashMode: SessionState = { kind: 'flashMode', chip: 'ESP8266' };

  it('holds the key that was written, and still does once the board is read again', () => {
    let record = recordBoard(EMPTY_RECORD, { kind: 'flash', key: 'blink/simple' });
    record = recordBoard(record, state(flashing, flashMode));
    expect(record).toEqual({ flashed: 'blink/simple', lines: [] });

    record = recordBoard(record, state(flashMode, { kind: 'connecting' }));
    record = recordBoard(record, state({ kind: 'connecting' }, { kind: 'running', chip: 'ESP8266', output: [] }));

    expect(runs(record)).toBe('blink/simple');
  });

  it('still holds it after a reconnect that failed, such as a closed port picker', () => {
    let record = recordBoard(EMPTY_RECORD, { kind: 'flash', key: 'blink/simple' });
    record = recordBoard(record, state(flashing, flashMode));
    record = recordBoard(record, state(flashMode, { kind: 'connecting' }));
    record = recordBoard(record, state({ kind: 'connecting' }, { kind: 'noPort', awaitingRun: true }));
    record = recordBoard(record, state({ kind: 'noPort', awaitingRun: true }, { kind: 'connecting' }));
    record = recordBoard(record, state({ kind: 'connecting' }, { kind: 'running', chip: 'ESP8266', output: [] }));

    expect(runs(record)).toBe('blink/simple');
  });
});
