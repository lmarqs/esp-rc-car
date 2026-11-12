import type { RealClock } from '../../src/lib/workbench/simulator';

/** A clock that only moves when a test advances it, running the timers that fall due on the way. */
export function fakeClock(): RealClock & { advance(ms: number): void } {
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
