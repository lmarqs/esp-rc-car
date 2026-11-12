import { describe, expect, it } from 'vitest';
import type { SessionState } from '../../src/lib/flash/session';
import { boardAction, boardStatus, isConnected, sketchOf } from '../../src/lib/workbench/link';

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

describe('boardStatus', () => {
  it('is Simulated before a board is connected, whatever was heard', () => {
    expect(boardStatus({ kind: 'idle' }, 'blink/simple', 'blink/simple')).toEqual({ kind: 'simulated' });
    expect(boardStatus({ kind: 'unsupported' }, undefined, 'blink/simple')).toEqual({ kind: 'simulated' });
  });

  it('is Simulated on a connected board that has not named its sketch yet', () => {
    expect(boardStatus(running, undefined, 'blink/simple')).toEqual({ kind: 'simulated' });
  });

  it('is Live when the board runs the selected step', () => {
    expect(boardStatus(running, 'blink/input', 'blink/input')).toEqual({ kind: 'live' });
  });

  it('names the key when the board runs another sketch', () => {
    expect(boardStatus(running, 'blink/simple', 'blink/input')).toEqual({ kind: 'other', key: 'blink/simple' });
  });

  it('is Simulated again once the board is lost', () => {
    expect(boardStatus(lost, 'blink/input', 'blink/input')).toEqual({ kind: 'simulated' });
  });
});

describe('boardAction', () => {
  const connect = { label: 'Connect', icon: 'plug', event: 'connect', disabled: false };

  it('offers no button in a browser that cannot reach a board', () => {
    expect(boardAction({ kind: 'unsupported' }, undefined, 'blink/simple')).toBeUndefined();
  });

  it('connects with a plug from idle, a failure or a lost board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, { kind: 'noAnswer' }, { kind: 'dropped', pct: 40 }, lost];
    for (const state of states) expect(boardAction(state, undefined, 'blink/simple')).toEqual(connect);
  });

  it('flashes the step with a bolt on a board that runs another sketch or has not named one', () => {
    const flashStep = { label: 'Flash step', icon: 'bolt', event: 'flash', disabled: false };
    expect(boardAction(running, 'blink/simple', 'blink/input')).toEqual(flashStep);
    expect(boardAction(running, undefined, 'blink/input')).toEqual(flashStep);
  });

  it('flashes again on a board that runs the selected step', () => {
    expect(boardAction(running, 'blink/input', 'blink/input')).toEqual({
      label: 'Flash again',
      icon: 'bolt',
      event: 'flash',
      disabled: false,
    });
  });

  it('keeps the pressed action, disabled, while the session works', () => {
    const pressed = { label: 'Flash again', icon: 'bolt', event: 'flash', disabled: false } as const;
    expect(boardAction({ kind: 'flashing', chip: 'ESP32', pct: 40 }, undefined, 'blink/input', pressed)).toEqual({
      ...pressed,
      disabled: true,
    });
    expect(boardAction({ kind: 'connecting' }, undefined, 'blink/input')).toEqual({ ...connect, disabled: true });
  });
});
