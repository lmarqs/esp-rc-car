/**
 * A minimal STK500v1 flasher for an Arduino Nano's bootloader (Optiboot or the old ATmegaBOOT), over a Web Serial
 * port or any object shaped like one, such as esptool-js's `WebUSBSerialPort`. Research spike: not wired into the site.
 */

/** The part of Web Serial's `SerialPort` the flasher uses. esptool-js 0.7.1's `WebUSBSerialPort` has the same shape. */
export interface SerialPortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
}

/** A board's bootloader as the flasher reaches it. */
export interface AvrBoard {
  readonly chip: string;
  readonly signature: readonly number[];
  readonly pageSize: number;
  /** Bytes the sketch may use: the flash minus the bootloader's section. */
  readonly maximumSize: number;
  /** Tried in order: Optiboot's speed first, then the old bootloader's. */
  readonly bauds: readonly number[];
}

/** `arduino:avr:nano` in ArduinoCore-avr's boards.txt: `upload.speed` 115200 (Optiboot) or 57600 (atmega328old). */
export const NANO: AvrBoard = {
  chip: 'ATmega328P',
  signature: [0x1e, 0x95, 0x0f],
  pageSize: 128,
  maximumSize: 30720,
  bauds: [115200, 57600],
};

const STK_OK = 0x10;
const STK_INSYNC = 0x14;
const CRC_EOP = 0x20;
const STK_GET_SYNC = 0x30;
const STK_ENTER_PROGMODE = 0x50;
const STK_LEAVE_PROGMODE = 0x51;
const STK_LOAD_ADDRESS = 0x55;
const STK_PROG_PAGE = 0x64;
const STK_READ_PAGE = 0x74;
const STK_READ_SIGN = 0x75;
const MEMORY_FLASH = 0x46; // 'F'

/** Optiboot's watchdog restarts the sketch 1 s after the reset; a sync reply takes far less. */
const SYNC_REPLY_MS = 200;
const SYNC_ATTEMPTS = 4;
const COMMAND_REPLY_MS = 1000;

export class NoAnswerError extends Error {
  override name = 'NoAnswerError';
}

export class WrongChipError extends Error {
  override name = 'WrongChipError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the port in the background into a queue, so a timed-out read loses no byte. */
export class Link {
  private readonly queue: number[] = [];
  private wake?: () => void;
  private readonly port: SerialPortLike;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly pumping: Promise<void>;

  constructor(port: SerialPortLike) {
    this.port = port;
    this.reader = port.readable!.getReader();
    this.pumping = this.pump();
  }

  private async pump(): Promise<void> {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) return;
        for (const byte of value) this.queue.push(byte);
        this.wake?.();
      }
    } catch {
      // The port closed or was lost; readers time out.
    }
  }

  drain(): void {
    this.queue.length = 0;
  }

  async write(bytes: readonly number[]): Promise<void> {
    const writer = this.port.writable!.getWriter();
    try {
      await writer.write(Uint8Array.from(bytes));
    } finally {
      writer.releaseLock();
    }
  }

  async read(count: number, timeoutMs: number): Promise<number[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.queue.length < count) {
      const left = deadline - Date.now();
      if (left <= 0) throw new NoAnswerError(`no reply within ${timeoutMs} ms`);
      await Promise.race([new Promise<void>((resolve) => (this.wake = resolve)), sleep(left)]);
    }
    return this.queue.splice(0, count);
  }

  async close(): Promise<void> {
    await this.reader.cancel().catch(() => {});
    this.reader.releaseLock();
    await this.pumping;
  }
}

/**
 * The auto-reset pulse of avrdude's `-c arduino` (`arduino_open` in avrdude 8.0's src/arduino.c): DTR and RTS
 * released for 250 ms, asserted, released, then 100 ms for the bootloader to start. The Nano's 100 nF capacitor from
 * DTR to RESET turns the assert into a short low pulse on RESET, an external reset, the only one Optiboot stays for.
 */
async function pulseReset(port: SerialPortLike): Promise<void> {
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  await sleep(250);
  await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  await sleep(100);
}

async function command(link: Link, bytes: readonly number[], replyLength: number, timeoutMs = COMMAND_REPLY_MS) {
  await link.write([...bytes, CRC_EOP]);
  const reply = await link.read(replyLength + 2, timeoutMs);
  if (reply[0] !== STK_INSYNC || reply[reply.length - 1] !== STK_OK) {
    throw new NoAnswerError(`out of sync after 0x${bytes[0]!.toString(16)}: ${reply.map((b) => b.toString(16))}`);
  }
  return reply.slice(1, -1);
}

/** avrdude's `stk500_getsync`: two syncs to clear line noise, then attempts, each after a fresh reset. */
async function sync(port: SerialPortLike, link: Link): Promise<boolean> {
  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt++) {
    await pulseReset(port);
    link.drain();
    try {
      await command(link, [STK_GET_SYNC], 0, SYNC_REPLY_MS);
      return true;
    } catch (error) {
      if (!(error instanceof NoAnswerError)) throw error;
    }
  }
  return false;
}

/** A bootloader reached at `baud`, ready for commands. */
export interface Session {
  readonly baud: number;
  readonly link: Link;
}

/**
 * Opens `port` at each of the board's speeds until its bootloader answers. A bootloader that reads bytes at the
 * wrong speed leaves for the sketch (Optiboot's `verifySpace`, ATmegaBOOT's `MAX_ERROR_COUNT`), so each speed gets
 * its own reset.
 */
export async function reachBootloader(port: SerialPortLike, board: AvrBoard = NANO): Promise<Session> {
  for (const baud of board.bauds) {
    await port.open({ baudRate: baud });
    const link = new Link(port);
    if (await sync(port, link)) {
      const signature = await command(link, [STK_READ_SIGN], 3);
      if (signature.some((byte, i) => byte !== board.signature[i])) {
        await link.close();
        await port.close();
        throw new WrongChipError(`signature ${signature.map((b) => b.toString(16)).join(' ')} is not a ${board.chip}`);
      }
      return { baud, link };
    }
    await link.close();
    await port.close();
  }
  throw new NoAnswerError(`no bootloader answered at ${board.bauds.join(' or ')} baud`);
}

/**
 * Writes `image`, from address 0, page by page, then reads every page back. Optiboot always writes a whole page
 * from its buffer, so the last page is padded with 0xFF, the erased value.
 */
export async function writeImage(
  { link }: Session,
  image: Uint8Array,
  onProgress: (pct: number) => void,
  board: AvrBoard = NANO,
): Promise<void> {
  if (image.length > board.maximumSize) {
    throw new RangeError(`the image is ${image.length} bytes; the ${board.chip} takes ${board.maximumSize}`);
  }
  const pages = Math.ceil(image.length / board.pageSize);
  const page = (index: number) => {
    const bytes = new Uint8Array(board.pageSize).fill(0xff);
    bytes.set(image.subarray(index * board.pageSize, (index + 1) * board.pageSize));
    return bytes;
  };
  const loadAddress = (index: number) => {
    const word = (index * board.pageSize) >> 1;
    return command(link, [STK_LOAD_ADDRESS, word & 0xff, word >> 8], 0);
  };
  const size = [board.pageSize >> 8, board.pageSize & 0xff];

  await command(link, [STK_ENTER_PROGMODE], 0);
  for (let index = 0; index < pages; index++) {
    await loadAddress(index);
    await command(link, [STK_PROG_PAGE, ...size, MEMORY_FLASH, ...page(index)], 0);
    onProgress(Math.floor((50 * (index + 1)) / pages));
  }
  for (let index = 0; index < pages; index++) {
    await loadAddress(index);
    const read = await command(link, [STK_READ_PAGE, ...size, MEMORY_FLASH], board.pageSize);
    const expected = page(index);
    const at = read.findIndex((byte, i) => byte !== expected[i]);
    if (at !== -1) throw new Error(`verify failed at 0x${(index * board.pageSize + at).toString(16)}`);
    onProgress(50 + Math.floor((50 * (index + 1)) / pages));
  }
  // Optiboot answers, then lets its watchdog restart the board into the new sketch.
  await command(link, [STK_LEAVE_PROGMODE], 0);
}

/** Releases the port, which stays usable for a monitor opened at the sketch's own speed. */
export async function release(port: SerialPortLike, { link }: Session): Promise<void> {
  await link.close();
  await port.close();
}
