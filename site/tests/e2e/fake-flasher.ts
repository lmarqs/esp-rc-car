import { test as base, type Page } from '@playwright/test';
import type { Flasher } from '../../src/lib/flash/flasher';

/** What the fake flasher does in one test. */
export interface FakeFlasherOptions {
  /** The chip `connect` resolves with. Default: `ESP32`. */
  chip?: string;
  /** The percentages `write` reports, in order, before it waits. Default: none. */
  progress?: number[];
  /** `write` waits after reporting `progress`, until `release` is called. Default: finishes at once. */
  hold?: boolean;
}

/** Controls the fake flasher of one page. */
export interface FakeFlasher {
  /** Installs the fake before the page's own scripts run. Call it before `page.goto`. */
  install(options?: FakeFlasherOptions): Promise<void>;
  /** Lets a held `write` finish. */
  release(): Promise<void>;
  /** The flasher's methods that the page called, in order. */
  calls(): Promise<string[]>;
}

/**
 * The fake runs in the page, so it is a function that Playwright serialises, with no reference to this module.
 * It has the shape of the `Flasher` interface and touches no port.
 */
function installFakeFlasher(options: FakeFlasherOptions) {
  const calls: string[] = [];
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  const flasher: Flasher = {
    async connect() {
      calls.push('connect');
      return options.chip ?? 'ESP32';
    },
    async load() {
      calls.push('load');
    },
    async write(_parts, onProgress) {
      calls.push('write');
      for (const pct of options.progress ?? []) {
        onProgress(pct);
      }
      if (options.hold) {
        await released;
      }
      onProgress(100);
    },
    async reset() {
      calls.push('reset');
    },
    async disconnect() {
      calls.push('disconnect');
    },
  };

  Object.defineProperty(window, '__robomaniaFakeFlasher', { configurable: true, value: flasher });
  Object.defineProperty(window, '__fakeFlasherCalls', { value: calls });
  Object.defineProperty(window, '__fakeFlasherRelease', { value: release });
}

function fakeFlasherFor(page: Page): FakeFlasher {
  return {
    install: (options = {}) => page.addInitScript(installFakeFlasher, options),
    release: () => page.evaluate(() => (window as unknown as { __fakeFlasherRelease: () => void }).__fakeFlasherRelease()),
    calls: () => page.evaluate(() => (window as unknown as { __fakeFlasherCalls: string[] }).__fakeFlasherCalls),
  };
}

export const test = base.extend<{ fakeFlasher: FakeFlasher }>({
  fakeFlasher: async ({ page }, use) => {
    await use(fakeFlasherFor(page));
  },
});

export { expect } from '@playwright/test';
