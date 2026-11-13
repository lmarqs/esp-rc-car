import { describe, expect, it } from 'vitest';
import { createBoard, type OpenedSketch } from '../../src/lib/board/board';
import { boardMessage, connectionView, createConnection, type ConnectionInput } from '../../src/lib/board/connection';
import { flashScene } from '../../src/lib/board/flashScene';
import { boardModel } from '../../src/lib/board/models';
import { createPick } from '../../src/lib/board/pick';
import { EMPTY_RECORD } from '../../src/lib/board/record';
import type { ManifestImage } from '../../src/lib/flash/manifest';
import type { SessionEvent, SessionState } from '../../src/lib/flash/session';
import { fakeSession } from './fakeSession';

/** A workbench's step, which a missing image names by its key here. */
const STEP = { name: 'blink/input', step: true };

describe('boardMessage', () => {
  const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };

  it('shows the picture while idle, while running and in a browser that cannot reach a board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, running, { kind: 'unsupported' }];
    expect(states.map((state) => boardMessage(state, STEP, true))).toEqual([undefined, undefined, undefined]);
  });

  it('says what the page does, and to keep the board plugged in while flashing', () => {
    expect(boardMessage({ kind: 'connecting' }, STEP, true)).toEqual({
      text: 'Connecting to the board.',
      notice: false,
    });
    expect(boardMessage({ kind: 'flashing', chip: 'ESP32', pct: 40 }, STEP, true)).toEqual({
      text: 'Found ESP32. Keep the board plugged in.',
      notice: false,
    });
  });

  it.each<[SessionState, string]>([
    [{ kind: 'noPort' }, 'No board was chosen. Plug it in and try again.'],
    [
      { kind: 'portBusy' },
      'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.',
    ],
    [
      { kind: 'noAnswer' },
      'The board did not answer. Hold its BOOT button and connect again. On an ESP-01S, set the USB adapter to flash mode first.',
    ],
    [
      { kind: 'running', chip: 'ESP32', output: [], lost: true },
      'The board stopped talking to the page. Plug it back in and connect again.',
    ],
  ])('gives a failure to connect or a lost board, %j, a notice', (state, text) => {
    expect(boardMessage(state, STEP, true)).toEqual({ text, notice: true });
  });

  it('says how to make the picked board answer', () => {
    expect(boardMessage({ kind: 'noAnswer' }, STEP, true, boardModel('esp01s'))?.text).toBe(
      "The board did not answer. Set the adapter's switch to PROG, the flash position, or put its jumper on. " +
        'Then unplug the adapter, plug the adapter back in and connect again.',
    );
    expect(boardMessage({ kind: 'noAnswer' }, STEP, true, boardModel('esp32'))?.text).toBe(
      'The board did not answer. Hold its BOOT button and connect again.',
    );
  });

  it('says how to get the board out of flash mode after the write', () => {
    expect(boardMessage({ kind: 'flashMode', chip: 'ESP8266' }, STEP, true)).toEqual({
      text:
        "The sketch is on the board, but the board is still in flash mode. To start it, set the adapter's switch to UART, " +
        'the run position, or take its jumper off. Then unplug the adapter, plug the adapter back in and connect again.',
      notice: true,
    });
  });

  it('names the step that has no image for the board, and the chips it has images for', () => {
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, STEP, true)?.text).toBe(
      'This board is an ESP8266. blink/input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32', 'ESP32-C3'] }, STEP, true)?.text).toBe(
      'This board is an ESP8266. blink/input has images for: ESP32, ESP32-C3. Connect an ESP32 or ESP32-C3, or pick another step.',
    );
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: [] }, STEP, true)?.text).toBe(
      'This board is an ESP8266. blink/input has no image to flash from the browser. Pick another step.',
    );
  });

  it('names a project that has no image for the board, and offers no step to pick, which its page has none of', () => {
    const project = { name: 'Omnidirectional robot', step: false };
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, project, true)?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has images for: ESP32. Connect an ESP32.',
    );
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: [] }, project, true)?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has no image to flash from the browser. Build and flash it from your computer instead.',
    );
    const refused: SessionState = { ...running, flashRefused: { key: 'omnidirectional', available: ['ESP32-C3'] } };
    expect(boardMessage(refused, project, true)?.text).toBe(
      'This board is an ESP32. Omnidirectional robot has images for: ESP32-C3. Connect an ESP32-C3.',
    );
  });

  it('tells the visitor to press Try again after a failed flash, as its button reads', () => {
    expect(boardMessage({ kind: 'noDownload' }, STEP, true)).toEqual({
      text: 'The image did not download. Check your internet connection. Then press Try again.',
      notice: true,
    });
    expect(boardMessage({ kind: 'dropped', pct: 40 }, STEP, true)).toEqual({
      text: 'The connection dropped at 40%. Nothing is broken. Plug the board back in. Then press Try again.',
      notice: true,
    });
  });

  it('shows a refused flash until the page drops it', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32'] } };
    expect(boardMessage(refused, STEP, true)).toEqual({
      text: 'This board is an ESP32. blink/input has images for: ESP32. Connect an ESP32, or pick another step.',
      notice: true,
    });
    expect(boardMessage(refused, STEP, false)).toBeUndefined();
  });
});

const NAMES = {
  'blink/input': { title: 'Blink · 2 input', path: '/robomania/projects/blink/#input', step: true },
  'blink/timer': { title: 'Blink · 3 timer', path: '/robomania/projects/blink/#timer', step: true },
  omnidirectional: { title: 'Omnidirectional robot', path: '/robomania/projects/omnidirectional/', step: false },
  'web-relay': { title: 'Web-controlled relay', path: '/robomania/projects/web-relay/', step: false },
};

/** The sketch `key` as a page opens it on the board: with an image and no settings unless `rest` says otherwise. */
function opening(key: string, rest: Partial<OpenedSketch> = {}): OpenedSketch {
  return { use: { manifest: { sketches: {} }, sketch: key, baud: 115200 }, settings: false, imageless: false, ...rest };
}

const sketch = opening('blink/input');
const esp01s = boardModel('esp01s');
const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const lost: SessionState = { ...running, lost: true };

/** The dock's view for `state`, with a sketch open unless `opened` says otherwise. */
function viewOf(state: SessionState, rest: Partial<ConnectionInput> = {}) {
  return connectionView({ state, record: EMPTY_RECORD, opened: sketch, pick: undefined, names: NAMES, ...rest });
}

describe('connectionView action', () => {
  it('connects from idle, and flashes the open sketch in the same press', () => {
    expect(viewOf({ kind: 'idle' }).action).toEqual({
      label: 'Flash Blink · 2 input',
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
    expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 10 }, { pressed: 'connect' }).action).toEqual({
      ...flashing,
      icon: 'plug',
      event: 'connect',
    });
    expect(viewOf({ kind: 'connecting' }, { pressed: 'retry' }).action).toEqual({
      ...connecting,
      icon: 'again',
      event: 'retry',
    });
  });

  it('says Flashing… once Try again, which connects first, has the session write, as a connection that flashes does', () => {
    expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 10 }, { pressed: 'retry' }).action).toEqual({
      label: 'Flashing…',
      icon: 'again',
      event: 'retry',
      disabled: true,
    });
  });

  it('flashes the open sketch from a running board in one press, and offers nothing without a sketch', () => {
    expect(viewOf(running).action).toEqual({ label: 'Flash Blink · 2 input', icon: 'bolt', event: 'flash', disabled: false });
    expect(viewOf(running, { opened: undefined }).action).toBeUndefined();
  });

  it('offers no flash of an open sketch the page has no image of: it connects, as with no sketch open', () => {
    const imageless = { ...sketch, imageless: true };
    expect(viewOf({ kind: 'idle' }, { opened: imageless }).action).toEqual({
      label: 'Connect board',
      icon: 'plug',
      event: 'connect',
      disabled: false,
    });
    expect(viewOf(running, { opened: imageless }).action).toBeUndefined();
  });

  it('connects anew to flash a sketch with settings the running board does not run, so its form comes first', () => {
    const withSettings = { ...sketch, settings: true };
    expect(viewOf(running, { opened: withSettings }).action).toEqual({
      label: 'Flash Blink · 2 input',
      icon: 'bolt',
      event: 'connect',
      disabled: false,
    });
    expect(viewOf(running, { opened: withSettings, record: { lines: [], heard: 'blink/input' } }).action?.event).toBe('flash');
    expect(viewOf(running, { opened: withSettings, record: { lines: [], flashed: 'blink/input' } }).action?.event).toBe('flash');
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

describe('connectionView panel message', () => {
  it('words each state as the board message does, naming the open sketch by its title for a missing image', () => {
    const noImage: SessionState = { kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] };
    expect(viewOf(noImage, { record: { lines: [], pending: 'blink/timer' } }).panel).toEqual(
      boardMessage(noImage, { name: 'Blink · 2 input', step: true }, true),
    );
    expect(viewOf(noImage).panel?.text).toBe(
      'This board is an ESP8266. Blink · 2 input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    const card = opening('omnidirectional');
    expect(viewOf(noImage, { opened: card }).panel?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has images for: ESP32. Connect an ESP32.',
    );
    expect(viewOf(noImage, { opened: undefined, record: { lines: [], pending: 'blink/timer' } }).panel?.text).toContain(
      'blink/timer has images for: ESP32',
    );
    expect(viewOf(noImage, { opened: undefined }).panel?.text).toContain('This sketch has images for: ESP32');
    expect(viewOf({ kind: 'noAnswer' }, { pick: esp01s }).panel).toEqual(boardMessage({ kind: 'noAnswer' }, STEP, true, esp01s));
    expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }).panel?.notice).toBe(true);
    expect(viewOf(lost).panel).toEqual(boardMessage(lost, STEP, true));
  });

  it('says nothing while idle, while a board runs, and in a browser that cannot reach one', () => {
    expect(viewOf({ kind: 'idle' }).panel).toBeUndefined();
    expect(viewOf(running).panel).toBeUndefined();
    expect(viewOf({ kind: 'unsupported' }).panel).toBeUndefined();
  });

  it('leaves a running board unremarked, whatever the adapter, since the bar and the pane say what it runs', () => {
    expect(viewOf(running, { pick: esp01s }).panel).toBeUndefined();
    expect(viewOf(running, { pick: esp01s, opened: undefined }).panel).toBeUndefined();
    expect(viewOf(running, { pick: esp01s, record: { lines: [], heard: 'blink/input' } }).panel).toBeUndefined();
    expect(viewOf(running, { pick: boardModel('esp32') }).panel).toBeUndefined();
  });

  it('points at the card on this page that holds the settings, as it waits on them, reads them or sends them', () => {
    const relay = opening('web-relay', { settings: true });
    const record = { lines: [], pending: 'web-relay' };
    const says = (state: SessionState, rest: Partial<ConnectionInput> = {}) =>
      viewOf(state, { opened: relay, record, ...rest }).panel;
    expect(says({ kind: 'settings', chip: 'ESP8266', opened: {} })).toEqual({
      text: 'The Web-controlled relay card on this page asks for the settings. Check them, then flash the board.',
      notice: false,
    });
    const reopened: SessionState = { kind: 'settings', chip: 'ESP8266', opened: {}, flashed: true };
    expect(says(reopened, { record: { lines: [], heard: 'web-relay' } })).toEqual({
      text: 'The Web-controlled relay card on this page asks for the settings. Check them, then send them.',
      notice: false,
    });
    expect(says({ kind: 'reading', chip: 'ESP8266' })).toEqual({
      text: "The Web-controlled relay card on this page is reading the board's settings.",
      notice: false,
    });
    expect(says({ kind: 'applying', chip: 'ESP8266' })).toEqual({
      text: 'The Web-controlled relay card on this page is sending the settings to the board.',
      notice: false,
    });
  });

  it('sends the visitor back to the page of the sketch whose settings wait, or to Disconnect, away from its card', () => {
    const record = { lines: [], pending: 'web-relay' };
    const away =
      'Your board waits on the settings of Web-controlled relay. Go back to its page to finish them, or press Disconnect.';
    const states: SessionState[] = [
      { kind: 'settings', chip: 'ESP8266', opened: {} },
      { kind: 'reading', chip: 'ESP8266' },
      { kind: 'applying', chip: 'ESP8266' },
    ];
    for (const state of states) {
      for (const opened of [undefined, opening('blink/input')]) {
        expect(viewOf(state, { opened, record }).panel, state.kind).toEqual({ text: away, notice: false });
      }
      expect(viewOf(state, { opened: undefined, record, names: {} }).panel?.text, state.kind).toBe(
        'Your board waits on its settings. Go back to the page that asked for them, or press Disconnect.',
      );
    }
  });

  it('shows a refusal only while the page has the refused sketch open', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32-C3'] } };
    const shown = viewOf(refused);
    expect(shown.panel).toEqual({
      text: 'This board is an ESP32. Blink · 2 input has images for: ESP32-C3. Connect an ESP32-C3, or pick another step.',
      notice: true,
    });
    expect(shown.action?.event).toBe('flash');

    for (const opened of [opening('blink/timer'), undefined]) {
      const dropped = viewOf(refused, { opened });
      expect(dropped.panel).toBeUndefined();
    }
  });
});

describe('connectionView panel', () => {
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
    for (const state of open) expect(viewOf(state).panel, state.kind).toBeDefined();
  });

  it('stays closed while idle, while a board runs and in a browser that cannot reach one', () => {
    for (const state of [{ kind: 'idle' }, running, { kind: 'unsupported' }] as const) {
      expect(viewOf(state).panel, state.kind).toBeUndefined();
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

describe('createConnection', () => {
  const image: ManifestImage = { profile: 'esp32', chipFamily: 'ESP32', parts: [{ path: 'blink/input/esp32/input.ino.bin', offset: 65536 }] };
  const use = { manifest: { sketches: { 'blink/input': { images: [image] } } }, sketch: 'blink/input', baud: 115200 };

  /**
   * The site's board over a fake session that answers each event as `answer` says, with `blink/input` open unless
   * `opened` is false, and the visitor's pick.
   */
  function connectionOver(answer: (event: SessionEvent, enter: (state: SessionState) => void) => void, opened = true) {
    const fake = fakeSession({ kind: 'idle' }, (event) => answer(event, fake.enter));
    const board = createBoard(fake.session);
    const page = new AbortController();
    if (opened) board.open(use, page.signal);
    const pick = createPick(undefined);
    return { fake, board, page, pick, connection: createConnection(board, pick, NAMES) };
  }

  it('labels its action from the opened title, and connects and flashes the opened sketch in one press', async () => {
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') enter({ kind: 'flashing', chip: 'ESP32', pct: 0 });
    });
    expect(connection.view.action?.label).toBe('Flash Blink · 2 input');

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }]);
    expect(fake.configured).toEqual([use]);
    expect(connection.view.action).toMatchObject({ event: 'connect', disabled: true });
  });

  it('with no sketch open, restarts the picked board to read it, and flashes none', async () => {
    const { fake, connection, pick } = connectionOver(() => {}, false);
    pick.choose('esp01s');
    expect(connection.view.action?.label).toBe('Connect board');

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect', reset: true, listen: 'ESP8266' }]);
    expect(fake.configured).toEqual([]);
  });

  it('restarts the picked board to read it when the opened sketch has no image, and flashes none', async () => {
    const { fake, board, page, connection } = connectionOver(() => {});
    page.abort();
    board.open({ ...use, manifest: { sketches: {} } }, new AbortController().signal);
    expect(connection.view.action?.label).toBe('Connect board');

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect', reset: true }]);
  });

  it('flashes the opened sketch onto a running board', async () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'flash', key: 'blink/input' }]);
  });

  it('connects anew to flash an opened sketch with settings over another running one, and flashes it once it runs', async () => {
    const field = { key: 'ap_password', label: 'Hotspot password', type: 'password', default: 'web-relay-1234' } as const;
    const relay = { manifest: { sketches: { 'web-relay': { images: [image], settings: [field] } } }, sketch: 'web-relay', baud: 115200 };
    const { fake, board, connection } = connectionOver(() => {}, false);
    board.open(relay, new AbortController().signal);
    fake.enter({ kind: 'running', chip: 'ESP8266', output: [] });
    expect(connection.view.action).toMatchObject({ label: 'Flash Web-controlled relay', event: 'connect' });

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }]);
    fake.print('sketch web-relay');
    expect(connection.view.action).toMatchObject({ label: 'Flash Web-controlled relay', event: 'flash' });
  });

  it('does nothing while the session works on the last press', async () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'connecting' });

    await connection.press();

    expect(fake.sent).toEqual([]);
  });

  it('does nothing while the session flashes', async () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 40 });

    await connection.press();

    expect(fake.sent).toEqual([]);
  });

  it('offers Try again after a failed flash, which connects, then flashes the board that answered', async () => {
    const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
    let drops = 1;
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') {
        enter({ kind: 'connecting' });
        enter(running);
      }
      if (event.type === 'flash') {
        enter({ kind: 'flashing', chip: 'ESP32', pct: 40 });
        enter(drops-- > 0 ? { kind: 'dropped', pct: 40 } : running);
      }
    });
    fake.enter(running);
    await connection.press();
    expect(connection.view.action).toEqual({ label: 'Try again', icon: 'again', event: 'retry', disabled: false });

    await connection.press();

    expect(fake.sent.slice(1)).toEqual([
      { type: 'connect', reset: true },
      { type: 'flash', key: 'blink/input' },
    ]);
    expect(fake.session.state).toEqual(running);
  });

  it('asks for the settings first when Try again flashes a sketch with settings opened after the flash failed', async () => {
    const field = { key: 'ap_password', label: 'Hotspot password', type: 'password', default: 'web-relay-1234' } as const;
    const relay = { manifest: { sketches: { 'web-relay': { images: [image], settings: [field] } } }, sketch: 'web-relay', baud: 115200 };
    const running: SessionState = { kind: 'running', chip: 'ESP8266', output: [] };
    const { fake, board, page, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect' && event.reset) enter(running);
      if (event.type === 'flash') {
        enter({ kind: 'flashing', chip: 'ESP8266', pct: 40 });
        enter({ kind: 'dropped', pct: 40 });
      }
    });
    fake.enter(running);
    await connection.press();
    page.abort();
    board.open(relay, new AbortController().signal);
    expect(connection.view.action).toMatchObject({ label: 'Try again', event: 'retry' });

    await connection.press();

    expect(fake.sent).toEqual([
      { type: 'flash', key: 'blink/input' },
      { type: 'connect', reset: true },
      { type: 'connect' },
    ]);
  });

  it('tries only the connection again when a connection failed', async () => {
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') enter({ kind: 'noPort' });
    });
    await connection.press();
    expect(connection.view.action).toMatchObject({ label: 'Try again', event: 'connect' });

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }, { type: 'connect' }]);
  });

  it('names work the visitor started elsewhere by what the session does', () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 10 });
    expect(connection.view.action).toMatchObject({ label: 'Flashing…', event: 'flash' });
  });

  it('disconnects a running board', async () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });

    await connection.disconnect();

    expect(fake.sent).toEqual([{ type: 'disconnect' }]);
  });

  it('lets go of a board whose settings form waits, from the form itself', async () => {
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'retry') enter({ kind: 'idle' });
    });
    fake.enter({ kind: 'settings', chip: 'ESP32', opened: {} });

    await connection.disconnect();

    expect(fake.sent).toEqual([{ type: 'retry' }]);
    expect(fake.session.state).toEqual({ kind: 'idle' });
  });

  it('waits for a settings exchange to end, then lets go of the board it left', async () => {
    for (const [after, event] of [
      [{ kind: 'settings', chip: 'ESP32', opened: {}, flashed: true }, 'retry'],
      [{ kind: 'running', chip: 'ESP32', output: [] }, 'disconnect'],
    ] as const) {
      const { fake, connection } = connectionOver(() => {});
      fake.enter({ kind: 'applying', chip: 'ESP32' });

      const disconnected = connection.disconnect();
      await Promise.resolve();
      expect(fake.sent, after.kind).toEqual([]);
      fake.enter(after);
      await disconnected;

      expect(fake.sent, after.kind).toEqual([{ type: event }]);
    }
  });

  it('sends nothing on Disconnect with no board to let go of', async () => {
    const { fake, connection } = connectionOver(() => {});

    await connection.disconnect();

    expect(fake.sent).toEqual([]);
  });

  it('tells its listeners when the board, the opened sketch or the pick changes', () => {
    const { fake, connection, page, pick } = connectionOver(() => {});
    const labels: (string | undefined)[] = [];
    connection.subscribe(() => labels.push(connection.view.action?.label));

    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    page.abort();
    pick.choose('esp32');

    expect(labels).toEqual(['Flash Blink · 2 input', undefined, undefined]);
  });
});
