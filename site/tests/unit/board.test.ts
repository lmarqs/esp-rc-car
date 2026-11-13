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
  it('does not point the session at a sketch when it is opened, but when the board is first asked for work', async () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);

    board.open({ manifest, sketch: 'servo', baud: 115200 }, 'Servo', new AbortController().signal);
    expect(fake.configured).toEqual([]);

    await board.send({ type: 'connect' });
    expect(fake.configured).toEqual([{ manifest, sketch: 'servo', baud: 115200 }]);
  });

  it('keeps the session pointed where its work began while it is busy, whatever is opened meanwhile', async () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);
    board.open({ manifest, sketch: 'servo' }, 'Servo', new AbortController().signal);
    await board.send({ type: 'connect' });
    fake.enter({ kind: 'flashing', chip: 'ESP32', pct: 10 });

    board.open({ manifest, sketch: 'blink/simple' }, 'Blink', new AbortController().signal);
    await board.send({ type: 'disconnect' });

    expect(fake.configured).toEqual([{ manifest, sketch: 'servo' }]);
  });

  it("records the opened sketch as what a connection flashes, and a flash's key, once the board runs it", async () => {
    const fake = fakeSession();
    const board = createBoard(fake.session);
    board.open({ manifest, sketch: 'servo' }, 'Servo', new AbortController().signal);

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
  const use = (sketch: string) => ({ manifest, sketch, baud: 115200 });

  it('is none until a page opens one', () => {
    expect(createBoard(fakeSession().session).opened).toBeUndefined();
  });

  it('names the opened sketch and its title, until the page that opened it goes', () => {
    const board = createBoard(fakeSession().session);
    const page = new AbortController();
    let heard = 0;
    board.subscribe(() => heard++);

    board.open(use('blink/simple'), 'Blink · 1 simple', page.signal);
    expect(board.opened).toEqual({ use: use('blink/simple'), title: 'Blink · 1 simple' });
    page.abort();

    expect(board.opened).toBeUndefined();
    expect(heard).toBe(2);
  });

  it('replaces the opened sketch when the same page opens another', () => {
    const board = createBoard(fakeSession().session);
    const page = new AbortController();

    board.open(use('blink/simple'), 'Blink · 1 simple', page.signal);
    board.open(use('blink/input'), 'Blink · 2 input', page.signal);
    expect(board.opened).toEqual({ use: use('blink/input'), title: 'Blink · 2 input' });
    page.abort();

    expect(board.opened).toBeUndefined();
  });

  it('keeps the sketch the next page opened when the last page goes after it', () => {
    const board = createBoard(fakeSession().session);
    const last = new AbortController();
    board.open(use('blink/simple'), 'Blink · 1 simple', last.signal);
    board.open(use('servo/sweep'), 'Servo', new AbortController().signal);

    last.abort();

    expect(board.opened).toEqual({ use: use('servo/sweep'), title: 'Servo' });
  });

  it('keeps the sketch opened again by the same page when an earlier signal of that page aborts', () => {
    const board = createBoard(fakeSession().session);
    const first = new AbortController();
    board.open(use('blink/simple'), 'Blink · 1 simple', first.signal);
    board.open(use('blink/simple'), 'Blink · 1 simple', new AbortController().signal);

    first.abort();

    expect(board.opened?.title).toBe('Blink · 1 simple');
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
