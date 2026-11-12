import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest } from './manifest';

const DEFAULT_PATH = 'public/firmware/manifest.json';

/**
 * The manifest `mise run arduino:firmware` wrote, read at build time from the site's folder, or a manifest with no
 * sketches when the images were not built. `ROBOMANIA_FIRMWARE_MANIFEST` names another file, which the browser tests
 * use to build pages without building images; throws when that file is missing.
 */
export function readManifest(): Manifest {
  const override = process.env.ROBOMANIA_FIRMWARE_MANIFEST || undefined;
  const path = resolve(process.cwd(), override ?? DEFAULT_PATH);
  if (!existsSync(path)) {
    if (override) {
      throw new Error(`ROBOMANIA_FIRMWARE_MANIFEST names ${path}, which does not exist.`);
    }
    return { sketches: {} };
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}
