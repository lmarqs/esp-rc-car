import type { ESPLoader, Transport } from 'esptool-js';
import type { ManifestPart } from './manifest';

/**
 * A board the card flashes. Its methods reject with what the layer below throws, unchanged, so the session can tell
 * a closed port picker (`NotFoundError`) from a busy port (`InvalidStateError`, `NetworkError`) by the error's name.
 */
export interface Flasher {
  /** Asks the visitor for a port, opens it and reaches the board's ROM bootloader. Resolves with the chip's name. */
  connect(): Promise<string>;
  /** Writes every part at its offset, reporting 0 to 100 as it goes. */
  write(parts: readonly ManifestPart[], onProgress: (pct: number) => void): Promise<void>;
  /** Restarts the board into the sketch it now holds. */
  reset(): Promise<void>;
  /** Releases the port. Never rejects. */
  disconnect(): Promise<void>;
}

export interface EsptoolFlasherOptions {
  /** Where the manifest's part paths are served from, ending in a slash. */
  firmwareUrl: string;
  /** Speed of the flashing; the ROM bootloader is always reached at 115200. */
  baudRate?: number;
}

const ROM_BAUD_RATE = 115200;
const DEFAULT_BAUD_RATE = 460800;

const silentTerminal = { clean() {}, write() {}, writeLine() {} };

/**
 * Flashes over Web Serial with esptool-js. The images keep the flash mode, frequency and size they were built with,
 * and every offset comes from the manifest.
 */
export class EsptoolFlasher implements Flasher {
  private transport?: Transport;
  private loader?: ESPLoader;

  constructor(private readonly options: EsptoolFlasherOptions) {}

  async connect(): Promise<string> {
    // Loaded here so that a page that never flashes does not download esptool-js.
    const esptool = await import('esptool-js');
    await this.disconnect();
    const port = await navigator.serial.requestPort();
    this.transport = new esptool.Transport(port);
    this.loader = new esptool.ESPLoader({
      transport: this.transport,
      baudrate: this.options.baudRate ?? DEFAULT_BAUD_RATE,
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

  async write(parts: readonly ManifestPart[], onProgress: (pct: number) => void): Promise<void> {
    const loader = this.requireLoader();
    const fileArray = await Promise.all(
      parts.map(async (part) => ({ data: await this.fetchPart(part.path), address: part.offset })),
    );
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
    await this.requireLoader().after('hard_reset');
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.transport = undefined;
    this.loader = undefined;
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
    const response = await fetch(this.options.firmwareUrl + path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
