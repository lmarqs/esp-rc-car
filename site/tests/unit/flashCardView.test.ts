import { describe, expect, it } from 'vitest';
import { stepsFor, viewFor } from '../../src/components/flash/view';
import type { SessionState } from '../../src/lib/flash';
import type { ManifestImage, SettingField } from '../../src/lib/flash/manifest';
import { boardModel } from '../../src/lib/board/models';
import * as wording from '../../src/lib/flash/wording';

const context = { title: 'Blink' };

describe('viewFor', () => {
  it('asks to connect while idle', () => {
    expect(viewFor({ kind: 'idle' }, context)).toEqual({
      step: 'connect',
      message: 'Plug the board in over USB. This replaces whatever is on the board.',
      actions: [{ label: 'Connect board', event: 'connect' }],
    });
  });

  it('says the board keeps running once the visitor disconnected it', () => {
    expect(viewFor({ kind: 'idle', released: true }, context)).toEqual({
      step: 'connect',
      message: 'The board is released and keeps running. Connect again to flash it.',
      actions: [{ label: 'Connect board', event: 'connect' }],
    });
  });

  it('offers no button while connecting', () => {
    expect(viewFor({ kind: 'connecting' }, context).actions).toBeUndefined();
  });

  it('shows the chip and the percentage while flashing, with no button', () => {
    const view = viewFor({ kind: 'flashing', chip: 'ESP32', pct: 42 }, context);

    expect(view).toEqual({ step: 'flash', message: 'Found ESP32' });
  });

  describe('once the board runs', () => {
    const running = { kind: 'running', chip: 'ESP32', output: [] } as const;

    it('says it is done, that the board runs the project, then what to do next', () => {
      const view = viewFor(running, { title: 'Blink', next: 'Watch the LED.' });

      expect(view.step).toBe('running');
      expect(view.message).toBe('Done. Your board is running Blink. Watch the LED.');
    });

    it('says only that the board runs when the project has no next step', () => {
      expect(viewFor(running, context).message).toBe('Done. Your board is running Blink.');
    });

    it('offers Flash again, which connects, and Disconnect', () => {
      expect(viewFor(running, context).actions).toEqual([
        { label: 'Flash again', event: 'connect' },
        { label: 'Disconnect', event: 'disconnect' },
      ]);
    });

    it('labels the output with the baud rate and hands over the lines', () => {
      const view = viewFor({ ...running, output: ['HIGH', 'LOW'] }, { ...context, baud: 9600 });

      expect(view.output).toEqual({ label: 'Board output, 9600 baud', lines: ['HIGH', 'LOW'] });
    });

    it('says the board stopped talking, keeping the lines, and offers Connect again', () => {
      const view = viewFor({ ...running, output: ['HIGH'], lost: true }, { ...context, baud: 9600 });

      expect(view).toEqual({
        step: 'running',
        message: 'The board stopped talking to the page. Plug it back in and connect again.',
        notice: true,
        output: { label: 'Board output, 9600 baud', lines: ['HIGH'] },
        actions: [{ label: 'Connect again', event: 'connect' }],
      });
    });

    it('shows no output for a project with no baud rate', () => {
      expect(viewFor(running, context).output).toBeUndefined();
    });
  });

  it.each<[SessionState, string, string]>([
    [{ kind: 'noPort' }, 'No board was chosen. Plug it in and try again.', 'Connect board'],
    [
      { kind: 'portBusy' },
      'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.',
      'Connect board',
    ],
    [
      { kind: 'noAnswer' },
      'The board did not answer. Hold its BOOT button and connect again. On an ESP-01S, set the USB adapter to flash mode first.',
      'Connect board',
    ],
    [
      { kind: 'noImage', chip: 'ESP8266', available: ['ESP32', 'ESP32-C3'] },
      'This board is an ESP8266. Blink has images for: ESP32, ESP32-C3.',
      'Connect another board',
    ],
    [
      { kind: 'noDownload' },
      'The image did not download. Check your internet connection and try again.',
      'Flash again',
    ],
    [
      { kind: 'dropped', pct: 40 },
      'The connection dropped at 40%. Nothing is broken. Plug the board back in and flash again.',
      'Flash again',
    ],
  ])('shows %j as a notice whose button connects again', (state, message, label) => {
    expect(viewFor(state, context)).toEqual({
      step: 'connect',
      message,
      notice: true,
      actions: [{ label, event: 'connect' }],
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
    const view = viewFor({ kind: 'unsupported' }, { ...context, images, firmwareUrl: '/robomania/firmware/' });

    expect(view.message).toBe('This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.');
    expect(view.actions).toBeUndefined();
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
    const view = viewFor({ kind: 'unsupported' }, { ...context, images, firmwareUrl: '/robomania/firmware/' });

    expect(view.links?.[0]).toEqual({
      label: 'esp32: simple.ino.bin at 0x10000',
      href: '/robomania/firmware/blink/simple/esp32/simple.ino.bin',
    });
  });

  it('points a browser that cannot flash to the project page when the card is on another page', () => {
    const view = viewFor({ kind: 'unsupported' }, { ...context, detailsHref: '/robomania/projects/blink/' });

    expect(view.links).toEqual([{ label: 'Run it on your board', href: '/robomania/projects/blink/#run-it-on-your-board' }]);
  });
});

describe('stepsFor', () => {
  it('puts Settings between Connect and Flash only for a sketch that has some', () => {
    expect(stepsFor(false)).toEqual(['connect', 'flash', 'running']);
    expect(stepsFor(true)).toEqual(['connect', 'settings', 'flash', 'running']);
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

  it('shows the form on the Settings step once the board answers, with a button that flashes', () => {
    expect(viewFor({ kind: 'settings', chip: 'ESP8266', opened }, withSettings)).toEqual({
      step: 'settings',
      message: 'Found ESP8266. Check the settings, then flash the board.',
      form: { submit: 'Flash with these settings', errors: {}, values: opened, help: KEEPS },
      actions: [{ label: 'Cancel', event: 'retry' }],
    });
  });

  it('names the first field at fault, in form order', () => {
    const errors = { ap_password: 'Use at least 8 characters.', ap_ssid: 'Use 1 to 32 characters.' };
    const view = viewFor({ kind: 'settings', chip: 'ESP8266', opened, errors }, withSettings);

    expect(view.message).toBe('Check Hotspot name: Use 1 to 32 characters.');
    expect(view.notice).toBe(true);
    expect(view.form).toEqual({ submit: 'Flash with these settings', errors, values: opened, help: KEEPS });
  });

  it('reopens the form on the Running step for a board that runs the sketch, with a button that sends', () => {
    expect(viewFor({ kind: 'settings', chip: 'ESP8266', opened, flashed: true }, withSettings)).toEqual({
      step: 'running',
      message: 'Your board is running Web relay. Change its settings, then send them.',
      form: { submit: 'Send these settings', errors: {}, values: opened },
      actions: [{ label: 'Cancel', event: 'closeSettings' }],
    });
  });

  it('says the board did not list its settings', () => {
    const view = viewFor({ kind: 'settings', chip: 'ESP8266', opened, flashed: true, noAnswer: true }, withSettings);

    expect(view.message).toBe('The board did not list its settings. Check that it runs Web relay, then send them again.');
    expect(view.notice).toBe(true);
  });

  it('offers no button while it reads the settings to reopen the form', () => {
    expect(viewFor({ kind: 'reading', chip: 'ESP8266' }, withSettings)).toEqual({
      step: 'running',
      message: "Reading the board's settings.",
    });
  });

  it('offers no button while it sends the settings', () => {
    expect(viewFor({ kind: 'applying', chip: 'ESP8266' }, withSettings)).toEqual({
      step: 'running',
      message: 'Sending the settings to the board.',
    });
  });

  it('offers Change settings once the board runs, but not once it is lost', () => {
    const running = { kind: 'running', chip: 'ESP8266', output: [] } as const;

    expect(viewFor(running, withSettings).actions).toEqual([
      { label: 'Change settings', event: 'changeSettings' },
      { label: 'Flash again', event: 'connect' },
      { label: 'Disconnect', event: 'disconnect' },
    ]);
    expect(viewFor({ ...running, lost: true }, withSettings).actions).toEqual([{ label: 'Connect again', event: 'connect' }]);
  });
});

describe('the card for the board the visitor picked', () => {
  const esp01s = boardModel('esp01s');
  const esp32 = boardModel('esp32');

  it('says to set the adapter to flash mode before plugging in an ESP-01S', () => {
    expect(viewFor({ kind: 'idle' }, { title: 'Blink', board: esp01s }).message).toBe(
      "Put the ESP-01S in its USB adapter and set the adapter's switch to PROG, the flash position, or put its jumper " +
        'on. Then plug the adapter in. This replaces whatever is on the board.',
    );
  });

  it('says how to make the picked board answer', () => {
    expect(viewFor({ kind: 'noAnswer' }, { title: 'Blink', board: esp01s }).message).toBe(
      "The board did not answer. Set the adapter's switch to PROG, the flash position, or put its jumper on. " +
        'Then unplug the adapter, plug the adapter back in and connect again.',
    );
    expect(viewFor({ kind: 'noAnswer' }, { title: 'Blink', board: esp32 }).message).toBe(
      'The board did not answer. Hold its BOOT button and connect again.',
    );
    expect(viewFor({ kind: 'noAnswer' }, { title: 'Blink' }).message).toBe(wording.NO_ANSWER);
  });

  it('says how to get the board out of flash mode after the write', () => {
    expect(viewFor({ kind: 'flashMode', chip: 'ESP8266' }, { title: 'Blink' })).toEqual({
      step: 'flash',
      message: wording.FLASH_MODE,
      notice: true,
      actions: [{ label: 'Connect again', event: 'connect' }],
    });
  });
});
