import type { BoardLine, FlashSession, SessionState } from '../../src/lib/flash';
import type { SessionEvent, SessionOptions } from '../../src/lib/flash/session';

/**
 * A session that records what it was asked for and enters the states the test gives it. `answer`, if given, runs as
 * each event is sent, before `send` resolves, as the session's work does.
 */
export function fakeSession(start: SessionState = { kind: 'idle' }, answer?: (event: SessionEvent) => void) {
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
      answer?.(event);
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
