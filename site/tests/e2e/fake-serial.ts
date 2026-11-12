import { test as base, type Page } from '@playwright/test';

/** What the fake `navigator.serial` does in one test. */
export interface FakeSerialOptions {
  /** `requestPort` rejects with `NotFoundError`, as when the visitor closes the port picker. Default: resolves. */
  requestPortRejects?: boolean;
  /** `open` rejects with `InvalidStateError`, as when another program holds the port. Default: resolves. */
  openRejects?: boolean;
  /** Lines the board prints right after `open`, each ended by a newline. */
  lines?: string[];
}

/** Controls the fake `navigator.serial` of one page. */
export interface FakeSerial {
  /** Installs the fake before the page's own scripts run. Call it before `page.goto`. */
  install(options?: FakeSerialOptions): Promise<void>;
  /** The bytes the page wrote to the port, one array per write. */
  written(): Promise<number[][]>;
}

/**
 * The fake runs in the page, so it is a function that Playwright serialises, with no reference to this module.
 * It fakes the Web Serial API only; it does not speak the ESP ROM bootloader protocol.
 */
function installFakeSerial(options: FakeSerialOptions) {
  const written: number[][] = [];
  let opened = false;
  let readable: ReadableStream<Uint8Array>;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      written.push(Array.from(chunk));
    },
  });

  const port = {
    get readable() {
      return opened ? readable : null;
    },
    get writable() {
      return opened ? writable : null;
    },
    getInfo: () => ({}),
    async open() {
      if (options.openRejects) {
        throw new DOMException('The port is already open.', 'InvalidStateError');
      }
      opened = true;
      readable = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const line of options.lines ?? []) {
            controller.enqueue(encoder.encode(`${line}\n`));
          }
        },
      });
    },
    async close() {
      opened = false;
    },
  };

  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    value: {
      async requestPort() {
        if (options.requestPortRejects) {
          throw new DOMException('No port selected by the user.', 'NotFoundError');
        }
        return port;
      },
      async getPorts() {
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  Object.defineProperty(window, '__fakeSerialWritten', { value: written });
}

function fakeSerialFor(page: Page): FakeSerial {
  return {
    install: async (options = {}) => {
      await page.addInitScript(installFakeSerial, options);
    },
    written: () => page.evaluate(() => (window as unknown as { __fakeSerialWritten: number[][] }).__fakeSerialWritten),
  };
}

export const test = base.extend<{ fakeSerial: FakeSerial }>({
  fakeSerial: async ({ page }, use) => {
    await use(fakeSerialFor(page));
  },
});

export { expect } from '@playwright/test';
