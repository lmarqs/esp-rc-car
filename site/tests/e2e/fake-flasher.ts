import { test as base, type Page } from '@playwright/test';
import type { Flasher } from '../../src/lib/flash/flasher';

/** What the fake flasher does in one test. */
export interface FakeFlasherOptions {
  /** The chip `connect` resolves with; with a list, each call takes the next and the last repeats. Default: `ESP32`. */
  chip?: string | string[];
  /** The percentages `write` reports, in order, before it waits. Default: none. */
  progress?: number[];
  /** `write` waits after reporting `progress`, until `release` is called. Default: finishes at once. */
  hold?: boolean;
  /** `connect` waits until `release` is called. Default: answers at once. */
  holdConnect?: boolean;
  /**
   * After a flash, `monitor` prints `sketch <key>` for the key whose image `load` was given, as a ladder's step does,
   * instead of `lines`. Default: it prints `lines` every time.
   */
  announce?: boolean;
  /**
   * Makes the first call of a method reject with an error of this name, as the layer below does; later calls succeed.
   * `write` rejects after it has reported `progress`.
   */
  failFirst?: { connect?: string; load?: string; write?: string };
  /** The lines `monitor` prints right away, one call each; it then waits until `disconnect`. Default: none. */
  lines?: string[];
  /** The first `monitor` returns after it printed `lines`, as when the port is lost, instead of waiting for `disconnect`. */
  monitorEnds?: boolean;
  /**
   * The settings the board holds, which it answers the `cfg` protocol with: `cfg get` lists them and `cfg set` stores
   * a value, unless `refuse` names its key with the reason to refuse it with. Default: the board answers nothing.
   */
  board?: { values: Record<string, string>; refuse?: Record<string, string> };
}

/** Controls the fake flasher of one page. */
export interface FakeFlasher {
  /** Installs the fake before the page's own scripts run. Call it before `page.goto`. */
  install(options?: FakeFlasherOptions): Promise<void>;
  /** Lets a held `write` finish. */
  release(): Promise<void>;
  /** The flasher's methods that the page called, in order; `connect reuse` for a connect on the port it holds. */
  calls(): Promise<string[]>;
  /** The paths of the parts each `load` was given, in order. */
  loaded(): Promise<string[][]>;
}

/**
 * The fake runs in the page, so it is a function that Playwright serialises, with no reference to this module.
 * It has the shape of the `Flasher` interface and touches no port.
 */
function installFakeFlasher(options: FakeFlasherOptions) {
  const calls: string[] = [];
  const loaded: string[][] = [];
  let flashedKey: string | undefined;
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  let stopMonitor = () => {};
  let printLines: (lines: string[]) => void = () => {};
  const stored = { ...options.board?.values };

  function answer(line: string): string[] {
    if (!options.board) {
      return [];
    }
    if (line === 'cfg get') {
      return [...Object.entries(stored).map(([key, value]) => `cfg ${key}=${value}`), 'cfg end'];
    }
    const set = /^cfg set (\S+) (.*)$/.exec(line);
    if (set) {
      const [, key, value] = set as unknown as [string, string, string];
      const reason = options.board.refuse?.[key];
      if (reason) {
        return [`cfg err ${key} ${reason}`];
      }
      stored[key] = value;
      return [`cfg ok ${key}`];
    }
    return [];
  }

  const chips = [options.chip ?? 'ESP32'].flat();
  const failing = { ...options.failFirst };
  function failOnce(method: 'connect' | 'load' | 'write') {
    const name = failing[method];
    delete failing[method];
    if (name) {
      const error = new Error(`${method} failed in the test`);
      error.name = name;
      throw error;
    }
  }

  const flasher: Flasher = {
    async connect(connectOptions) {
      const call = calls.filter((name) => name.startsWith('connect')).length;
      calls.push(connectOptions?.reusePort ? 'connect reuse' : 'connect');
      if (options.holdConnect) {
        await released;
      }
      failOnce('connect');
      return chips[Math.min(call, chips.length - 1)]!;
    },
    async load(parts) {
      calls.push('load');
      loaded.push(parts.map((part) => part.path));
      // A part's path is `<key>/<profile>/<file>`.
      flashedKey = parts[0]?.path.split('/').slice(0, -2).join('/');
      failOnce('load');
    },
    async write(_parts, onProgress) {
      calls.push('write');
      for (const pct of options.progress ?? []) {
        onProgress(pct);
      }
      failOnce('write');
      if (options.hold) {
        await released;
      }
      onProgress(100);
    },
    async reset() {
      calls.push('reset');
    },
    async monitor(baud, onLines) {
      calls.push(`monitor ${baud}`);
      printLines = onLines;
      for (const line of options.announce && flashedKey ? [`sketch ${flashedKey}`] : (options.lines ?? [])) {
        onLines([line]);
      }
      if (options.monitorEnds && calls.filter((name) => name.startsWith('monitor')).length === 1) {
        return;
      }
      await new Promise<void>((resolve) => {
        stopMonitor = resolve;
      });
    },
    async send(line) {
      calls.push(`send ${line}`);
      const lines = answer(line);
      if (lines.length > 0) {
        setTimeout(() => printLines(lines));
      }
    },
    async disconnect() {
      calls.push('disconnect');
      stopMonitor();
    },
  };

  Object.defineProperty(window, '__robomaniaFakeFlasher', { configurable: true, value: flasher });
  Object.defineProperty(window, '__fakeFlasherCalls', { value: calls });
  Object.defineProperty(window, '__fakeFlasherLoaded', { value: loaded });
  Object.defineProperty(window, '__fakeFlasherRelease', { value: release });
}

function fakeFlasherFor(page: Page): FakeFlasher {
  return {
    install: (options = {}) => page.addInitScript(installFakeFlasher, options),
    release: () => page.evaluate(() => (window as unknown as { __fakeFlasherRelease: () => void }).__fakeFlasherRelease()),
    calls: () => page.evaluate(() => (window as unknown as { __fakeFlasherCalls: string[] }).__fakeFlasherCalls),
    loaded: () => page.evaluate(() => (window as unknown as { __fakeFlasherLoaded: string[][] }).__fakeFlasherLoaded),
  };
}

export const test = base.extend<{ fakeFlasher: FakeFlasher }>({
  fakeFlasher: async ({ page }, use) => {
    await use(fakeFlasherFor(page));
  },
});

export { expect } from '@playwright/test';
