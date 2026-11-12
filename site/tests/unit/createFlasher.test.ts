import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlasher } from '../../src/lib/flash/createFlasher';
import { EsptoolFlasher, type Flasher } from '../../src/lib/flash/flasher';

describe('createFlasher', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/robomania/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns the fake that a test set on window, even where Web Serial exists', () => {
    const fake = {} as Flasher;
    vi.stubGlobal('window', { __robomaniaFakeFlasher: fake });
    vi.stubGlobal('navigator', { serial: {} });

    expect(createFlasher()).toBe(fake);
  });

  it('returns an EsptoolFlasher where Web Serial exists and no fake is set', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { serial: {} });

    expect(createFlasher()).toBeInstanceOf(EsptoolFlasher);
  });

  it('returns null where there is neither a fake nor Web Serial', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});

    expect(createFlasher()).toBeNull();
  });
});
