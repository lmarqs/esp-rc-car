import { describe, expect, it } from 'vitest';
import { dockView } from '../../src/components/board/dockView';
import { boardModel } from '../../src/lib/board/models';
import { EMPTY_RECORD, type BoardRecord } from '../../src/lib/board/record';
import type { SessionState } from '../../src/lib/flash';

const names = { 'blink/input': { title: 'Blink · 2 input', path: '/robomania/projects/blink/#input', step: true } };
const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const heard: BoardRecord = {
  heard: 'blink/input',
  lines: [
    { text: 'wait 1000', at: 1 },
    { text: '500', at: 2, sent: true },
  ],
};

describe('the board dock', () => {
  it('hides in a browser that cannot reach a board', () => {
    expect(dockView({ kind: 'unsupported' }, EMPTY_RECORD, names).shown).toBe(false);
  });

  it('says no board is connected with none, or after a failure', () => {
    for (const state of [{ kind: 'idle' }, { kind: 'noPort' }, { kind: 'dropped', pct: 30 }] as SessionState[]) {
      expect(dockView(state, EMPTY_RECORD, names)).toMatchObject({
        shown: true,
        connected: false,
        chip: 'No board',
        doing: 'is connected. Plug one in over USB.',
        disconnect: false,
        canSend: false,
      });
    }
  });

  it('names the running sketch, links its project, and shows the last line the board printed', () => {
    expect(dockView(running, heard, names)).toEqual({
      shown: true,
      connected: true,
      chip: 'ESP32',
      doing: 'is running',
      sketch: 'Blink · 2 input',
      path: '/robomania/projects/blink/#input',
      last: 'wait 1000',
      disconnect: true,
      canSend: true,
    });
  });

  it('names a sketch the site does not know by its key', () => {
    const view = dockView(running, { heard: 'mine/sketch', lines: [] }, names);
    expect(view).toMatchObject({ doing: 'is running', sketch: 'mine/sketch', disconnect: true });
    expect(view.path).toBeUndefined();
  });

  it('names a sketch whose key is a property every object has by its key, not by what the object holds', () => {
    expect(dockView(running, { heard: 'constructor', lines: [] }, names).sketch).toBe('constructor');
  });

  it('says a board running an unnamed sketch runs a sketch', () => {
    const view = dockView(running, EMPTY_RECORD, names);
    expect(view).toMatchObject({ chip: 'ESP32', doing: 'is running a sketch' });
    expect(view.sketch).toBeUndefined();
  });

  it('shows what a flash writes with its percentage, then that the board restarts', () => {
    const pending: BoardRecord = { pending: 'blink/input', lines: [] };
    expect(dockView({ kind: 'flashing', chip: 'ESP32', pct: 40 }, pending, names)).toMatchObject({
      doing: 'is writing',
      sketch: 'Blink · 2 input',
      progress: 40,
      canSend: false,
    });
    expect(dockView({ kind: 'flashing', chip: 'ESP32', pct: 100 }, pending, names)).toMatchObject({
      doing: 'is restarting',
      progress: 100,
    });
  });

  it('names what the board does in words that follow its chip while it connects or is busy', () => {
    expect(dockView({ kind: 'connecting' }, EMPTY_RECORD, names)).toMatchObject({
      chip: 'Board',
      doing: 'is connecting',
    });
    expect(dockView({ kind: 'reading', chip: 'ESP32' }, EMPTY_RECORD, names)).toMatchObject({
      chip: 'ESP32',
      doing: 'is busy with its settings',
    });
  });

  it('names and links the sketch whose settings hold the board, and offers Disconnect from any page', () => {
    const states: SessionState[] = [
      { kind: 'settings', chip: 'ESP32', opened: {} },
      { kind: 'reading', chip: 'ESP32' },
      { kind: 'applying', chip: 'ESP32' },
    ];
    for (const state of states) {
      expect(dockView(state, { pending: 'blink/input', lines: [] }, names), state.kind).toEqual({
        shown: true,
        connected: true,
        chip: 'ESP32',
        doing: 'is busy with the settings of',
        sketch: 'Blink · 2 input',
        path: '/robomania/projects/blink/#input',
        disconnect: true,
        canSend: false,
      });
      expect(dockView(state, { heard: 'blink/input', lines: [] }, names).sketch, state.kind).toBe('Blink · 2 input');
      expect(dockView(state, EMPTY_RECORD, names), state.kind).toEqual({
        shown: true,
        connected: true,
        chip: 'ESP32',
        doing: 'is busy with its settings',
        disconnect: true,
        canSend: false,
      });
    }
  });

  it('says the board stopped talking when the port is lost', () => {
    expect(dockView({ ...running, lost: true }, heard, names)).toMatchObject({
      connected: false,
      chip: 'ESP32',
      doing: 'stopped talking to the page. Plug it back in and connect again.',
      disconnect: false,
      canSend: false,
    });
  });
});

describe('the board dock for the board the visitor picked', () => {
  it('says to set an ESP-01S adapter to flash mode before plugging it in', () => {
    expect(dockView({ kind: 'idle' }, EMPTY_RECORD, names, boardModel('esp01s')).doing).toBe(
      'is connected. Plug the ESP-01S in with its adapter set to PROG.',
    );
  });

  it('asks to press reset on an ESP-01S running a sketch it has not named, which it names as it restarts', () => {
    const view = dockView({ kind: 'running', chip: 'ESP8266', output: [] }, EMPTY_RECORD, names, boardModel('esp01s'));
    expect(view.doing).toBe('is running a sketch. Press reset on its adapter to name it.');
  });

  it('says the board is still in flash mode after the write', () => {
    expect(dockView({ kind: 'flashMode', chip: 'ESP8266' }, EMPTY_RECORD, names)).toMatchObject({
      chip: 'ESP8266',
      doing: 'is still in flash mode. Set the adapter to UART and plug it in again.',
      disconnect: false,
    });
  });
});
