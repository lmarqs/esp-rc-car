import { describe, expect, it } from 'vitest';
import { chipFamilies, imageFor, isMissing, sketchKey, type Manifest } from '../../src/lib/flash/manifest';

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
    'blink/simple': {
      images: [
        {
          profile: 'bluepad32',
          chipFamily: 'ESP32',
          parts: [{ path: 'blink/simple/bluepad32/simple.ino.bin', offset: 65536 }],
        },
      ],
    },
  },
};

describe('sketchKey', () => {
  it('drops the sketches folder from a sketch at one level', () => {
    expect(sketchKey('sketches/web-relay')).toBe('web-relay');
  });

  it('keeps the project and the variant of a sketch at two levels', () => {
    expect(sketchKey('sketches/blink/simple')).toBe('blink/simple');
  });
});

describe('imageFor', () => {
  it('returns the image built for the chip', () => {
    expect(imageFor(manifest, 'balance-beam', 'ESP32-C3')).toBe(manifest.sketches['balance-beam']!.images[1]);
  });

  it('finds the image of a sketch at two levels by its path key', () => {
    expect(imageFor(manifest, sketchKey('sketches/blink/simple'), 'ESP32')).toBe(manifest.sketches['blink/simple']!.images[0]);
  });

  it('does not find a sketch at two levels by its last path segment', () => {
    expect(imageFor(manifest, 'simple', 'ESP32')).toEqual({ missing: true, available: [] });
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

describe('chipFamilies', () => {
  const image = (chipFamily: 'ESP32' | 'ESP8266') => ({ profile: chipFamily, chipFamily, parts: [] });
  const ladder: Manifest = {
    sketches: {
      'blink/simple': { images: [image('ESP32')] },
      'blink/input': { images: [image('ESP32'), image('ESP8266')] },
    },
  };

  it('joins the chips of every sketch once, in order of first appearance', () => {
    expect(chipFamilies(ladder, ['blink/simple', 'blink/input'])).toEqual(['ESP32', 'ESP8266']);
  });

  it('follows the order of the sketches given, not the order of the manifest', () => {
    const apart: Manifest = {
      sketches: { 'blink/simple': { images: [image('ESP8266')] }, 'blink/input': { images: [image('ESP32')] } },
    };
    expect(chipFamilies(apart, ['blink/simple', 'blink/input'])).toEqual(['ESP8266', 'ESP32']);
    expect(chipFamilies(apart, ['blink/input', 'blink/simple'])).toEqual(['ESP32', 'ESP8266']);
  });

  it('leaves out a sketch the manifest lacks', () => {
    expect(chipFamilies(ladder, ['blink/timer', 'blink/simple'])).toEqual(['ESP32']);
    expect(chipFamilies(ladder, ['blink/timer'])).toEqual([]);
  });
});
