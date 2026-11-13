import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/components/flash/view';
import { boardMessage, connectionView, type ConnectionInput } from '../../src/lib/board/connection';
import { flashScene } from '../../src/lib/board/flashScene';
import { boardModel } from '../../src/lib/board/models';
import { EMPTY_RECORD } from '../../src/lib/board/record';
import type { SessionState } from '../../src/lib/flash/session';

describe('boardMessage', () => {
  const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };

  it('shows the picture while idle, while running and in a browser that cannot reach a board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, running, { kind: 'unsupported' }];
    expect(states.map((state) => boardMessage(state, 'blink/input', true))).toEqual([undefined, undefined, undefined]);
  });

  it("says what the page does in the flash card's words, and to keep the board plugged in while flashing", () => {
    expect(boardMessage({ kind: 'connecting' }, 'blink/input', true)).toEqual({
      text: viewFor({ kind: 'connecting' }, { title: '' }).message,
      notice: false,
    });
    expect(boardMessage({ kind: 'flashing', chip: 'ESP32', pct: 40 }, 'blink/input', true)).toEqual({
      text: 'Found ESP32. Keep the board plugged in.',
      notice: false,
    });
  });

  it("gives a failure to connect or a lost board the flash card's notice, naming the step for a missing image", () => {
    const failures: SessionState[] = [
      { kind: 'noPort' },
      { kind: 'portBusy' },
      { kind: 'noAnswer' },
      { kind: 'running', chip: 'ESP32', output: [], lost: true },
    ];
    for (const state of failures) {
      expect(boardMessage(state, 'blink/input', true)).toEqual({
        text: viewFor(state, { title: 'blink/input' }).message,
        notice: true,
      });
    }
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, 'blink/input', true)?.text).toBe(
      'This board is an ESP8266. blink/input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32', 'ESP32-C3'] }, 'blink/input', true)?.text).toBe(
      'This board is an ESP8266. blink/input has images for: ESP32, ESP32-C3. Connect an ESP32 or ESP32-C3, or pick another step.',
    );
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: [] }, 'blink/input', true)?.text).toMatch(
      /\. Pick another step\.$/,
    );
  });

  it('tells the visitor to press Try again after a failed flash, as its button reads', () => {
    expect(boardMessage({ kind: 'noDownload' }, 'blink/input', true)).toEqual({
      text: 'The image did not download. Check your internet connection. Then press Try again.',
      notice: true,
    });
    expect(boardMessage({ kind: 'dropped', pct: 40 }, 'blink/input', true)).toEqual({
      text: 'The connection dropped at 40%. Nothing is broken. Plug the board back in. Then press Try again.',
      notice: true,
    });
  });

  it('shows a refused flash until the page drops it', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/timer', available: ['ESP32'] } };
    expect(boardMessage(refused, 'blink/input', true)).toEqual({
      text: 'This board is an ESP32. blink/timer has images for: ESP32. Connect an ESP32, or pick another step.',
      notice: true,
    });
    expect(boardMessage(refused, 'blink/input', false)).toBeUndefined();
  });
});

const sketch = { key: 'blink/input', title: 'Blink · 3 input' };
const esp01s = boardModel('esp01s');
const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const lost: SessionState = { ...running, lost: true };

/** The dock's view for `state`, with a sketch open unless `opened` says otherwise. */
function viewOf(state: SessionState, rest: Partial<ConnectionInput> = {}) {
  return connectionView({ state, record: EMPTY_RECORD, opened: sketch, pick: undefined, ...rest });
}

describe('connectionView action', () => {
  it('connects from idle, and flashes the open sketch in the same press', () => {
    expect(viewOf({ kind: 'idle' }).action).toEqual({
      label: 'Flash Blink · 3 input',
      icon: 'bolt',
      event: 'connect',
      disabled: false,
    });
    expect(viewOf({ kind: 'idle', released: true }, { opened: undefined }).action).toEqual({
      label: 'Connect board',
      icon: 'plug',
      event: 'connect',
      disabled: false,
    });
  });

  it('is disabled while the session works, named by the press or else by what the session does', () => {
    const connecting = { label: 'Connecting…', icon: 'plug', event: 'connect', disabled: true };
    const flashing = { label: 'Flashing…', icon: 'bolt', event: 'flash', disabled: true };
    for (const opened of [sketch, undefined]) {
      expect(viewOf({ kind: 'connecting' }, { opened }).action).toEqual(connecting);
      expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 10 }, { opened }).action).toEqual(flashing);
      expect(viewOf({ kind: 'reading', chip: 'ESP32' }, { opened }).action).toEqual(connecting);
      expect(viewOf({ kind: 'applying', chip: 'ESP32' }, { opened }).action).toEqual(connecting);
      expect(viewOf({ kind: 'settings', chip: 'ESP32', opened: {} }, { opened }).action).toEqual(connecting);
    }
    expect(viewOf({ kind: 'connecting' }, { pressed: 'flash' }).action).toEqual(flashing);
    expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 10 }, { pressed: 'connect' }).action).toEqual(connecting);
    expect(viewOf({ kind: 'connecting' }, { pressed: 'retry' }).action).toEqual({
      ...connecting,
      icon: 'again',
      event: 'retry',
    });
  });

  it('says Flashing… once Try again, which connects first, has the session write', () => {
    expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 10 }, { pressed: 'retry' }).action).toEqual({
      label: 'Flashing…',
      icon: 'again',
      event: 'retry',
      disabled: true,
    });
  });

  it('flashes the open sketch from a running board in one press, and offers nothing without a sketch', () => {
    expect(viewOf(running).action).toEqual({ label: 'Flash Blink · 3 input', icon: 'bolt', event: 'flash', disabled: false });
    expect(viewOf(running, { opened: undefined }).action).toBeUndefined();
  });

  it('connects again from flash mode and from a lost board, with a sketch open or not', () => {
    const again = { label: 'Connect again', icon: 'plug', event: 'connect', disabled: false };
    for (const opened of [sketch, undefined]) {
      expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }, { opened }).action).toEqual(again);
      expect(viewOf(lost, { opened }).action).toEqual(again);
    }
  });

  it('offers Try again after a failure, which repeats the whole flash only when a flash failed', () => {
    const failures: SessionState[] = [
      { kind: 'noPort' },
      { kind: 'portBusy' },
      { kind: 'noAnswer' },
      { kind: 'noDownload' },
      { kind: 'dropped', pct: 40 },
    ];
    for (const state of failures) {
      for (const opened of [sketch, undefined]) {
        const press = (tried?: 'connect' | 'flash' | 'retry') => viewOf(state, { opened, tried }).action;
        const again = { label: 'Try again', icon: 'again', disabled: false };
        expect(press()).toEqual({ ...again, event: 'connect' });
        expect(press('connect')).toEqual({ ...again, event: 'connect' });
        expect(press('flash')).toEqual({ ...again, event: 'retry' });
        expect(press('retry')).toEqual({ ...again, event: 'retry' });
      }
    }
  });

  it('connects another board when the sketch has no image for this one, and offers nothing without a browser for it', () => {
    const noImage: SessionState = { kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] };
    for (const opened of [sketch, undefined]) {
      expect(viewOf(noImage, { opened }).action).toEqual({
        label: 'Connect board',
        icon: 'plug',
        event: 'connect',
        disabled: false,
      });
      expect(viewOf({ kind: 'unsupported' }, { opened }).action).toBeUndefined();
    }
  });
});

describe('connectionView message', () => {
  it('words each state as the board message does, naming the pending sketch for a missing image', () => {
    const noImage: SessionState = { kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] };
    expect(viewOf(noImage, { record: { lines: [], pending: 'blink/timer' } }).message).toEqual(
      boardMessage(noImage, 'blink/timer', true),
    );
    expect(viewOf(noImage).message?.text).toContain('blink/input has images for: ESP32');
    expect(viewOf(noImage, { opened: undefined }).message?.text).toContain('This sketch has images for: ESP32');
    expect(viewOf({ kind: 'noAnswer' }, { pick: esp01s }).message).toEqual(boardMessage({ kind: 'noAnswer' }, '', true, esp01s));
    expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }).message?.notice).toBe(true);
    expect(viewOf(lost).message).toEqual(boardMessage(lost, '', true));
  });

  it('says nothing while idle, while a board runs, and in a browser that cannot reach one', () => {
    expect(viewOf({ kind: 'idle' }).message).toBeUndefined();
    expect(viewOf(running).message).toBeUndefined();
    expect(viewOf({ kind: 'unsupported' }).message).toBeUndefined();
  });

  it('asks to press reset on an adapter whose board runs a sketch that has not named itself', () => {
    expect(viewOf(running, { pick: esp01s }).message).toEqual({
      text: 'Your board has not named its sketch. Press reset on its adapter, or flash Blink · 3 input to use it here.',
      notice: false,
    });
    expect(viewOf(running, { pick: esp01s, opened: undefined }).message).toEqual({
      text: 'Your board has not named its sketch. Press reset on its adapter to name it.',
      notice: false,
    });
  });

  it('leaves a board that has named its sketch, or whose adapter has no switch, unremarked', () => {
    expect(viewOf(running, { pick: esp01s, record: { lines: [], heard: 'blink/input' } }).message).toBeUndefined();
    expect(viewOf(running, { pick: esp01s, record: { lines: [], flashed: 'blink/input' } }).message).toBeUndefined();
    expect(viewOf(running, { pick: boardModel('esp32') }).message).toBeUndefined();
  });

  it('shows a refusal only while the page has the refused sketch open', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32-C3'] } };
    const shown = viewOf(refused);
    expect(shown.message).toEqual({
      text: 'This board is an ESP32. blink/input has images for: ESP32-C3. Connect an ESP32-C3, or pick another step.',
      notice: true,
    });
    expect(shown.open).toBe(true);
    expect(shown.action?.event).toBe('flash');

    for (const opened of [{ key: 'blink/timer', title: 'Blink · 4 timer' }, undefined]) {
      const dropped = viewOf(refused, { opened });
      expect(dropped.message).toBeUndefined();
      expect(dropped.open).toBe(false);
    }
  });
});

describe('connectionView open', () => {
  it('opens while the session works, waits in flash mode, failed or lost', () => {
    const open: SessionState[] = [
      { kind: 'connecting' },
      { kind: 'flashing', chip: 'ESP32', pct: 50 },
      { kind: 'settings', chip: 'ESP32', opened: {} },
      { kind: 'reading', chip: 'ESP32' },
      { kind: 'applying', chip: 'ESP32' },
      { kind: 'flashMode', chip: 'ESP8266' },
      { kind: 'noPort' },
      { kind: 'portBusy' },
      { kind: 'noAnswer' },
      { kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] },
      { kind: 'noDownload' },
      { kind: 'dropped', pct: 40 },
      lost,
    ];
    for (const state of open) expect(viewOf(state).open, state.kind).toBe(true);
  });

  it('stays closed while idle, while a board runs and in a browser that cannot reach one', () => {
    for (const state of [{ kind: 'idle' }, running, { kind: 'unsupported' }] as const) {
      expect(viewOf(state).open, state.kind).toBe(false);
    }
  });
});

describe('connectionView scene', () => {
  it('draws the session and the picked board', () => {
    const state: SessionState = { kind: 'noAnswer' };
    expect(viewOf(state, { pick: esp01s }).scene).toEqual(flashScene(state, esp01s));
    expect(viewOf(running).scene).toEqual(flashScene(running));
  });
});
