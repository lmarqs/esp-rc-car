import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHIP_DEFS } from 'esptool-js/lib/targets/index.js';
import { DownloadError, EsptoolFlasher } from '../../src/lib/flash/flasher';
import type { ChipFamily } from '../../src/lib/flash/manifest';

const esptool = vi.hoisted(() => ({
  requestPort: vi.fn(),
  requestPortCallsWhenLoaded: -1,
  main: vi.fn(),
  writeFlash: vi.fn(),
  after: vi.fn(),
  setRTS: vi.fn(),
  disconnect: vi.fn(),
  chipName: 'ESP32',
  loaderOptions: undefined as unknown,
}));

function fakeEsptool() {
  esptool.requestPortCallsWhenLoaded = esptool.requestPort.mock.calls.length;
  return {
    Transport: class {
      disconnect = esptool.disconnect;
      setRTS = esptool.setRTS;
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
  };
}

vi.mock('esptool-js', fakeEsptool);

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
  const requestPort = esptool.requestPort;
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
    requestPort.mockReset().mockResolvedValue(port);
    esptool.main.mockReset().mockResolvedValue('ESP32');
    esptool.writeFlash.mockReset().mockResolvedValue(undefined);
    esptool.after.mockReset().mockResolvedValue(undefined);
    esptool.setRTS.mockReset().mockResolvedValue(undefined);
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

  it('reaches the bootloader again on the port it was given, without asking for one, with reusePort', async () => {
    const target = flasher();
    await target.connect();

    await expect(target.connect({ reusePort: true })).resolves.toBe('ESP32');

    expect(requestPort).toHaveBeenCalledOnce();
    expect(esptool.main).toHaveBeenCalledTimes(2);
    expect(esptool.disconnect).toHaveBeenCalledOnce();
  });

  it('rejects reusePort before any port was given, and asks for none', async () => {
    await expect(flasher().connect({ reusePort: true })).rejects.toThrow('No port to reuse.');

    expect(requestPort).not.toHaveBeenCalled();
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
    await target.load(parts);

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
    await target.load(parts);

    await target.write(parts, (pct) => reported.push(pct));

    // 100 of 400 bytes are the first part, so the second starts at 25 and is halfway at 62.
    expect(reported).toEqual([0, 0, 25, 25, 62, 100, 100]);
  });

  it('rejects with a DownloadError when the server answers with an error', async () => {
    const target = flasher();
    await target.connect();

    const result = target.load([{ path: 'fw/missing.bin', offset: 0 }]);

    await expect(result).rejects.toBeInstanceOf(DownloadError);
    await expect(result).rejects.toMatchObject({ name: 'DownloadError', message: expect.stringContaining('404') });
    expect(esptool.writeFlash).not.toHaveBeenCalled();
  });

  it('rejects with a DownloadError when the network fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(flasher().load(parts)).rejects.toMatchObject({
      name: 'DownloadError',
      message: expect.stringContaining('Failed to fetch'),
    });
  });

  it('rejects a write of parts that were not downloaded', async () => {
    const target = flasher();
    await target.connect();

    await expect(target.write(parts, () => {})).rejects.toThrow('was not downloaded');
    expect(esptool.writeFlash).not.toHaveBeenCalled();
  });

  it('asks for the port before it loads esptool-js, while the click is still fresh', async () => {
    vi.resetModules();
    vi.doMock('esptool-js', fakeEsptool);
    esptool.requestPortCallsWhenLoaded = -1;
    const { EsptoolFlasher: Fresh } = await import('../../src/lib/flash/flasher');

    await new Fresh({ firmwareUrl: '/robomania/firmware/' }).connect();

    expect(esptool.requestPortCallsWhenLoaded).toBe(1);
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

  it('pulls RTS before the hard reset releases it, since esptool-js only releases it', async () => {
    const order: string[] = [];
    esptool.setRTS.mockImplementation(async (state: boolean) => {
      order.push(`setRTS ${state}`);
    });
    esptool.after.mockImplementation(async () => {
      order.push('after');
    });
    const target = flasher();
    await target.connect();

    await target.reset();

    expect(order).toEqual(['setRTS true', 'after']);
  });

  it('never rejects when it disconnects', async () => {
    const target = flasher();
    await target.connect();
    esptool.disconnect.mockRejectedValue(new Error('already closed'));

    await expect(target.disconnect()).resolves.toBeUndefined();
  });
});

describe('EsptoolFlasher.monitor', () => {
  const requestPort = esptool.requestPort;
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let order: string[];
  let written: string[];
  let port: {
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setSignals: ReturnType<typeof vi.fn>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  };

  beforeEach(() => {
    order = [];
    written = [];
    const decoder = new TextDecoder();
    port = {
      open: vi.fn(async () => {
        order.push('open');
      }),
      close: vi.fn(async () => {
        order.push('close');
      }),
      setSignals: vi.fn(async () => {
        order.push('setSignals');
      }),
      readable: new ReadableStream<Uint8Array>({
        start(started) {
          controller = started;
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          written.push(decoder.decode(chunk));
        },
      }),
    };
    vi.stubGlobal('navigator', { serial: { requestPort } });
    requestPort.mockReset().mockResolvedValue(port);
    esptool.main.mockReset().mockResolvedValue('ESP32');
    esptool.disconnect.mockReset().mockImplementation(async () => {
      order.push('release');
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connected() {
    const target = new EsptoolFlasher({ firmwareUrl: '/robomania/firmware/' });
    await target.connect();
    return target;
  }

  it('lets esptool-js go of the port, then opens it at the sketch baud', async () => {
    const target = await connected();
    const monitoring = target.monitor(9600, () => {});

    await vi.waitFor(() => expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 }));
    expect(order).toEqual(['release', 'open', 'setSignals']);
    controller.close();
    await monitoring;
  });

  it('turns DTR and RTS off once the port is open, so an ESP-01S on a CH340 adapter keeps running', async () => {
    const target = await connected();
    const monitoring = target.monitor(115200, () => {});

    await vi.waitFor(() => expect(port.setSignals).toHaveBeenCalledWith({ dataTerminalReady: false, requestToSend: false }));
    expect(order.indexOf('setSignals')).toBeGreaterThan(order.indexOf('open'));
    controller.close();
    await monitoring;
  });

  it('reads on when setSignals is refused', async () => {
    port.setSignals.mockRejectedValue(new DOMException('Not supported.', 'NetworkError'));
    const target = await connected();
    const received: string[][] = [];
    const monitoring = target.monitor(9600, (lines) => received.push(lines));
    await vi.waitFor(() => expect(port.setSignals).toHaveBeenCalled());

    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));
    controller.enqueue(encoder.encode('HIGH\n'));
    controller.close();
    await monitoring;

    expect(received.flat()).toEqual(['HIGH']);
  });

  it('calls onLines with the lines each piece completes, decoding text split inside a character', async () => {
    const target = await connected();
    const received: string[][] = [];
    const monitoring = target.monitor(115200, (lines) => received.push(lines));
    await vi.waitFor(() => expect(port.open).toHaveBeenCalled());

    const bytes = encoder.encode('tilt 3\u00b0\r\nHIGH\npart');
    controller.enqueue(bytes.slice(0, 7));
    controller.enqueue(bytes.slice(7));
    controller.enqueue(encoder.encode('ial\n'));
    controller.close();
    await monitoring;

    expect(received.flat()).toEqual(['tilt 3\u00b0', 'HIGH', 'partial']);
  });

  it('resolves once disconnect has ended the reading, and lets esptool-js close the port', async () => {
    const target = await connected();
    const monitoring = target.monitor(9600, () => {});
    await vi.waitFor(() => expect(port.open).toHaveBeenCalled());
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));

    await target.disconnect();

    await expect(monitoring).resolves.toBeUndefined();
    expect(port.readable!.locked).toBe(false);
    expect(esptool.disconnect).toHaveBeenCalledTimes(2);
  });

  it('resolves when the port is lost', async () => {
    const target = await connected();
    const monitoring = target.monitor(9600, () => {});
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));

    controller.error(new DOMException('The device has been lost.', 'NetworkError'));

    await expect(monitoring).resolves.toBeUndefined();
  });

  it.each(['BufferOverrunError', 'BreakError', 'FramingError', 'ParityError'])(
    'keeps reading from a fresh stream after a %s',
    async (name) => {
      const target = await connected();
      const received: string[][] = [];
      const monitoring = target.monitor(9600, (lines) => received.push(lines));
      await vi.waitFor(() => expect(port.readable!.locked).toBe(true));
      controller.enqueue(encoder.encode('before\n'));
      await vi.waitFor(() => expect(received).toHaveLength(1));
      const first = controller;
      let second!: ReadableStreamDefaultController<Uint8Array>;
      port.readable = new ReadableStream<Uint8Array>({
        start(started) {
          second = started;
        },
      });

      first.error(new DOMException('Bad frame.', name));
      await vi.waitFor(() => expect(port.readable!.locked).toBe(true));
      second.enqueue(encoder.encode('after\n'));
      await vi.waitFor(() => expect(received).toHaveLength(2));
      await target.disconnect();

      await expect(monitoring).resolves.toBeUndefined();
      expect(received.flat()).toEqual(['before', 'after']);
    },
  );

  it('releases the lock of the failed stream before it asks the port for a fresh one', async () => {
    const target = await connected();
    const monitoring = target.monitor(9600, () => {});
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));
    const failed = port.readable!;
    const failedController = controller;
    const lockedWhenAsked: boolean[] = [];
    Object.defineProperty(port, 'readable', {
      configurable: true,
      get() {
        lockedWhenAsked.push(failed.locked);
        return null;
      },
    });

    failedController.error(new DOMException('Bad frame.', 'FramingError'));

    await expect(monitoring).resolves.toBeUndefined();
    expect(lockedWhenAsked[0]).toBe(false);
  });

  it('ends after a recoverable error when the port has no stream left', async () => {
    const target = await connected();
    const monitoring = target.monitor(9600, () => {});
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));
    const lost = port.readable;
    port.readable = null;

    controller.error(new DOMException('Bad frame.', 'FramingError'));

    await expect(monitoring).resolves.toBeUndefined();
    expect(lost!.locked).toBe(false);
  });

  it('closes the port it opened when disconnect ran while the port changed speed', async () => {
    const target = await connected();
    let finishOpen = () => {};
    port.open.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishOpen = resolve;
        }),
    );
    const monitoring = target.monitor(9600, () => {});
    await vi.waitFor(() => expect(port.open).toHaveBeenCalled());

    await target.disconnect();
    finishOpen();

    await expect(monitoring).resolves.toBeUndefined();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('rejects before a connect', async () => {
    const target = new EsptoolFlasher({ firmwareUrl: '/robomania/firmware/' });

    await expect(target.monitor(9600, () => {})).rejects.toThrow('Not connected');
  });

  it('restarts the board with an RTS pulse once the stream is being read, and not before', async () => {
    const readingWhenPulled: boolean[] = [];
    esptool.after.mockReset().mockResolvedValue(undefined);
    esptool.setRTS.mockReset().mockImplementation(async (state: boolean) => {
      readingWhenPulled.push(port.readable!.locked);
      order.push(`rts ${state}`);
    });
    const target = await connected();
    const monitoring = target.monitor(115200, () => {}, { restart: true });

    await vi.waitFor(() => expect(order).toEqual(['release', 'open', 'setSignals', 'rts true', 'rts false']));
    expect(readingWhenPulled).toEqual([true, true]);
    controller.close();
    await monitoring;
    expect(esptool.after).not.toHaveBeenCalled();
  });

  it('restarts a board it reads with an RTS pulse on the open port, and reads on', async () => {
    esptool.setRTS.mockReset().mockImplementation(async (state: boolean) => {
      order.push(`rts ${state}`);
    });
    const target = await connected();
    const received: string[][] = [];
    const monitoring = target.monitor(115200, (lines) => received.push(lines));
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));

    await target.restart();
    controller.enqueue(encoder.encode('sketch blink/input\n'));
    controller.close();
    await monitoring;

    expect(order).toEqual(['release', 'open', 'setSignals', 'rts true', 'rts false']);
    expect(port.open).toHaveBeenCalledTimes(1);
    expect(received.flat()).toEqual(['sketch blink/input']);
  });

  it('rejects a restart while it reads no board', async () => {
    const target = await connected();

    await expect(target.restart()).rejects.toThrow('Not reading');
  });

  it('does not touch RTS when it is not asked to restart', async () => {
    esptool.setRTS.mockReset().mockResolvedValue(undefined);
    const target = await connected();
    const monitoring = target.monitor(115200, () => {});
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));

    controller.close();
    await monitoring;

    expect(esptool.setRTS).not.toHaveBeenCalled();
  });

  it('calls onLines with the blank lines too', async () => {
    const target = await connected();
    const received: string[][] = [];
    const monitoring = target.monitor(115200, (lines) => received.push(lines));
    await vi.waitFor(() => expect(port.open).toHaveBeenCalled());

    controller.enqueue(encoder.encode('one\n\ntwo\r\n'));
    controller.close();
    await monitoring;

    expect(received.flat()).toEqual(['one', '', 'two']);
  });

  it('sends a line with a line break on the port it reads, and lets go of the stream', async () => {
    const target = await connected();
    const monitoring = target.monitor(115200, () => {});
    await vi.waitFor(() => expect(port.readable!.locked).toBe(true));

    await target.send('cfg get');
    await target.send('cfg set ap_ssid my net');

    expect(written).toEqual(['cfg get\n', 'cfg set ap_ssid my net\n']);
    expect(port.writable!.locked).toBe(false);
    controller.close();
    await monitoring;
  });

  it('refuses to send before it reads, when the port is still at the flashing speed', async () => {
    const target = await connected();

    await expect(target.send('cfg get')).rejects.toThrow('Not reading the board.');
    expect(written).toEqual([]);
  });
});

