import type { Page } from '@playwright/test';
import { dock, dockAction, dockMessage, dockPanel } from './dock';
import { expect, test, type FakeFlasherOptions } from './fake-flasher';

const card = (page: Page) => page.getByRole('region', { name: 'Put it on your board' });
const message = (page: Page) => card(page).locator('[data-message]');
const TO_THE_BAR = 'Connect and flash it from the board bar below.';
const NEXT = 'Pair a Bluetooth gamepad: the LED on GPIO 2 blinks once a second until one connects, then stays lit.';
const RUNNING = `Your board is running Omnidirectional robot. ${NEXT}`;
const FLASH = 'Flash Omnidirectional robot';

/** Starts recording what the card's status announces: each text it is given. */
async function recordAnnouncements(page: Page) {
  await page.evaluate(() => {
    const added: string[] = [];
    (window as unknown as { __messages: string[] }).__messages = added;
    new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => added.push(node.textContent ?? ''));
    }).observe(document.querySelector('[data-message]')!, { childList: true });
  });
}

const announcements = (page: Page) => page.evaluate(() => (window as unknown as { __messages: string[] }).__messages);

test.describe('a flashable project', () => {
  test('points at the board bar, whose button flashes the project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/#omnidirectional');

    await expect(message(page)).toHaveText(TO_THE_BAR);
    await expect(card(page).getByRole('button')).toHaveCount(0);
    await expect(card(page).getByRole('listitem')).toHaveCount(0);
    await expect(dockAction(page)).toHaveAccessibleName(FLASH);
  });

  test('is flashed from the dock, which shows the progress, and then says the board runs it', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP32', progress: [40], hold: true });
    await page.goto('/robomania/flash/#omnidirectional');

    await dockAction(page).click();

    await expect(dockPanel(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await expect(dockMessage(page)).toHaveText('Found ESP32. Keep the board plugged in.');
    await expect(message(page)).toHaveText(TO_THE_BAR);
    await expect(card(page).getByRole('button')).toHaveCount(0);

    await fakeFlasher.release();

    await expect(message(page)).toHaveText(RUNNING);
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset', 'monitor 115200']);
  });

  test('announces only that the board runs it, however many percentages the flash goes through', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ progress: [20, 40, 60], hold: true });
    await page.goto('/robomania/flash/#omnidirectional');
    await expect(message(page)).toHaveText(TO_THE_BAR);
    await recordAnnouncements(page);

    await dockAction(page).click();
    await expect(dockPanel(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '60');
    await fakeFlasher.release();
    await expect(message(page)).toHaveText(RUNNING);

    expect(await announcements(page)).toEqual([RUNNING]);
  });
});

test.describe('the Running step', () => {
  test('says the board runs the project and what to do next, and leaves its lines to the serial monitor', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['gamepad 0', 'gamepad 1', 'gamepad 2'] });
    await page.goto('/robomania/flash/#omnidirectional');

    await dockAction(page).click();

    await expect(message(page)).toHaveText(RUNNING);
    await expect(card(page).locator('pre')).toHaveCount(0);
    await expect(card(page).getByRole('button')).toHaveCount(0);
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAccessibleDescription('gamepad 2');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset', 'monitor 115200']);
  });

  test('points at the board bar again once the dock lets the board go', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto('/robomania/flash/#omnidirectional');
    await dockAction(page).click();
    await expect(message(page)).toHaveText(RUNNING);

    await dock(page).getByRole('button', { name: 'Disconnect' }).click();

    await expect(message(page)).toHaveText(TO_THE_BAR);
    await expect(dockAction(page)).toHaveAccessibleName(FLASH);
    expect((await fakeFlasher.calls()).at(-1)).toBe('disconnect');
  });

  test('points at the board bar when the port is lost, and the dock connects again without flashing', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch omnidirectional', 'HIGH'], monitorEnds: true });
    await page.goto('/robomania/flash/#omnidirectional');

    await dockAction(page).click();

    await expect(dockMessage(page)).toHaveText('The board stopped talking to the page. Plug it back in and connect again.');
    await expect(message(page)).toHaveText(TO_THE_BAR);
    await expect(message(page)).not.toHaveClass('notice');

    await dockPanel(page).getByRole('button', { name: 'Connect again' }).click();

    // The board restarts into what it holds and is read: only the dock's Flash writes it.
    await expect(dock(page)).toContainText('ESP32 is running Omnidirectional robot');
    await expect(message(page)).toHaveText(RUNNING);
    expect(await fakeFlasher.calls()).toEqual([
      'connect', 'load', 'write', 'reset', 'monitor 115200',
      'disconnect',
      'connect', 'monitor 115200',
    ]);
  });

  test('a sketch with no baud rate starts no monitor', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['never read'] });
    await page.route('**/flash/', async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/(data-sketch="omnidirectional"[^>]*?) data-baud="\d+"/, '$1');
      await route.fulfill({ response, body: html });
    });
    await page.goto('/robomania/flash/#omnidirectional');

    await dockAction(page).click();

    await expect(message(page)).toHaveText(RUNNING);
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset']);
  });
});

test.describe('a failure', () => {
  const flashed = ['connect', 'load', 'write', 'reset', 'monitor 115200'];
  const failures: { name: string; install: FakeFlasherOptions; said: string | RegExp; button: string; calls: string[] }[] = [
    {
      name: 'noPort',
      install: { failFirst: { connect: 'NotFoundError' } },
      said: 'No board was chosen. Plug it in and try again.',
      button: 'Try again',
      calls: ['connect', 'disconnect', ...flashed],
    },
    {
      name: 'portBusy',
      install: { failFirst: { connect: 'InvalidStateError' } },
      said: 'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.',
      button: 'Try again',
      calls: ['connect', 'disconnect', ...flashed],
    },
    {
      name: 'noAnswer',
      install: { failFirst: { connect: 'Error' } },
      said: /^The board did not answer\./,
      button: 'Try again',
      calls: ['connect', 'disconnect', ...flashed],
    },
    {
      // Connect board reads the board as it runs, and writes nothing: the pick followed the ESP8266 that answered,
      // an ESP-01S, which is read without its bootloader.
      name: 'noImage',
      install: { chip: ['ESP8266', 'ESP32'], lines: ['sketch omnidirectional'] },
      said: 'This board is an ESP8266. Omnidirectional robot has images for: ESP32. Connect an ESP32.',
      button: 'Connect board',
      calls: ['connect', 'disconnect', 'attach', 'monitor 115200'],
    },
    {
      name: 'noDownload',
      install: { failFirst: { load: 'DownloadError' } },
      said: 'The image did not download. Check your internet connection. Then press Try again.',
      button: 'Try again',
      calls: ['connect', 'load', 'disconnect', ...flashed],
    },
    {
      name: 'dropped',
      install: { progress: [40], failFirst: { write: 'NetworkError' } },
      said: 'The connection dropped at 40%. Nothing is broken. Plug the board back in. Then press Try again.',
      button: 'Try again',
      calls: ['connect', 'load', 'write', 'disconnect', ...flashed],
    },
  ];

  for (const { name, install, said, button, calls } of failures) {
    test(`${name}: the dock says what went wrong and goes on at its next press, while the card points at it`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install(install);
      await page.goto('/robomania/flash/#omnidirectional');

      await dockAction(page).click();

      await expect(dockMessage(page)).toHaveText(said);
      await expect(message(page)).toHaveText(TO_THE_BAR);
      await expect(card(page).getByRole('button')).toHaveCount(0);
      await dockPanel(page).getByRole('button', { name: button }).click();
      await expect(message(page)).toHaveText(RUNNING);
      expect(await fakeFlasher.calls()).toEqual(calls);
    });
  }

  test('unsupported: shows at page load with links to the images and to the build-it-yourself section', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serial?: unknown }).serial;
    });
    await page.goto('/robomania/flash/#omnidirectional');

    await expect(card(page).locator('.notice')).toHaveText(
      'This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.',
    );
    await expect(card(page).getByRole('button')).toHaveCount(0);
    await expect(card(page).getByRole('link')).toHaveText([
      'esp32: omnidirectional.ino.bootloader.bin at 0x1000',
      'esp32: omnidirectional.ino.bin at 0x10000',
      'Run it on your board',
    ]);
    const hrefs = await card(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(hrefs).toEqual([
      '/robomania/firmware/omnidirectional/esp32/omnidirectional.ino.bootloader.bin',
      '/robomania/firmware/omnidirectional/esp32/omnidirectional.ino.bin',
      '/robomania/projects/omnidirectional/#run-it-on-your-board',
    ]);
  });
});

test('a project whose sketch has no image points to its own instructions', async ({ page }) => {
  await page.goto('/robomania/projects/usb-key/');

  await expect(card(page).getByText('This board is flashed from your computer with the tools, not from the browser.')).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Run it on your board' })).toHaveAttribute('href', '#run-it-on-your-board');
  await expect(card(page).getByRole('button')).toHaveCount(0);
});

test('a project with no sketch has no card', async ({ page }) => {
  await page.goto('/robomania/projects/fpv-drone/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
