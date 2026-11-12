import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readManifest } from '../../src/lib/flash/readManifest';

describe('readManifest', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'manifest-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true });
  });

  it('reads the file that ROBOMANIA_FIRMWARE_MANIFEST names', () => {
    const path = join(directory, 'manifest.json');
    writeFileSync(path, JSON.stringify({ sketches: { blink: { images: [] } } }));
    vi.stubEnv('ROBOMANIA_FIRMWARE_MANIFEST', path);

    expect(readManifest()).toEqual({ sketches: { blink: { images: [] } } });
  });

  it('holds no sketches when the variable is unset and the default file is absent', () => {
    vi.stubEnv('ROBOMANIA_FIRMWARE_MANIFEST', '');
    vi.spyOn(process, 'cwd').mockReturnValue(directory);

    expect(readManifest()).toEqual({ sketches: {} });
  });

  it('throws when the variable names a file that is absent', () => {
    vi.stubEnv('ROBOMANIA_FIRMWARE_MANIFEST', join(directory, 'missing.json'));

    expect(() => readManifest()).toThrow('does not exist');
  });
});
