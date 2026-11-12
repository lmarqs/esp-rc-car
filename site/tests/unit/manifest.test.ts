import { describe, expect, it } from 'vitest';
import { imageFor, isMissing, type Manifest } from '../../src/lib/flash/manifest';

// The shape `mise run arduino:firmware` writes, with the offsets of its ESP32 and ESP32-C3 images.
const manifest: Manifest = {
  sketches: {
    'balance-beam': {
      images: [
        {
          profile: 'wroom32',
          chipFamily: 'ESP32',
          parts: [
            { path: 'balance-beam/wroom32/balance-beam.ino.bootloader.bin', offset: 4096 },
            { path: 'balance-beam/wroom32/balance-beam.ino.bin', offset: 65536 },
          ],
        },
        {
          profile: 'c3',
          chipFamily: 'ESP32-C3',
          parts: [
            { path: 'balance-beam/c3/balance-beam.ino.bootloader.bin', offset: 0 },
            { path: 'balance-beam/c3/balance-beam.ino.bin', offset: 65536 },
          ],
        },
      ],
    },
    servo: {
      images: [
        {
          profile: 'bluepad32',
          chipFamily: 'ESP32',
          parts: [{ path: 'servo/bluepad32/servo.ino.bin', offset: 65536 }],
        },
      ],
    },
  },
};

describe('imageFor', () => {
  it('returns the image built for the chip', () => {
    expect(imageFor(manifest, 'balance-beam', 'ESP32-C3')).toBe(manifest.sketches['balance-beam']!.images[1]);
  });

  it('lists the chips the sketch has images for when the chip has none', () => {
    const result = imageFor(manifest, 'balance-beam', 'ESP32-S3');

    expect(result).toEqual({ missing: true, available: ['ESP32', 'ESP32-C3'] });
    expect(isMissing(result)).toBe(true);
  });

  it('reports no available chip for a sketch the manifest lacks', () => {
    expect(imageFor(manifest, 'usb-key', 'ESP32')).toEqual({ missing: true, available: [] });
  });

  it('does not match a chip by prefix', () => {
    expect(isMissing(imageFor(manifest, 'servo', 'ESP32-C3'))).toBe(true);
  });
});
