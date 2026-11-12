import type { RealClock } from './simulator';

/** How long the typist takes over each letter it types into the command line. */
export const LETTER_MS = 55;
/** How long the whole line stays in the command line before the typist sends it. */
export const HOLD_MS = 320;

export interface TypistOptions {
  /** Shows `text` in the command line as typed for the visitor. */
  show(text: string): void;
  /** Sends the typed line; the command line is then the page's to clear. */
  send(text: string): void;
  /** Whether the visitor's system asks for reduced motion: then the whole line appears at once. */
  reduceMotion(): boolean;
  /** Default: the browser's clock. */
  clock?: Pick<RealClock, 'setTimeout' | 'clearTimeout'>;
}

/**
 * Types a shortcut's line into the command line one letter at a time, holds it, then sends it, so the visitor sees the
 * exact text that works in any serial monitor. One line types at a time.
 */
export interface Typist {
  /** Whether a line is being typed or held, not yet sent. */
  readonly busy: boolean;
  /**
   * Sends the line under way at once, then types `text` from its `from`-th letter, the letters before it shown at
   * once, and sends it after {@link HOLD_MS}.
   */
  type(text: string, from?: number): void;
  /** Sends the line under way at once; nothing when none is. */
  finish(): void;
  /** Stops the line under way without sending it, as when the visitor starts typing by hand. */
  stop(): void;
}

const defaultClock: Pick<RealClock, 'setTimeout' | 'clearTimeout'> = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createTypist({ show, send, reduceMotion, clock = defaultClock }: TypistOptions): Typist {
  let line: string | undefined;
  let timer: unknown;

  function cancelTimer() {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  }

  function stop() {
    cancelTimer();
    line = undefined;
  }

  function finish() {
    if (line === undefined) return;
    const text = line;
    stop();
    send(text);
  }

  function type(text: string, from = 0) {
    finish();
    line = text;
    let shown = reduceMotion() ? text.length : Math.min(Math.max(from, 0), text.length);
    const next = () => {
      show(text.slice(0, shown));
      if (shown < text.length) {
        shown++;
        timer = clock.setTimeout(next, LETTER_MS);
      } else {
        timer = clock.setTimeout(finish, HOLD_MS);
      }
    };
    next();
  }

  return {
    get busy() {
      return line !== undefined;
    },
    type,
    finish,
    stop,
  };
}
