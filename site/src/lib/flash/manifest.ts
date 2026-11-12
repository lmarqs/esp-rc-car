/** The chip names `arduino:firmware` writes, which are esptool-js's `CHIP_NAME` of the chips it can flash. */
export type ChipFamily = 'ESP32' | 'ESP32-C3' | 'ESP8266';

/** One file of an image, written at `offset` bytes into the flash. */
export interface ManifestPart {
  /** Path under `firmware/`, such as `blink/bluepad32/blink.ino.bin`. */
  path: string;
  offset: number;
}

/** What one `sketch.yaml` profile builds: the files that make a board run the sketch. */
export interface ManifestImage {
  profile: string;
  chipFamily: ChipFamily;
  parts: ManifestPart[];
}

export interface ManifestSketch {
  images: ManifestImage[];
  /** The fields the card asks for once the board is connected; absent when the sketch has none. */
  settings?: readonly unknown[];
}

/** The shape of `firmware/manifest.json`, which `mise run arduino:firmware` writes. */
export interface Manifest {
  sketches: Record<string, ManifestSketch>;
}

export interface MissingImage {
  missing: true;
  /** The chips the sketch has an image for, in manifest order. */
  available: ChipFamily[];
}

/**
 * The image of `sketch` for `chip`, or what the sketch has instead. `chip` is a name as esptool-js reports it, so it
 * may be a chip the site has no images for.
 */
export function imageFor(manifest: Manifest, sketch: string, chip: string): ManifestImage | MissingImage {
  const images = manifest.sketches[sketch]?.images ?? [];
  const image = images.find((candidate) => candidate.chipFamily === chip);
  if (image) {
    return image;
  }
  return { missing: true, available: [...new Set(images.map((candidate) => candidate.chipFamily))] };
}

export function isMissing(result: ManifestImage | MissingImage): result is MissingImage {
  return 'missing' in result;
}
