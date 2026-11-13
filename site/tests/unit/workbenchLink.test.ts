import { describe, expect, it } from 'vitest';
import type { SessionState } from '../../src/lib/flash/session';
import { sketchOf } from '../../src/lib/flash/lines';
import { boardDot, boardStatus, isConnected, paneMode } from '../../src/lib/workbench/link';

const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const lost: SessionState = { kind: 'running', chip: 'ESP32', output: [], lost: true };

describe('sketchOf', () => {
  it('reads the key of a sketch line', () => {
    expect(sketchOf('sketch blink/input')).toBe('blink/input');
  });

  it('reads nothing from any other line', () => {
    expect(['HIGH', 'sketch', 'sketch ', 'sketch a b', ' sketch blink/input', 'sketches blink'].map(sketchOf)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('isConnected', () => {
  it('holds a board only while it runs and is not lost', () => {
    const states: SessionState[] = [{ kind: 'idle' }, { kind: 'connecting' }, { kind: 'noPort' }, running, lost];
    expect(states.map(isConnected)).toEqual([false, false, false, true, false]);
  });
});

const STEPS = ['blink/simple', 'blink/input', 'blink/timer', 'blink/commands'];
const IDS = ['simple', 'input', 'timer', 'commands'];

describe('boardStatus', () => {
  it('is Simulated before a board is connected, whatever was heard', () => {
    expect(boardStatus({ kind: 'idle' }, 'blink/simple', 'blink/simple', STEPS, IDS)).toEqual({ kind: 'simulated' });
    expect(boardStatus({ kind: 'unsupported' }, undefined, 'blink/simple', STEPS, IDS)).toEqual({ kind: 'simulated' });
  });

  it('is Connected on a connected board that has not named its sketch yet', () => {
    expect(boardStatus(running, undefined, 'blink/simple', STEPS, IDS)).toEqual({ kind: 'connected' });
  });

  it('is Live when the board runs the selected step', () => {
    expect(boardStatus(running, 'blink/input', 'blink/input', STEPS, IDS)).toEqual({ kind: 'live' });
  });

  it('names the step by its id as its tab does when the board runs another step of the project', () => {
    expect(boardStatus(running, 'blink/commands', 'blink/input', STEPS, IDS)).toEqual({
      kind: 'step',
      key: 'blink/commands',
      id: 'commands',
    });
    expect(boardStatus(running, 'blink/simple', 'blink/input', STEPS, IDS)).toEqual({ kind: 'step', key: 'blink/simple', id: 'simple' });
  });

  it('keeps the key of a sketch from outside the project', () => {
    expect(boardStatus(running, 'servo/sweep', 'blink/input', STEPS, IDS)).toEqual({ kind: 'sketch', key: 'servo/sweep' });
  });

  it('is Simulated again once the board is lost', () => {
    expect(boardStatus(lost, 'blink/input', 'blink/input', STEPS, IDS)).toEqual({ kind: 'simulated' });
  });
});

describe('boardDot', () => {
  it('is off without a board, busy while the session works and on while it holds a board', () => {
    const states: SessionState[] = [
      { kind: 'idle' },
      { kind: 'unsupported' },
      { kind: 'noPort' },
      { kind: 'connecting' },
      { kind: 'flashing', chip: 'ESP32', pct: 10 },
      running,
      lost,
    ];
    expect(states.map(boardDot)).toEqual(['off', 'off', 'off', 'busy', 'busy', 'on', 'off']);
  });
});

describe('paneMode', () => {
  it('is the simulator whenever the visitor chose it, whatever the board runs', () => {
    expect(paneMode({ kind: 'simulated' }, 'simulator')).toBe('simulator');
    expect(paneMode({ kind: 'live' }, 'simulator')).toBe('simulator');
    expect(paneMode({ kind: 'step', key: 'blink/simple', id: 'simple' }, 'simulator')).toBe('simulator');
  });

  it('follows the board under My board while it runs the selected step', () => {
    expect(paneMode({ kind: 'live' }, 'board')).toBe('live');
  });

  it('waits under My board while the board does not run the selected step', () => {
    expect(paneMode({ kind: 'simulated' }, 'board')).toBe('waiting');
    expect(paneMode({ kind: 'connected' }, 'board')).toBe('waiting');
    expect(paneMode({ kind: 'step', key: 'blink/simple', id: 'simple' }, 'board')).toBe('waiting');
    expect(paneMode({ kind: 'sketch', key: 'servo/sweep' }, 'board')).toBe('waiting');
  });
});
