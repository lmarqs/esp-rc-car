import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { href } from '../../src/lib/href';

describe('href', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/robomania/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefixes a site path with the base the site is served under', () => {
    expect(href('/projects/')).toBe('/robomania/projects/');
  });

  it('maps the root path to the base', () => {
    expect(href('/')).toBe('/robomania/');
  });
});
