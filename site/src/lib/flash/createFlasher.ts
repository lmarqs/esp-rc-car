import { href } from '../href';
import { EsptoolFlasher, type Flasher } from './flasher';

declare global {
  interface Window {
    /** Set by Playwright before the page's scripts run, so the site flashes through it instead of a real port. */
    __robomaniaFakeFlasher?: Flasher;
  }
}

/** The flasher the session uses: the test's fake when set, esptool-js over Web Serial, or none in a browser without it. */
export function createFlasher(): Flasher | null {
  if (typeof window !== 'undefined' && window.__robomaniaFakeFlasher) {
    return window.__robomaniaFakeFlasher;
  }
  if (typeof navigator !== 'undefined' && 'serial' in navigator) {
    return new EsptoolFlasher({ firmwareUrl: href('/firmware/') });
  }
  return null;
}
