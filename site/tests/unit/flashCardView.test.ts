import { describe, expect, it } from 'vitest';
import { TO_THE_BOARD_BAR, viewFor } from '../../src/components/flash/view';
import type { SessionState } from '../../src/lib/flash';
import type { ManifestImage, SettingField } from '../../src/lib/flash/manifest';

const context = { title: 'Blink' };
const running = { kind: 'running', chip: 'ESP32', output: [] } as const;

describe('viewFor', () => {
  it.each<SessionState>([
    { kind: 'idle' },
    { kind: 'idle', released: true },
    { kind: 'connecting' },
    { kind: 'flashing', chip: 'ESP32', pct: 42 },
    { kind: 'flashMode', chip: 'ESP8266' },
    { kind: 'noPort' },
    { kind: 'portBusy' },
    { kind: 'noAnswer' },
    { kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] },
    { kind: 'noDownload' },
    { kind: 'dropped', pct: 40 },
    { ...running, lost: true },
  ])('points at the board bar, with no button, for %j', (state) => {
    expect(viewFor(state, true, context)).toEqual({ message: 'Connect and flash it from the board bar below.' });
  });

  it('points at the board bar whatever the session does with another sketch', () => {
    const opened = { ap_ssid: 'web-relay' };
    const states: SessionState[] = [
      running,
      { kind: 'settings', chip: 'ESP8266', opened },
      { kind: 'settings', chip: 'ESP8266', opened, flashed: true },
      { kind: 'reading', chip: 'ESP8266' },
      { kind: 'applying', chip: 'ESP8266' },
    ];
    for (const state of states) expect(viewFor(state, false, context)).toEqual({ message: TO_THE_BOARD_BAR });
  });

  describe('once the board runs the sketch', () => {
    it('says the board runs the project, then what to do next', () => {
      expect(viewFor(running, true, { title: 'Blink', next: 'Watch the LED.' })).toEqual({
        message: 'Your board is running Blink. Watch the LED.',
      });
    });

    it('says only that the board runs when the project has no next step', () => {
      expect(viewFor(running, true, context)).toEqual({ message: 'Your board is running Blink.' });
    });
  });

  it('links the images, each part with its offset, and the build-it-yourself section where the browser cannot flash', () => {
    const images: ManifestImage[] = [
      {
        profile: 'esp32',
        chipFamily: 'ESP32',
        parts: [
          { path: 'blink/esp32/blink.ino.bootloader.bin', offset: 4096 },
          { path: 'blink/esp32/blink.ino.bin', offset: 65536 },
        ],
      },
    ];
    const view = viewFor({ kind: 'unsupported' }, false, { ...context, images, firmwareUrl: '/robomania/firmware/' });

    expect(view.message).toBe('This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.');
    expect(view.notice).toBe(true);
    expect(view.action).toBeUndefined();
    expect(view.links).toEqual([
      { label: 'esp32: blink.ino.bootloader.bin at 0x1000', href: '/robomania/firmware/blink/esp32/blink.ino.bootloader.bin' },
      { label: 'esp32: blink.ino.bin at 0x10000', href: '/robomania/firmware/blink/esp32/blink.ino.bin' },
      { label: 'Run it on your board', href: '#run-it-on-your-board' },
    ]);
  });

  it('links the parts of a sketch at two levels under their folders, with the slash unescaped', () => {
    const images: ManifestImage[] = [
      { profile: 'esp32', chipFamily: 'ESP32', parts: [{ path: 'blink/simple/esp32/simple.ino.bin', offset: 65536 }] },
    ];
    const view = viewFor({ kind: 'unsupported' }, false, { ...context, images, firmwareUrl: '/robomania/firmware/' });

    expect(view.links?.[0]).toEqual({
      label: 'esp32: simple.ino.bin at 0x10000',
      href: '/robomania/firmware/blink/simple/esp32/simple.ino.bin',
    });
  });

  it('points a browser that cannot flash to the project page when the card is on another page', () => {
    const view = viewFor({ kind: 'unsupported' }, false, { ...context, detailsHref: '/robomania/projects/blink/' });

    expect(view.links).toEqual([{ label: 'Run it on your board', href: '/robomania/projects/blink/#run-it-on-your-board' }]);
  });
});

describe('viewFor a sketch with settings', () => {
  const settings: SettingField[] = [
    { key: 'ap_ssid', label: 'Hotspot name', type: 'text', default: 'web-relay', minLength: 1, maxLength: 32 },
    { key: 'ap_password', label: 'Hotspot password', type: 'password', default: 'web-relay-1234', minLength: 8 },
  ];
  const withSettings = { title: 'Web relay', settings };
  const opened = { ap_ssid: 'web-relay', ap_password: '' };
  const KEEPS = 'Values the board already stores stay unless you change them here.';

  it('shows the form once the board answers, with a button that flashes and Cancel, which lets the board go', () => {
    expect(viewFor({ kind: 'settings', chip: 'ESP8266', opened }, true, withSettings)).toEqual({
      message: 'Found ESP8266. Check the settings, then flash the board.',
      form: { submit: 'Flash with these settings', errors: {}, values: opened, help: KEEPS },
      action: { label: 'Cancel', event: 'retry' },
    });
  });

  it('names the first field at fault, in form order', () => {
    const errors = { ap_password: 'Use at least 8 characters.', ap_ssid: 'Use 1 to 32 characters.' };
    const view = viewFor({ kind: 'settings', chip: 'ESP8266', opened, errors }, true, withSettings);

    expect(view.message).toBe('Check Hotspot name: Use 1 to 32 characters.');
    expect(view.notice).toBe(true);
    expect(view.form).toEqual({ submit: 'Flash with these settings', errors, values: opened, help: KEEPS });
  });

  it('reopens the form for a board that runs the sketch, with a button that sends and Cancel, which closes it', () => {
    expect(viewFor({ kind: 'settings', chip: 'ESP8266', opened, flashed: true }, true, withSettings)).toEqual({
      message: 'Your board is running Web relay. Change its settings, then send them.',
      form: { submit: 'Send these settings', errors: {}, values: opened },
      action: { label: 'Cancel', event: 'closeSettings' },
    });
  });

  it('says the board did not list its settings', () => {
    const view = viewFor({ kind: 'settings', chip: 'ESP8266', opened, flashed: true, noAnswer: true }, true, withSettings);

    expect(view.message).toBe('The board did not list its settings. Check that it runs Web relay, then send them again.');
    expect(view.notice).toBe(true);
  });

  it('offers no button while it reads the settings to reopen the form', () => {
    expect(viewFor({ kind: 'reading', chip: 'ESP8266' }, true, withSettings)).toEqual({
      message: "Reading the board's settings.",
    });
  });

  it('offers no button while it sends the settings', () => {
    expect(viewFor({ kind: 'applying', chip: 'ESP8266' }, true, withSettings)).toEqual({
      message: 'Sending the settings to the board.',
    });
  });

  it('offers Change settings once the board runs the sketch, but not once it is lost', () => {
    expect(viewFor(running, true, withSettings)).toEqual({
      message: 'Your board is running Web relay.',
      action: { label: 'Change settings', event: 'changeSettings' },
    });
    expect(viewFor({ ...running, lost: true }, true, withSettings).action).toBeUndefined();
  });
});
