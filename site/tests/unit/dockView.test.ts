import { describe, expect, it } from 'vitest';
import { dockView } from '../../src/components/board/dockView';
import { EMPTY_RECORD, type BoardRecord } from '../../src/lib/board/record';
import type { SessionState } from '../../src/lib/flash';

const names = { 'blink/input': { title: 'Blink · step 2', path: '/robomania/projects/blink/' } };
const flashable = new Set(['blink/input']);
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
    expect(dockView({ kind: 'unsupported' }, EMPTY_RECORD, names, flashable).shown).toBe(false);
  });

  it('offers to connect with no board, or after a failure', () => {
    for (const state of [{ kind: 'idle' }, { kind: 'noPort' }, { kind: 'dropped', pct: 30 }] as SessionState[]) {
      expect(dockView(state, EMPTY_RECORD, names, flashable)).toMatchObject({
        shown: true,
        connected: false,
        chip: 'No board',
        doing: 'is connected. Plug one in over USB.',
        connect: true,
        flashAgain: false,
        disconnect: false,
        canSend: false,
      });
    }
  });

  it('names the running sketch, links its project, and shows the last line the board printed', () => {
    expect(dockView(running, heard, names, flashable)).toEqual({
      shown: true,
      connected: true,
      chip: 'ESP32',
      doing: 'is running',
      sketch: 'Blink · step 2',
      path: '/robomania/projects/blink/',
      last: 'wait 1000',
      connect: false,
      flashAgain: true,
      disconnect: true,
      canSend: true,
    });
  });

  it('names a sketch the site does not know by its key, and offers no Flash again for it', () => {
    const view = dockView(running, { heard: 'mine/sketch', lines: [] }, names, flashable);
    expect(view).toMatchObject({ doing: 'is running', sketch: 'mine/sketch', flashAgain: false, disconnect: true });
    expect(view.path).toBeUndefined();
  });

  it('names a sketch whose key is a property every object has by its key, not by what the object holds', () => {
    expect(dockView(running, { heard: 'constructor', lines: [] }, names, flashable).sketch).toBe('constructor');
  });

  it('says a board running an unnamed sketch runs a sketch', () => {
    const view = dockView(running, EMPTY_RECORD, names, flashable);
    expect(view).toMatchObject({ chip: 'ESP32', doing: 'is running a sketch' });
    expect(view.sketch).toBeUndefined();
  });

  it('shows what a flash writes with its percentage, then that the board restarts', () => {
    const pending: BoardRecord = { pending: 'blink/input', lines: [] };
    expect(dockView({ kind: 'flashing', chip: 'ESP32', pct: 40 }, pending, names, flashable)).toMatchObject({
      doing: 'is writing',
      sketch: 'Blink · step 2',
      progress: 40,
      flashAgain: false,
      canSend: false,
    });
    expect(dockView({ kind: 'flashing', chip: 'ESP32', pct: 100 }, pending, names, flashable)).toMatchObject({
      doing: 'is restarting',
      progress: 100,
    });
  });

  it('names what the board does in words that follow its chip while it connects or is busy', () => {
    expect(dockView({ kind: 'connecting' }, EMPTY_RECORD, names, flashable)).toMatchObject({
      chip: 'Board',
      doing: 'is connecting',
    });
    expect(dockView({ kind: 'reading', chip: 'ESP32' }, EMPTY_RECORD, names, flashable)).toMatchObject({
      chip: 'ESP32',
      doing: 'is busy with its settings',
    });
  });

  it('says the board stopped talking, and offers to connect again, when the port is lost', () => {
    expect(dockView({ ...running, lost: true }, heard, names, flashable)).toMatchObject({
      connected: false,
      chip: 'ESP32',
      doing: 'stopped talking to the page. Plug it back in and connect again.',
      connect: true,
      canSend: false,
    });
  });
});
