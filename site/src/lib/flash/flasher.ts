import type { ESPLoader, Transport } from 'esptool-js';
import { createLineSplitter } from './lines';
import type { ManifestPart } from './manifest';

/**
 * A board the card flashes. Its methods reject with what the layer below throws, unchanged, so the session can tell
 * a closed port picker (`NotFoundError`) from a busy port (`InvalidStateError`, `NetworkError`) by the error's name.
 */
export interface Flasher {
  /** Asks the visitor for a port, opens it and reaches the board's ROM bootloader. Resolves with the chip's name. */
  connect(): Promise<string>;
  /**
   * Downloads the parts, before the board is touched. Rejects with an error named `DownloadError` when a part does not
   * arrive.
   */
  load(parts: readonly ManifestPart[]): Promise<void>;
  /** Writes the parts that `load` downloaded, each at its offset, reporting 0 to 100 as it goes. */
  write(parts: readonly ManifestPart[], onProgress: (pct: number) => void): Promise<void>;
  /** Restarts the board into the sketch it now holds. */
  reset(): Promise<void>;
  /**
   * Reads what the sketch prints, at the sketch's own `baud`, and calls `onLines` with the lines each piece of text
   * completes. Call it after `reset`. Resolves once `disconnect` has released the port or the port is lost.
   */
  monitor(baud: number, onLines: (lines: string[]) => void): Promise<void>;
  /** Releases the port. Never rejects. */
  disconnect(): Promise<void>;
}

/** A part of the image did not download: the network failed or the server answered with an error. */
export class DownloadError extends Error {
  override name = 'DownloadError';
}

export interface EsptoolFlasherOptions {
  /** Where the manifest's part paths are served from, ending in a slash. */
  firmwareUrl: string;
}

/** The ROM bootloader is always reached at 115200. */
const ROM_BAUD_RATE = 115200;
const FLASH_BAUD_RATE = 460800;

/** The errors of Web Serial's `read` after which `port.readable` still gives a usable stream. */
const RECOVERABLE_READ_ERRORS: ReadonlySet<string> = new Set([
  'BufferOverrunError',
  'BreakError',
  'FramingError',
  'ParityError',
]);

function isRecoverable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && RECOVERABLE_READ_ERRORS.has(String(error.name));
}

const silentTerminal = { clean() {}, write() {}, writeLine() {} };

/**
 * Flashes over Web Serial with esptool-js. The images keep the flash mode, frequency and size they were built with,
 * and every offset comes from the manifest.
 */
export class EsptoolFlasher implements Flasher {
  private port?: SerialPort;
  private transport?: Transport;
  private loader?: ESPLoader;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private downloaded = new Map<string, Uint8Array>();

  constructor(private readonly options: EsptoolFlasherOptions) {}

  async connect(): Promise<string> {
    await this.disconnect();
    // First, while the click that started this is still fresh: requestPort needs that user activation, and the
    // download of esptool-js below can outlast it.
    const port = await navigator.serial.requestPort();
    this.port = port;
    // Loaded here so that a page that never flashes does not download esptool-js.
    const esptool = await import('esptool-js');
    this.transport = new esptool.Transport(port);
    this.loader = new esptool.ESPLoader({
      transport: this.transport,
      baudrate: FLASH_BAUD_RATE,
      romBaudrate: ROM_BAUD_RATE,
      terminal: silentTerminal,
    });
    try {
      await this.loader.main();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
    return this.loader.chip.CHIP_NAME;
  }

  async load(parts: readonly ManifestPart[]): Promise<void> {
    const entries = await Promise.all(parts.map(async (part) => [part.path, await this.fetchPart(part.path)] as const));
    this.downloaded = new Map(entries);
  }

  async write(parts: readonly ManifestPart[], onProgress: (pct: number) => void): Promise<void> {
    const loader = this.requireLoader();
    const fileArray = parts.map((part) => {
      const data = this.downloaded.get(part.path);
      if (!data) {
        throw new Error(`${part.path} was not downloaded.`);
      }
      return { data, address: part.offset };
    });
    const totalBytes = fileArray.reduce((sum, file) => sum + file.data.length, 0);
    let bytesBefore = 0;
    const bytesBeforeFile = fileArray.map((file) => {
      const before = bytesBefore;
      bytesBefore += file.data.length;
      return before;
    });

    onProgress(0);
    await loader.writeFlash({
      fileArray,
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      // esptool-js counts the bytes it sends, which are compressed, so a file's share is its fraction of that count.
      reportProgress: (fileIndex, written, total) => {
        const fileBytes = fileArray[fileIndex]!.data.length;
        const sent = bytesBeforeFile[fileIndex]! + fileBytes * (total === 0 ? 1 : written / total);
        onProgress(Math.floor((100 * sent) / totalBytes));
      },
    });
    onProgress(100);
  }

  async reset(): Promise<void> {
    const loader = this.requireLoader();
    // esptool-js 0.7.1's hard reset only releases RTS (`setRTS(false)`) and never pulls it, so after the connect's reset
    // sequence left RTS released it makes no edge on EN and the board keeps running whatever it ran. esptool.py pulses
    // RTS first. DTR stays released, so IO0 stays high and the board restarts into the sketch, not the bootloader.
    await this.transport!.setRTS(true);
    await loader.after('hard_reset');
  }

  async monitor(baud: number, onLines: (lines: string[]) => void): Promise<void> {
    const transport = this.transport;
    const port = this.port;
    if (!transport || !port) {
      throw new Error('Not connected to a board.');
    }
    // esptool-js holds the port at the flashing speed; the sketch talks at its own.
    await transport.disconnect();
    await port.open({ baudRate: baud });
    if (this.transport !== transport) {
      // `disconnect` ran while the port was changing speed.
      await port.close().catch(() => {});
      return;
    }
    // Opening the port can pull DTR and RTS, which reset an ESP-01S on a CH340 adapter into its boot loader.
    await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});
    let reader = port.readable!.getReader();
    this.reader = reader;
    const decoder = new TextDecoder();
    const splitter = createLineSplitter();
    try {
      for (;;) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const lines = splitter.push(decoder.decode(value, { stream: true }));
          if (lines.length > 0) {
            onLines(lines);
          }
        } catch (error) {
          // A board at another speed than the reader's causes errors that leave the port usable, and `readable`
          // then returns a fresh stream. Any other error means the board was unplugged, which ends the reading as
          // disconnecting does.
          const next = this.transport === transport && isRecoverable(error) ? port.readable : null;
          if (!next) {
            break;
          }
          reader.releaseLock();
          reader = next.getReader();
          this.reader = reader;
        }
      }
    } finally {
      reader.releaseLock();
      if (this.reader === reader) {
        this.reader = undefined;
      }
    }
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    const reader = this.reader;
    this.transport = undefined;
    this.loader = undefined;
    this.reader = undefined;
    try {
      // Ends the reading that `monitor` started, which would keep the port locked.
      await reader?.cancel();
    } catch {
      // The stream is already closed.
    }
    try {
      await transport?.disconnect();
    } catch {
      // The port is already closed or gone, which is what disconnecting is after.
    }
  }

  private requireLoader() {
    if (!this.loader) {
      throw new Error('Not connected to a board.');
    }
    return this.loader;
  }

  private async fetchPart(path: string): Promise<Uint8Array> {
    try {
      const response = await fetch(this.options.firmwareUrl + path);
      if (!response.ok) {
        throw new Error(`the server answered ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      throw new DownloadError(`Could not download ${path}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
