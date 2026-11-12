import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest } from './manifest';

const DEFAULT_PATH = 'public/firmware/manifest.json';

/**
 * The manifest `mise run arduino:firmware` wrote, read at build time from the site's folder, or a manifest with no
 * sketches when the images were not built. `ROBOMANIA_FIRMWARE_MANIFEST` names another file, which the browser tests
 * use to build pages without building images.
 */
export function readManifest(): Manifest {
  const path = resolve(process.env.ROBOMANIA_FIRMWARE_MANIFEST ?? DEFAULT_PATH);
  if (!existsSync(path)) {
    return { sketches: {} };
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}
