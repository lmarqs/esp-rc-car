import { describe, expect, it } from 'vitest';
import {
  applyBlinkEvent,
  blinkWatch,
  initialBlinkBoard,
  measuredInterval,
  type BlinkBoard,
} from '../../src/lib/workbench/blinkBoard';
import type { BlinkEvent } from '../../src/lib/workbench/steps/blink';

function after(events: readonly [BlinkEvent, number][], board: BlinkBoard = initialBlinkBoard()): BlinkBoard {
  return events.reduce((state, [event, at]) => applyBlinkEvent(state, event, at), board);
}

const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

describe('applyBlinkEvent', () => {
  it('starts with the LED off, a wait of 1000 ms, not paused and nothing measured', () => {
    const board = initialBlinkBoard();
    expect(board).toEqual({ ledOn: false, wait: 1000, paused: false, changes: [] });
    expect(measuredInterval(board)).toBeUndefined();
  });

  it('sets the LED from HIGH and LOW and measures the time between the last two changes', () => {
    const board = after([
      [{ kind: 'high' }, 10],
      [{ kind: 'low' }, 1010],
      [{ kind: 'high' }, 1510],
    ]);
    expect(board.ledOn).toBe(true);
    expect(measuredInterval(board)).toBe(500);
  });

  it('does not time a line that repeats the level the LED already has', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'low' }, 1000],
      [{ kind: 'low' }, 1500],
    ]);
    expect(measuredInterval(board)).toBe(1000);
  });

  it('takes the wait from a delay line and the pause from paused and running', () => {
    expect(after([[{ kind: 'delay', ms: 300 }, 0]]).wait).toBe(300);
    expect(after([[{ kind: 'paused' }, 0]]).paused).toBe(true);
    expect(
      after([
        [{ kind: 'paused' }, 0],
        [{ kind: 'running' }, 5],
      ]).paused,
    ).toBe(false);
  });

  it('starts over when the board prints its sketch line', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'delay', ms: 300 }, 5],
      [{ kind: 'sketch', key: 'blink/input' }, 9],
    ]);
    expect(board).toEqual(initialBlinkBoard());
  });
});

describe('blinkWatch', () => {
  it('shows LED, wait and measured on every step, millis() on timer and commands, paused on commands', () => {
    const board = initialBlinkBoard();
    expect(names(blinkWatch('blink/simple', board, 0))).toEqual(['LED', 'wait', 'measured']);
    expect(names(blinkWatch('blink/input', board, 0))).toEqual(['LED', 'wait', 'measured']);
    expect(names(blinkWatch('blink/timer', board, 0))).toEqual(['LED', 'wait', 'measured', 'millis()']);
    expect(names(blinkWatch('blink/commands', board, 0))).toEqual(['LED', 'wait', 'measured', 'millis()', 'paused']);
  });

  it('writes each value as the panel shows it', () => {
    const board = after([
      [{ kind: 'high' }, 0],
      [{ kind: 'low' }, 1000],
      [{ kind: 'delay', ms: 300 }, 1000],
      [{ kind: 'paused' }, 1000],
    ]);
    expect(blinkWatch('blink/commands', board, 1234)).toEqual([
      { name: 'LED', value: 'LOW' },
      { name: 'wait', value: '300 ms' },
      { name: 'measured', value: '1000 ms' },
      { name: 'millis()', value: '1234' },
      { name: 'paused', value: 'true' },
    ]);
  });

  it('marks the written-in wait of simple as fixed, and an unknown measure or clock with an ellipsis', () => {
    const rows = blinkWatch('blink/timer', initialBlinkBoard(), undefined);
    expect(rows).toContainEqual({ name: 'measured', value: '…' });
    expect(rows).toContainEqual({ name: 'millis()', value: '…' });
    expect(blinkWatch('blink/simple', initialBlinkBoard(), 0)).toContainEqual({ name: 'wait', value: '1000 ms (fixed)' });
  });
});
