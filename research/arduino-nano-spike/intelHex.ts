/**
 * Turns the Intel HEX that arduino-cli writes for an AVR (`<sketch>.ino.hex`) into the bytes from address 0, with gaps
 * as 0xFF. esptool-js 0.7.1 exports `parseIntelHex`, which returns segments instead; either fits.
 */
export function hexToImage(text: string): Uint8Array {
  const bytes = new Map<number, number>();
  let base = 0;
  let end = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === '') continue;
    if (!line.startsWith(':')) throw new SyntaxError(`line ${index + 1} does not start with ':'`);
    const record = line
      .slice(1)
      .match(/../g)!
      .map((pair) => parseInt(pair, 16));
    const [length, high, low, type] = record as [number, number, number, number];
    if (record.length !== length + 5) throw new SyntaxError(`line ${index + 1} has the wrong length`);
    if (record.reduce((sum, byte) => sum + byte, 0) & 0xff) throw new SyntaxError(`line ${index + 1} fails its checksum`);
    const data = record.slice(4, 4 + length);
    if (type === 0x00) {
      const address = base + ((high << 8) | low);
      data.forEach((byte, offset) => bytes.set(address + offset, byte));
      end = Math.max(end, address + length);
    } else if (type === 0x01) {
      break;
    } else if (type === 0x02) {
      base = ((data[0]! << 8) | data[1]!) << 4;
    } else if (type === 0x04) {
      base = ((data[0]! << 8) | data[1]!) << 16;
    }
    // 0x03 and 0x05 name a start address, which a bootloader does not use.
  }
  const image = new Uint8Array(end).fill(0xff);
  for (const [address, byte] of bytes) image[address] = byte;
  return image;
}
