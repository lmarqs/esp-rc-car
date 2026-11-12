/** The chip names `arduino:firmware` writes, which are esptool-js's `CHIP_NAME` of the chips it can flash. */
export type ChipFamily = 'ESP32' | 'ESP32-C3' | 'ESP8266';

/** One file of an image, written at `offset` bytes into the flash. */
export interface ManifestPart {
  /** Path under `firmware/`, such as `blink/simple/bluepad32/simple.ino.bin`. */
  path: string;
  offset: number;
}

/** What one `sketch.yaml` profile builds: the files that make a board run the sketch. */
export interface ManifestImage {
  profile: string;
  chipFamily: ChipFamily;
  parts: ManifestPart[];
}

/**
 * A setting the card asks for once the board is connected, which it sends to the sketch with `cfg set <key> <value>`.
 * The limits are those the sketch's `cfg set` checks.
 */
export interface SettingField {
  /** The sketch's name for it in the `cfg` protocol, such as `ap_ssid`. */
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  /** The value the sketch uses when the board has none stored. */
  default: string | number;
  help?: string;
  /** For a text or a password: its length in characters. */
  minLength?: number;
  maxLength?: number;
  /** For a number: its range and the step its input moves by. */
  min?: number;
  max?: number;
  step?: number;
  /** Fields that share a group are numbers that must not go down in the order the fields are listed. */
  group?: string;
}

export interface ManifestSketch {
  images: ManifestImage[];
  /** The `settings.json` of the sketch, in the order the card asks for them; absent when the sketch has none. */
  settings?: readonly SettingField[];
}

/**
 * The shape of `firmware/manifest.json`, which `mise run arduino:firmware` writes. A sketch is keyed by its path under
 * `sketches/`, such as `web-relay` or `blink/simple`.
 */
export interface Manifest {
  sketches: Record<string, ManifestSketch>;
}

export interface MissingImage {
  missing: true;
  /** The chips the sketch has an image for, in manifest order. */
  available: ChipFamily[];
}

const SKETCHES_FOLDER = 'sketches/';

/**
 * The key of a project's `sketch` field in the manifest: the sketch's path under `sketches/`, such as `blink` for
 * `sketches/blink` and `blink/simple` for `sketches/blink/simple`.
 */
export function sketchKey(sketchPath: string): string {
  return sketchPath.startsWith(SKETCHES_FOLDER) ? sketchPath.slice(SKETCHES_FOLDER.length) : sketchPath;
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
