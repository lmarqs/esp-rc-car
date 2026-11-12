import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/components/flash/view';

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

    expect(view).toEqual({ step: 'flash', message: 'Found ESP32', progress: 42 });
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

    it('offers Flash again, which retries, and Disconnect', () => {
      expect(viewFor(running, context).actions).toEqual([
        { label: 'Flash again', event: 'retry' },
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
      actions: [{ label, event: 'connect' }],
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
    expect(view.actions).toBeUndefined();
    expect(view.links).toEqual([
      { label: 'esp32: blink.ino.bootloader.bin', href: '/robomania/firmware/blink/esp32/blink.ino.bootloader.bin' },
      { label: 'esp32: blink.ino.bin', href: '/robomania/firmware/blink/esp32/blink.ino.bin' },
      { label: 'Run it on your board', href: '#run-it-on-your-board' },
    ]);
  });
});
