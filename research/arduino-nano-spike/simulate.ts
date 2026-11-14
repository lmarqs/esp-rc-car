/**
 * Flashes a hex into a simulated Nano bootloader, which answers as optiboot.c and ATmegaBOOT_168.c in ArduinoCore-avr
 * do: only after a DTR reset, only at its own speed, leaving for the sketch on a byte it does not expect. It checks
 * the protocol logic, not a board.
 *
 * Run: node simulate.ts <sketch>.ino.hex
 */
import { readFileSync } from 'node:fs';
import { hexToImage } from './intelHex.ts';
import { NoAnswerError, reachBootloader, release, writeImage, type SerialPortLike } from './stk500.ts';

const PAGE = 128;

class SimulatedNano implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  readonly flash = new Uint8Array(32768).fill(0xff);
  private readonly bootloaderBaud: number;
  private baud = 0;
  private dtr = false;
  private inBootloader = false;
  private input: number[] = [];
  private address = 0;
  private readonly pageBuffer = new Uint8Array(PAGE);
  private output?: ReadableStreamDefaultController<Uint8Array>;

  constructor(bootloaderBaud: number) {
    this.bootloaderBaud = bootloaderBaud;
  }

  async open({ baudRate }: { baudRate: number }): Promise<void> {
    this.baud = baudRate;
    this.readable = new ReadableStream({ start: (controller) => void (this.output = controller) });
    this.writable = new WritableStream({ write: (chunk) => this.receive(chunk) });
  }

  async close(): Promise<void> {
    try {
      this.output?.close();
    } catch {
      // The reader's cancel already closed it, as with a real port.
    }
    this.output = undefined;
    this.readable = null;
    this.writable = null;
  }

  async setSignals({ dataTerminalReady }: { dataTerminalReady?: boolean }): Promise<void> {
    if (dataTerminalReady === true && !this.dtr) {
      this.inBootloader = true;
      this.input = [];
    }
    if (dataTerminalReady !== undefined) this.dtr = dataTerminalReady;
  }

  private receive(chunk: Uint8Array): void {
    if (!this.inBootloader) return;
    if (this.baud !== this.bootloaderBaud) {
      this.inBootloader = false;
      return;
    }
    this.input.push(...chunk);
    for (;;) {
      const length = this.commandLength();
      if (length === undefined || this.input.length < length) return;
      const bytes = this.input.splice(0, length);
      if (bytes[length - 1] !== 0x20) {
        this.inBootloader = false;
        return;
      }
      this.answer(bytes);
      if (!this.inBootloader) return;
    }
  }

  private commandLength(): number | undefined {
    const [command, high, low] = this.input;
    if (command === undefined) return undefined;
    if (command === 0x55) return 4;
    if (command === 0x74) return 5;
    if (command === 0x64) return high === undefined || low === undefined ? undefined : 5 + ((high << 8) | low);
    return 2;
  }

  private answer(bytes: number[]): void {
    const [command] = bytes;
    let data: number[] = [];
    if (command === 0x75) data = [0x1e, 0x95, 0x0f];
    if (command === 0x55) this.address = (bytes[1]! | (bytes[2]! << 8)) * 2;
    if (command === 0x64) {
      const length = (bytes[1]! << 8) | bytes[2]!;
      this.pageBuffer.set(bytes.slice(4, 4 + length));
      this.flash.set(this.pageBuffer, this.address);
    }
    if (command === 0x74) {
      const length = (bytes[1]! << 8) | bytes[2]!;
      data = [...this.flash.subarray(this.address, this.address + length)];
    }
    if (command === 0x51) this.inBootloader = false;
    const reply = Uint8Array.from([0x14, ...data, 0x10]);
    setTimeout(() => this.output?.enqueue(reply), 1);
  }
}

const image = hexToImage(readFileSync(process.argv[2]!, 'utf8'));
console.log(`image: ${image.length} bytes, ${Math.ceil(image.length / PAGE)} pages`);

for (const bootloaderBaud of [115200, 57600]) {
  const nano = new SimulatedNano(bootloaderBaud);
  const started = Date.now();
  const session = await reachBootloader(nano);
  let last = -1;
  await writeImage(session, image, (pct) => (last = pct));
  await release(nano, session);
  const same = image.every((byte, i) => nano.flash[i] === byte);
  console.log(
    `bootloader at ${bootloaderBaud}: reached at ${session.baud}, progress ended at ${last}%, ` +
      `flash ${same ? 'matches' : 'DIFFERS FROM'} the image, ${Date.now() - started} ms`,
  );
}

try {
  await reachBootloader(new SimulatedNano(19200));
  console.log('bootloader at 19200: reached, which is wrong');
} catch (error) {
  console.log(`bootloader at 19200: ${error instanceof NoAnswerError ? 'NoAnswerError' : error}: ${(error as Error).message}`);
}
