import { describe, expect, it } from 'vitest';
import { createBoard, keyFlashedBy } from '../../src/lib/board/board';
import type { BoardLine, FlashSession, SessionState } from '../../src/lib/flash';
import type { SessionEvent, SessionOptions } from '../../src/lib/flash/session';

/** A session that records what it was asked for and enters the states the test gives it. */
function fakeSession(start: SessionState = { kind: 'idle' }) {
  const stateListeners = new Set<(state: SessionState) => void>();
  const lineListeners = new Set<(line: BoardLine) => void>();
  const sent: SessionEvent[] = [];
  const configured: Omit<SessionOptions, 'flasher'>[] = [];
  let state = start;
  const session: FlashSession = {
    get state() {
      return state;
    },
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    subscribeLines(listener) {
      lineListeners.add(listener);
      return () => lineListeners.delete(listener);
    },
    sendLine: async () => {},
    async send(event) {
      sent.push(event);
    },
    configure(options) {
      configured.push(options);
    },
  };
  return {
    session,
    sent,
    configured,
    enter(next: SessionState) {
      state = next;
      stateListeners.forEach((listener) => listener(next));
    },
    print(text: string) {
      lineListeners.forEach((listener) => listener({ text, at: 0 }));
    },
  };
}

const manifest = { sketches: {} };

describe('the site board', () => {
  it('lets a page point the session at its sketch, and names that page its owner', () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);

    expect(board.use('card:servo', { manifest, sketch: 'servo', baud: 115200 })).toBe(true);

    expect(board.owner).toBe('card:servo');
    expect(fake.configured).toEqual([{ manifest, sketch: 'servo', baud: 115200 }]);
  });

  it('refuses another page while the session is busy, keeping the owner of the work under way', () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);
    board.use('card:servo', { manifest, sketch: 'servo' });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 10 });

    expect(board.use('workbench', { manifest, sketch: 'blink/simple' })).toBe(false);
    expect(board.owner).toBe('card:servo');
  });

  it("tells its listeners when another page becomes the owner, so the last one shows it isn't its board", () => {
    const board = createBoard(fakeSession().session);
    let calls = 0;
    board.subscribe(() => calls++);

    board.use('card:servo', { manifest, sketch: 'servo' });
    board.use('card:servo', { manifest, sketch: 'servo' });

    expect(calls).toBe(1);
  });

  it("records the owner's sketch as what a connection flashes, and a flash's key, once the board runs it", async () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);
    board.use('card:servo', { manifest, sketch: 'servo' });

    await board.send({ type: 'connect' });
    fake.enter({ kind: 'connecting' });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 100 });
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    expect(board.record.flashed).toBe('servo');

    await board.send({ type: 'flash', key: 'blink/input' });
    fake.enter({ kind: 'connecting' });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 100 });
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    expect(board.record.flashed).toBe('blink/input');
    expect(fake.sent).toEqual([{ type: 'connect' }, { type: 'flash', key: 'blink/input' }]);
  });

  it('records no key for a connection that only restarts the board, and hears the one it prints', async () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);

    await board.send({ type: 'connect', reset: true });
    fake.enter({ kind: 'connecting' });
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    expect(board.record.flashed).toBeUndefined();
    fake.print('sketch blink/serial');

    expect(board.record.heard).toBe('blink/serial');
  });

  it('tells its listeners of every state the session enters and every line the board prints', () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);
    let calls = 0;
    board.subscribe(() => calls++);

    fake.enter({ kind: 'connecting' });
    fake.enter({ kind: 'running', chip: 'ESP32', output: [] });
    fake.print('HIGH');

    expect(calls).toBe(3);
  });
});

describe('the sketch the visitor has open', () => {
  it('names the opened sketch until the page that opened it goes', () => {
    const board = createBoard(fakeSession().session);
    const page = new AbortController();
    let heard = 0;
    board.subscribe(() => heard++);

    board.open('blink/simple', page.signal);
    expect(board.opened).toBe('blink/simple');
    board.open('blink/input', page.signal);
    expect(board.opened).toBe('blink/input');
    page.abort();

    expect(board.opened).toBeUndefined();
    expect(heard).toBe(3);
  });

  it('keeps the sketch the next page opened when the last page goes after it', () => {
    const board = createBoard(fakeSession().session);
    const last = new AbortController();
    board.open('blink/simple', last.signal);
    board.open('servo/sweep', new AbortController().signal);

    last.abort();

    expect(board.opened).toBe('servo/sweep');
  });
});

describe('the key a press flashes', () => {
  it("is a flash's own key, the sketch for a connection that flashes, and none for a restart or anything else", () => {
    expect(keyFlashedBy({ type: 'flash', key: 'blink/input' }, 'servo')).toBe('blink/input');
    expect(keyFlashedBy({ type: 'connect' }, 'servo')).toBe('servo');
    expect(keyFlashedBy({ type: 'connect', reset: true }, 'servo')).toBeUndefined();
    expect(keyFlashedBy({ type: 'disconnect' }, 'servo')).toBeUndefined();
  });
});
