import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHIP_DEFS } from 'esptool-js/lib/targets/index.js';
import { EsptoolFlasher } from '../../src/lib/flash/flasher';
import type { ChipFamily } from '../../src/lib/flash/manifest';

const esptool = vi.hoisted(() => ({
  main: vi.fn(),
  writeFlash: vi.fn(),
  after: vi.fn(),
  disconnect: vi.fn(),
  chipName: 'ESP32',
  loaderOptions: undefined as unknown,
}));

vi.mock('esptool-js', () => ({
  Transport: class {
    disconnect = esptool.disconnect;
  },
  ESPLoader: class {
    chip = { CHIP_NAME: esptool.chipName };
    main = esptool.main;
    writeFlash = esptool.writeFlash;
    after = esptool.after;
    constructor(options: unknown) {
      esptool.loaderOptions = options;
    }
  },
}));

describe('the chip names of the manifest', () => {
  it('are the names esptool-js gives the chips arduino:firmware builds for', () => {
    const families: Record<string, ChipFamily> = { esp32: 'ESP32', esp32c3: 'ESP32-C3', esp8266: 'ESP8266' };

    for (const [key, family] of Object.entries(families)) {
      expect(CHIP_DEFS[key as keyof typeof CHIP_DEFS].CHIP_NAME).toBe(family);
    }
  });
});

describe('EsptoolFlasher', () => {
  const port = {};
  const requestPort = vi.fn(async () => port);
  const fetched = new Map<string, Uint8Array>([
    ['fw/boot.bin', new Uint8Array(100)],
    ['fw/app.bin', new Uint8Array(300)],
  ]);

  beforeEach(() => {
    vi.stubGlobal('navigator', { serial: { requestPort } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const data = fetched.get(url.replace('/robomania/firmware/', ''));
        return data ? new Response(data.buffer as ArrayBuffer) : new Response(null, { status: 404 });
      }),
    );
    esptool.main.mockReset().mockResolvedValue('ESP32');
    esptool.writeFlash.mockReset().mockResolvedValue(undefined);
    esptool.after.mockReset().mockResolvedValue(undefined);
    esptool.disconnect.mockReset().mockResolvedValue(undefined);
    esptool.chipName = 'ESP32';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const parts = [
    { path: 'fw/boot.bin', offset: 4096 },
    { path: 'fw/app.bin', offset: 65536 },
  ];

  function flasher() {
    return new EsptoolFlasher({ firmwareUrl: '/robomania/firmware/' });
  }

  it('connects at the ROM baud rate, with the visitor-chosen port, and resolves with the chip name', async () => {
    esptool.chipName = 'ESP32-C3';

    await expect(flasher().connect()).resolves.toBe('ESP32-C3');

    expect(requestPort).toHaveBeenCalledOnce();
    expect(esptool.loaderOptions).toMatchObject({ romBaudrate: 115200, baudrate: 460800 });
  });

  it('closes the port and rethrows when the board does not sync', async () => {
    const failure = new Error('Failed to connect with the device');
    esptool.main.mockRejectedValue(failure);
    const target = flasher();

    await expect(target.connect()).rejects.toBe(failure);

    expect(esptool.disconnect).toHaveBeenCalledOnce();
  });

  it('lets the rejection of requestPort through unchanged', async () => {
    const closed = new DOMException('No port selected by the user.', 'NotFoundError');
    requestPort.mockRejectedValueOnce(closed);

    await expect(flasher().connect()).rejects.toBe(closed);
  });

  it('writes each part at its manifest offset and keeps the headers the image was built with', async () => {
    const target = flasher();
    await target.connect();

    await target.write(parts, () => {});

    expect(esptool.writeFlash).toHaveBeenCalledOnce();
    const options = esptool.writeFlash.mock.calls[0]![0];
    expect(options).toMatchObject({ flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false });
    expect(options.fileArray.map((file: { address: number; data: Uint8Array }) => [file.address, file.data.length])).toEqual(
      [
        [4096, 100],
        [65536, 300],
      ],
    );
  });

  it('reports progress across all parts, weighted by their size', async () => {
    esptool.writeFlash.mockImplementation(async (options) => {
      options.reportProgress(0, 0, 60);
      options.reportProgress(0, 60, 60);
      options.reportProgress(1, 0, 150);
      options.reportProgress(1, 75, 150);
      options.reportProgress(1, 150, 150);
    });
    const reported: number[] = [];
    const target = flasher();
    await target.connect();

    await target.write(parts, (pct) => reported.push(pct));

    // 100 of 400 bytes are the first part, so the second starts at 25 and is halfway at 62.
    expect(reported).toEqual([0, 0, 25, 25, 62, 100, 100]);
  });

  it('rejects when a part cannot be fetched, without writing anything', async () => {
    const target = flasher();
    await target.connect();

    await expect(target.write([{ path: 'fw/missing.bin', offset: 0 }], () => {})).rejects.toThrow('fw/missing.bin');

    expect(esptool.writeFlash).not.toHaveBeenCalled();
  });

  it('rejects a write before a connect', async () => {
    await expect(flasher().write(parts, () => {})).rejects.toThrow('Not connected');
  });

  it('resets the board with a hard reset', async () => {
    const target = flasher();
    await target.connect();

    await target.reset();

    expect(esptool.after).toHaveBeenCalledWith('hard_reset');
  });

  it('never rejects when it disconnects', async () => {
    const target = flasher();
    await target.connect();
    esptool.disconnect.mockRejectedValue(new Error('already closed'));

    await expect(target.disconnect()).resolves.toBeUndefined();
  });
});
