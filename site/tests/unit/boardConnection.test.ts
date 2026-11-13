import { describe, expect, it } from 'vitest';
import { createBoard, type OpenedSketch } from '../../src/lib/board/board';
import {
  connectionView,
  createConnection,
  type ConnectionInput,
  type Press,
} from '../../src/lib/board/connection';
import { flashScene } from '../../src/lib/board/flashScene';
import { boardModel } from '../../src/lib/board/models';
import { createPick } from '../../src/lib/board/pick';
import { EMPTY_RECORD } from '../../src/lib/board/record';
import type { ManifestImage } from '../../src/lib/flash/manifest';
import type { SessionEvent, SessionState } from '../../src/lib/flash/session';
import { fakeSession } from './fakeSession';

describe('connectionView panel words', () => {
  const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };

  it('shows the picture while idle, while running and in a browser that cannot reach a board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, running, { kind: 'unsupported' }];
    expect(states.map((state) => viewOf(state).panel)).toEqual([undefined, undefined, undefined]);
  });

  it('leaves a connection to the bar, and says to keep the board plugged in while flashing', () => {
    expect(viewOf({ kind: 'connecting' }).panel).toBeUndefined();
    expect(viewOf({ kind: 'flashing', chip: 'ESP32', pct: 40 }).panel).toEqual({
      text: 'Found ESP32. Keep the board plugged in.',
      notice: false,
    });
  });

  it.each<[SessionState, string]>([
    [{ kind: 'noPort' }, 'No board was chosen. Plug it in and press Try again.'],
    [
      { kind: 'portBusy' },
      'Another program is using the board. Close the serial monitor or the Arduino IDE, then press Try again.',
    ],
    [
      { kind: 'noAnswer' },
      'The board did not answer. Hold its BOOT button and press Try again. On an ESP-01S, set the USB adapter to flash mode first.',
    ],
    [
      { kind: 'running', chip: 'ESP32', output: [], lost: true },
      'The board stopped talking to the page. Plug it back in and connect again.',
    ],
  ])('gives a failure to connect or a lost board, %j, a notice', (state, text) => {
    expect(viewOf(state).panel).toEqual({ text, notice: true });
  });

  it('says how to make the picked board answer', () => {
    expect(viewOf({ kind: 'noAnswer' }, { pick: boardModel('esp01s') }).panel?.text).toBe(
      "The board did not answer. Set the adapter's switch to PROG, the flash position, or put its jumper on. " +
        'Then unplug the adapter, plug the adapter back in and press Try again.',
    );
    expect(viewOf({ kind: 'noAnswer' }, { pick: boardModel('esp32') }).panel?.text).toBe(
      'The board did not answer. Hold its BOOT button and press Try again.',
    );
  });

  it('says how to get the board out of flash mode after the write', () => {
    expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }).panel).toEqual({
      text:
        "The sketch is on the board, but the board is still in flash mode. To start it, set the adapter's switch to UART, " +
        'the run position, or take its jumper off. Then unplug the adapter, plug the adapter back in and connect again.',
      notice: true,
    });
  });

  it('names the step that has no image for the board, and the chips it has images for', () => {
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }).panel?.text).toBe(
      'This board is an ESP8266. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32', 'ESP32-C3'] }).panel?.text).toBe(
      'This board is an ESP8266. Blink · input has images for: ESP32, ESP32-C3. Connect an ESP32 or ESP32-C3, or pick another step.',
    );
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: [] }).panel?.text).toBe(
      'This board is an ESP8266. Blink · input has no image to flash from the browser. Pick another step.',
    );
  });

  it('names a project that has no image for the board, and offers no step to pick, which its page has none of', () => {
    const project = opening('omnidirectional');
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, { opened: project }).panel?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has images for: ESP32. Connect an ESP32.',
    );
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: [] }, { opened: project }).panel?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has no image to flash from the browser. Build and flash it from your computer instead.',
    );
    const refused: SessionState = { ...running, flashRefused: { key: 'omnidirectional', available: ['ESP32-C3'] } };
    expect(viewOf(refused, { opened: project }).panel?.text).toBe(
      'This board is an ESP32. Omnidirectional robot has images for: ESP32-C3. Connect an ESP32-C3.',
    );
  });

  it('names the chip it found in the bar when the board has no image of the sketch, which the port was let go of for', () => {
    expect(viewOf({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }).bar).toEqual({
      shown: true,
      connected: false,
      chip: 'ESP8266',
      doing: 'cannot run this sketch',
      disconnect: false,
      restart: false,
      canSend: false,
    });
  });

  it('tells the visitor to press Try again after a failed flash, as its button reads', () => {
    expect(viewOf({ kind: 'noDownload' }).panel).toEqual({
      text: 'The image did not download. Check your internet connection. Then press Try again.',
      notice: true,
    });
    expect(viewOf({ kind: 'dropped', pct: 40 }).panel).toEqual({
      text: 'The connection dropped at 40%. Nothing is broken. Plug the board back in. Then press Try again.',
      notice: true,
    });
  });

  it('shows a refused flash until the page drops it', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32'] } };
    expect(viewOf(refused).panel).toEqual({
      text: 'This board is an ESP32. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.',
      notice: true,
    });
    expect(viewOf(refused, { opened: opening('blink/timer') }).panel).toBeUndefined();
  });
});

const NAMES = {
  'blink/input': { title: 'Blink · input', path: '/robomania/projects/blink/#input', step: true },
  'blink/timer': { title: 'Blink · timer', path: '/robomania/projects/blink/#timer', step: true },
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
  return connectionView({ state, record: EMPTY_RECORD, opened: sketch, pick: undefined, lastPress: undefined, names: NAMES, ...rest });
}

describe('connectionView action', () => {
  it('flashes the open sketch from idle, and only connects with none open', () => {
    expect(viewOf({ kind: 'idle' }).action).toEqual({
      label: 'Flash Blink · input',
      icon: 'bolt',
      event: 'flash',
      disabled: false,
    });
    expect(viewOf({ kind: 'idle', released: true }, { opened: undefined }).action).toEqual({
      label: 'Connect board',
      icon: 'plug',
      event: 'connect',
      disabled: false,
    });
  });

  it('offers Connect board beside Flash only while no board is connected', () => {
    const connect = { label: 'Connect board', icon: 'plug', event: 'connect', disabled: false };
    expect(viewOf({ kind: 'idle' }).connect).toEqual(connect);
    expect(viewOf({ kind: 'idle', released: true }, { opened: undefined }).connect).toBeUndefined();
    expect(viewOf({ kind: 'running', chip: 'ESP32', output: [] }).connect).toBeUndefined();
    expect(viewOf({ kind: 'connecting' }).connect).toBeUndefined();
  });

  it('is disabled while the session works, named by what the session does', () => {
    const busy: [SessionState, string][] = [
      [{ kind: 'connecting' }, 'Connecting…'],
      [{ kind: 'flashing', chip: 'ESP32', pct: 10 }, 'Flashing…'],
    ];
    for (const [state, label] of busy) {
      for (const opened of [sketch, undefined]) {
        expect(viewOf(state, { opened }).action, state.kind).toEqual({ label, disabled: true });
      }
    }
  });

  it('offers no action while the board waits on its settings, whose form is the action, and keeps Disconnect', () => {
    const settings: SessionState[] = [
      { kind: 'settings', chip: 'ESP32', opened: {} },
      { kind: 'reading', chip: 'ESP32' },
      { kind: 'applying', chip: 'ESP32' },
    ];
    for (const state of settings) {
      for (const opened of [sketch, undefined]) {
        const view = viewOf(state, { opened, record: { pending: 'blink/input', lines: [] } });
        expect(view.action, state.kind).toBeUndefined();
        expect(view.panel?.text, state.kind).toMatch(/settings/);
        expect(view.bar, state.kind).toMatchObject({ connected: true, disconnect: true });
      }
    }
  });

  it('flashes the open sketch from a running board in one press, and offers nothing without a sketch', () => {
    expect(viewOf(running).action).toEqual({ label: 'Flash Blink · input', icon: 'bolt', event: 'flash', disabled: false });
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

  it('flashes a sketch with settings over a running board too, whatever the board runs', () => {
    const withSettings = { ...sketch, settings: true };
    const flash = { label: 'Flash Blink · input', icon: 'bolt', event: 'flash', disabled: false };
    for (const record of [EMPTY_RECORD, { lines: [], heard: 'blink/input' }, { lines: [], flashed: 'blink/input' }]) {
      expect(viewOf(running, { opened: withSettings, record }).action).toEqual(flash);
    }
  });

  it('connects again from flash mode and from a lost board, with a sketch open or not', () => {
    const again = { label: 'Connect again', icon: 'plug', event: 'connect', disabled: false };
    for (const opened of [sketch, undefined]) {
      expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }, { opened }).action).toEqual(again);
      expect(viewOf(lost, { opened }).action).toEqual(again);
    }
  });

  it('offers Try again after a failure, which repeats the last press, or connects when there was none', () => {
    const failures: SessionState[] = [
      { kind: 'noPort' },
      { kind: 'portBusy' },
      { kind: 'noAnswer' },
      { kind: 'noDownload' },
      { kind: 'dropped', pct: 40 },
    ];
    for (const state of failures) {
      for (const opened of [sketch, undefined]) {
        const again = (lastPress?: Press) => viewOf(state, { opened, lastPress }).action;
        const tryAgain = { label: 'Try again', icon: 'again', disabled: false };
        expect(again()).toEqual({ ...tryAgain, event: 'connect' });
        expect(again({ event: 'connect' })).toEqual({ ...tryAgain, event: 'connect' });
        expect(again({ event: 'flash', key: 'blink/input' })).toEqual({ ...tryAgain, event: 'flash' });
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
    expect(viewOf(noImage).panel?.text).toBe(
      'This board is an ESP8266. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    const card = opening('omnidirectional');
    expect(viewOf(noImage, { opened: card }).panel?.text).toBe(
      'This board is an ESP8266. Omnidirectional robot has images for: ESP32. Connect an ESP32.',
    );
    expect(viewOf(noImage, { opened: undefined }).panel?.text).toContain('This sketch has images for: ESP32');
    expect(viewOf({ kind: 'noAnswer' }, { pick: esp01s }).panel?.text).toContain("Set the adapter's switch to PROG");
    expect(viewOf({ kind: 'flashMode', chip: 'ESP8266' }).panel?.notice).toBe(true);
    expect(viewOf(lost).panel).toEqual({
      text: 'The board stopped talking to the page. Plug it back in and connect again.',
      notice: true,
    });
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
      text: 'This board is an ESP32. Blink · input has images for: ESP32-C3. Connect an ESP32-C3, or pick another step.',
      notice: true,
    });
    expect(shown.action).toMatchObject({ event: 'flash' });

    for (const opened of [opening('blink/timer'), undefined]) {
      const dropped = viewOf(refused, { opened });
      expect(dropped.panel).toBeUndefined();
    }
  });
});

describe('connectionView panel', () => {
  it('opens while the session writes, waits in flash mode, failed or lost', () => {
    const open: SessionState[] = [
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

  it('stays closed while idle, while it connects, while a board runs and in a browser that cannot reach one', () => {
    for (const state of [{ kind: 'idle' }, { kind: 'connecting' }, running, { kind: 'unsupported' }] as const) {
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

  it('draws a connection or a flash by the visitor\'s last press', () => {
    const state: SessionState = { kind: 'connecting' };
    expect(viewOf(state, { lastPress: { event: 'connect' } }).scene.work).toBe('connect');
    expect(viewOf(state, { lastPress: { event: 'flash', key: 'blink' } }).scene.work).toBe('flash');
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
    expect(connection.view.action?.label).toBe('Flash Blink · input');

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }]);
    expect(fake.configured).toEqual([use]);
    expect(connection.view.action).toEqual({ label: 'Flashing…', disabled: true });
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
    expect(connection.view.action).toMatchObject({ label: 'Flash Web-controlled relay', event: 'flash' });

    await connection.press();
    expect(fake.sent).toEqual([{ type: 'connect' }]);
    fake.print('sketch web-relay');
    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }, { type: 'flash', key: 'web-relay' }]);
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

  it('offers Try again after a failed flash, which connects once and flashes the board that answered', async () => {
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
    expect(connection.view.action).toEqual({ label: 'Try again', icon: 'again', event: 'flash', disabled: false });

    await connection.press();

    expect(fake.sent.slice(1)).toEqual([{ type: 'connect' }]);
    expect(fake.session.state).toEqual(running);
  });

  it('asks for the port once when Try again flashes a sketch with settings opened after the flash failed', async () => {
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
    expect(connection.view.action).toMatchObject({ label: 'Try again', event: 'flash' });

    await connection.press();

    // The connection opens the settings form before it flashes: no restart first, which would ask for the port twice.
    expect(fake.sent).toEqual([{ type: 'flash', key: 'blink/input' }, { type: 'connect' }]);
    expect(fake.configured.at(-1)).toEqual(relay);
  });

  it('tries only the connection again when a connection failed', async () => {
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') enter({ kind: 'noPort' });
    }, false);
    await connection.press();
    expect(connection.view.action).toMatchObject({ label: 'Try again', event: 'connect' });

    await connection.press();

    expect(fake.sent).toEqual([
      { type: 'connect', reset: true },
      { type: 'connect', reset: true },
    ]);
  });

  it('restarts and reads the board on Connect again or Connect board with a sketch open, and flashes nothing', async () => {
    const states: [SessionState, string][] = [
      [{ kind: 'running', chip: 'ESP32', output: [], lost: true }, 'Connect again'],
      [{ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, 'Connect board'],
    ];
    for (const [state, label] of states) {
      const { fake, connection } = connectionOver(() => {});
      fake.enter(state);
      expect(connection.view.action, state.kind).toMatchObject({ label, event: 'connect' });

      await connection.press();

      expect(fake.sent, state.kind).toEqual([{ type: 'connect', reset: true }]);
    }
  });

  it('names the sketch the visitor tried to flash when the board has no image of it, whichever is open by now', async () => {
    const { fake, board, page, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') enter({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] });
    });
    await connection.press();
    page.abort();
    board.open({ ...use, sketch: 'blink/timer' }, new AbortController().signal);

    expect(fake.sent).toEqual([{ type: 'connect' }]);
    expect(connection.view.panel?.text).toBe(
      'This board is an ESP8266. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
  });

  it('only reads the board when Try again repeats a flash on a page with nothing to flash', async () => {
    const { fake, page, connection } = connectionOver((event, enter) => {
      if (event.type === 'connect') enter({ kind: 'noPort' });
    });
    await connection.press();
    page.abort();
    expect(connection.view.action).toMatchObject({ label: 'Try again', event: 'flash' });

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'connect' }, { type: 'connect', reset: true }]);
  });

  it('names work the visitor started elsewhere by what the session does', () => {
    const { fake, connection } = connectionOver(() => {});
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 10 });
    expect(connection.view.action).toEqual({ label: 'Flashing…', disabled: true });
  });

  it('says Connecting… while a flash from a running board connects to its bootloader, as the workbench tag does', async () => {
    const { fake, connection } = connectionOver((event, enter) => {
      if (event.type === 'flash') enter({ kind: 'connecting' });
    });
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });

    await connection.press();

    expect(fake.sent).toEqual([{ type: 'flash', key: 'blink/input' }]);
    expect(connection.view.action).toEqual({ label: 'Connecting…', disabled: true });
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

    expect(labels).toEqual(['Flash Blink · input', undefined, undefined]);
  });
});
