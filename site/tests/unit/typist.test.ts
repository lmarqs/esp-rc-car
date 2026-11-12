import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypist, HOLD_MS, LETTER_MS } from '../../src/lib/workbench/typist';

describe('createTypist', () => {
  let shown: string[];
  let sent: string[];
  let reduce: boolean;
  const typist = () =>
    createTypist({ show: (text) => shown.push(text), send: (text) => sent.push(text), reduceMotion: () => reduce });

  beforeEach(() => {
    vi.useFakeTimers();
    shown = [];
    sent = [];
    reduce = false;
  });
  afterEach(() => vi.useRealTimers());

  it('types one letter each LETTER_MS, holds the whole line HOLD_MS, then sends it', () => {
    const t = typist();
    t.type('run');
    expect(shown).toEqual(['']);
    vi.advanceTimersByTime(LETTER_MS);
    expect(shown.at(-1)).toBe('r');
    vi.advanceTimersByTime(2 * LETTER_MS);
    expect(shown).toEqual(['', 'r', 'ru', 'run']);
    expect(t.busy).toBe(true);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['run']);
    expect(t.busy).toBe(false);
  });

  it('sends the line under way at once when a second one starts, then types the second', () => {
    const t = typist();
    t.type('pause');
    vi.advanceTimersByTime(2 * LETTER_MS);
    t.type('run');
    expect(sent).toEqual(['pause']);
    expect(shown.at(-1)).toBe('');
    vi.advanceTimersByTime(3 * LETTER_MS + HOLD_MS);
    expect(sent).toEqual(['pause', 'run']);
    vi.advanceTimersByTime(10 * HOLD_MS);
    expect(sent).toEqual(['pause', 'run']);
  });

  it('shows the letters before `from` at once', () => {
    const t = typist();
    t.type('delay 1500', 10);
    expect(shown).toEqual(['delay 1500']);
    vi.advanceTimersByTime(HOLD_MS);
    expect(sent).toEqual(['delay 1500']);
  });

  it('shows the whole line at once under reduced motion and still sends it', () => {
    reduce = true;
    const t = typist();
    t.type('pause');
    expect(shown).toEqual(['pause']);
    vi.advanceTimersByTime(HOLD_MS);
    expect(sent).toEqual(['pause']);
  });

  it('stops without sending when the visitor takes over', () => {
    const t = typist();
    t.type('pause');
    vi.advanceTimersByTime(LETTER_MS);
    t.stop();
    expect(t.busy).toBe(false);
    vi.advanceTimersByTime(10 * HOLD_MS);
    expect(sent).toEqual([]);
    expect(shown).toEqual(['', 'p']);
  });

  it('finish sends the line under way at once, and does nothing when none is', () => {
    const t = typist();
    t.finish();
    expect(sent).toEqual([]);
    t.type('run');
    t.finish();
    expect(sent).toEqual(['run']);
    vi.advanceTimersByTime(10 * HOLD_MS);
    expect(sent).toEqual(['run']);
  });
});
