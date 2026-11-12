import { describe, expect, it, vi } from 'vitest';
import { blinkWorkbench, OPENING, openRunner, servoWorkbench, workbenchFor } from '../../src/lib/workbench/projects';
import type { Effect, RealClock } from '../../src/lib/workbench/simulator';
import { blinkSimple } from '../../src/lib/workbench/steps/blink';

function fakeClock(): RealClock & { advance(ms: number): void } {
  let now = 0;
  const timers: { at: number; callback: () => void }[] = [];
  return {
    now: () => now,
    setTimeout(callback, ms) {
      const timer = { at: now + ms, callback };
      timers.push(timer);
      return timer;
    },
    clearTimeout(handle) {
      const index = timers.indexOf(handle as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (next === undefined || next.at > end) break;
        timers.shift();
        now = next.at;
        next.callback();
      }
      now = end;
    },
  };
}

describe('workbenchFor', () => {
  it('finds the projects with step definitions and nothing else', () => {
    expect(workbenchFor('blink')).toBe(blinkWorkbench);
    expect(workbenchFor('servo')).toBe(servoWorkbench);
    expect(workbenchFor('balance-beam')).toBeUndefined();
    expect(workbenchFor('toString')).toBeUndefined();
  });
});

describe('openRunner', () => {
  it('opens running in slow mode', () => {
    expect(OPENING).toEqual({ slow: true, running: true });
    const runner = openRunner(blinkSimple, () => {}, { clock: fakeClock() });
    expect(runner.view()).toMatchObject({ status: 'running', slow: true, line: 'Serial.begin(115200);' });
    runner.dispose();
  });

  it('runs at full speed when the visitor turned slow off', () => {
    const runner = openRunner(blinkSimple, () => {}, { clock: fakeClock(), slow: false });
    expect(runner.view()).toMatchObject({ status: 'running', slow: false });
    runner.dispose();
  });

  it('hears the first lines the sketch prints', () => {
    const clock = fakeClock();
    const printed: string[] = [];
    const listener = vi.fn((_view: unknown, effects: readonly Effect[]) => {
      for (const effect of effects) if (effect.kind === 'print') printed.push(effect.text);
    });
    const runner = openRunner(blinkSimple, listener, { clock });
    clock.advance(3000);
    expect(printed).toEqual(['', 'sketch blink/simple', 'HIGH']);
    runner.dispose();
  });
});
