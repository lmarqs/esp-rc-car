import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/components/flash/view';

const context = { title: 'Blink' };

describe('viewFor', () => {
  it('asks to connect while idle', () => {
    expect(viewFor({ kind: 'idle' }, context)).toEqual({
      step: 'connect',
      message: 'Plug the board in over USB. This replaces whatever is on the board.',
      action: { label: 'Connect board', event: 'connect' },
    });
  });

  it('offers no button while connecting', () => {
    expect(viewFor({ kind: 'connecting' }, context).action).toBeUndefined();
  });

  it('shows the chip and the percentage while flashing, with no button', () => {
    const view = viewFor({ kind: 'flashing', chip: 'ESP32', pct: 42 }, context);

    expect(view).toEqual({ step: 'flash', message: 'Found ESP32', progress: 42 });
  });

  it('says the board runs, then what to do next', () => {
    const view = viewFor({ kind: 'running', chip: 'ESP32' }, { title: 'Blink', next: 'Open the monitor.' });

    expect(view.step).toBe('running');
    expect(view.message).toBe('Your board is running Blink. Open the monitor.');
  });

  it('says only that the board runs when the project has no next step', () => {
    expect(viewFor({ kind: 'running', chip: 'ESP32' }, context).message).toBe('Your board is running Blink.');
  });

  it.each([
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
  ] as const)('shows %j as a notice whose button connects again', (state, message, label) => {
    expect(viewFor(state, context)).toEqual({
      step: 'connect',
      message,
      notice: true,
      action: { label, event: 'connect' },
    });
  });

  it('links the images and the build-it-yourself section where the browser cannot flash', () => {
    const images = [
      {
        profile: 'esp32',
        chipFamily: 'ESP32',
        parts: [
          { path: 'blink/esp32/blink.ino.bootloader.bin', offset: 4096 },
          { path: 'blink/esp32/blink.ino.bin', offset: 65536 },
        ],
      },
    ] as const;
    const view = viewFor({ kind: 'unsupported' }, { ...context, images, firmwareUrl: '/robomania/firmware/' });

    expect(view.message).toBe('This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.');
    expect(view.action).toBeUndefined();
    expect(view.links).toEqual([
      { label: 'esp32: blink.ino.bootloader.bin', href: '/robomania/firmware/blink/esp32/blink.ino.bootloader.bin' },
      { label: 'esp32: blink.ino.bin', href: '/robomania/firmware/blink/esp32/blink.ino.bin' },
      { label: 'Run it on your board', href: '#run-it-on-your-board' },
    ]);
  });
});
