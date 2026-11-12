import { describe, expect, it } from 'vitest';
import type { SessionState } from '../../src/lib/flash/session';
import { sketchOf } from '../../src/lib/board/record';
import { boardAction, boardStatus, isConnected, paneMode } from '../../src/lib/workbench/link';

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

describe('boardStatus', () => {
  it('is Simulated before a board is connected, whatever was heard', () => {
    expect(boardStatus({ kind: 'idle' }, 'blink/simple', 'blink/simple', STEPS)).toEqual({ kind: 'simulated' });
    expect(boardStatus({ kind: 'unsupported' }, undefined, 'blink/simple', STEPS)).toEqual({ kind: 'simulated' });
  });

  it('is Connected on a connected board that has not named its sketch yet', () => {
    expect(boardStatus(running, undefined, 'blink/simple', STEPS)).toEqual({ kind: 'connected' });
  });

  it('is Live when the board runs the selected step', () => {
    expect(boardStatus(running, 'blink/input', 'blink/input', STEPS)).toEqual({ kind: 'live' });
  });

  it('numbers the step as the rail does when the board runs another step of the project', () => {
    expect(boardStatus(running, 'blink/commands', 'blink/input', STEPS)).toEqual({
      kind: 'step',
      key: 'blink/commands',
      number: 4,
    });
    expect(boardStatus(running, 'blink/simple', 'blink/input', STEPS)).toEqual({ kind: 'step', key: 'blink/simple', number: 1 });
  });

  it('keeps the key of a sketch from outside the project', () => {
    expect(boardStatus(running, 'servo/sweep', 'blink/input', STEPS)).toEqual({ kind: 'sketch', key: 'servo/sweep' });
  });

  it('is Simulated again once the board is lost', () => {
    expect(boardStatus(lost, 'blink/input', 'blink/input', STEPS)).toEqual({ kind: 'simulated' });
  });
});

describe('boardAction', () => {
  const connect = { label: 'Connect my board', icon: 'plug', event: 'connect', disabled: false };
  const input = { key: 'blink/input', number: 2 };

  it('offers no board half in a browser that cannot reach a board', () => {
    expect(boardAction({ kind: 'unsupported' }, undefined, input)).toBeUndefined();
  });

  it('connects with a plug from idle, a failure or a lost board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, { kind: 'noAnswer' }, { kind: 'dropped', pct: 40 }, lost];
    for (const state of states) expect(boardAction(state, undefined, input)).toEqual(connect);
  });

  it('flashes the step, by its number, on a board that runs another sketch or has not named one', () => {
    const flashStep = { label: 'Flash step 2 to board', short: 'Flash step 2', icon: 'bolt', event: 'flash', disabled: false };
    expect(boardAction(running, 'blink/simple', input)).toEqual(flashStep);
    expect(boardAction(running, undefined, input)).toEqual(flashStep);
  });

  it('reads My board, live, on a board that runs the selected step', () => {
    expect(boardAction(running, 'blink/input', input)).toEqual({
      label: 'My board, live',
      icon: 'dot',
      event: 'live',
      disabled: false,
    });
  });

  it('names a flash pressed elsewhere on the site, such as in the board dock, by what the session does', () => {
    expect(boardAction({ kind: 'flashing', chip: 'ESP32', pct: 40 }, undefined, input)).toMatchObject({
      label: 'Flashing…',
      event: 'flash',
      disabled: true,
    });
  });

  it('says what the session works on, disabled, while it is busy', () => {
    expect(boardAction({ kind: 'flashing', chip: 'ESP32', pct: 40 }, undefined, input, 'flash')).toEqual({
      label: 'Flashing…',
      icon: 'bolt',
      event: 'flash',
      disabled: true,
    });
    expect(boardAction({ kind: 'connecting' }, undefined, input)).toEqual({ ...connect, label: 'Connecting…', disabled: true });
  });

  it('goes back to the board while the simulator has the pane of a board that runs the selected step', () => {
    expect(boardAction(running, 'blink/input', input, undefined, true)).toEqual({
      label: 'My board',
      icon: 'dot',
      event: 'live',
      disabled: false,
    });
  });

  it('flashes the step, not back to the board, once the board runs another step', () => {
    expect(boardAction(running, 'blink/simple', input, undefined, true)).toMatchObject({ label: 'Flash step 2 to board' });
  });

  it('connects again, not back to the board, once the board is lost', () => {
    expect(boardAction(lost, 'blink/input', input, undefined, true)).toEqual(connect);
  });
});

describe('paneMode', () => {
  it('simulates while no board names its sketch', () => {
    expect(paneMode({ kind: 'simulated' }, false)).toBe('simulator');
    expect(paneMode({ kind: 'simulated' }, true)).toBe('simulator');
    expect(paneMode({ kind: 'connected' }, false)).toBe('simulator');
    expect(paneMode({ kind: 'connected' }, true)).toBe('simulator');
  });

  it('follows a board that runs the selected step, until the visitor hands the pane to the simulator', () => {
    expect(paneMode({ kind: 'live' }, false)).toBe('live');
    expect(paneMode({ kind: 'live' }, true)).toBe('simulator');
  });

  it('simulates the selected step while the board runs another step or sketch', () => {
    expect(paneMode({ kind: 'step', key: 'blink/simple', number: 1 }, false)).toBe('simulator');
    expect(paneMode({ kind: 'sketch', key: 'servo/sweep' }, true)).toBe('simulator');
  });
});
