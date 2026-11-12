import { expect, test } from './fake-flasher';

const card = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Put it on your board' });

test.describe('a flashable project', () => {
  test('shows the Connect step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/blink/');

    await expect(card(page).getByText('Plug the board in over USB. This replaces whatever is on the board.')).toBeVisible();
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(card(page).getByRole('listitem')).toHaveText(['Connect', 'Flash', 'Running']);
  });

  test('flashes the board and ends on the Running step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', progress: [40], hold: true });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('Found ESP32')).toBeVisible();
    await expect(card(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    await expect(card(page).getByText('40%')).toBeVisible();
    await expect(card(page).locator('[aria-current="step"]')).toHaveText('Flash');

    await fakeFlasher.release();

    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();
    await expect(card(page).locator('[aria-current="step"]')).toHaveText('Running');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset']);
  });

  test('offers no second flash while one is under way', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('40%')).toBeVisible();
    await expect(card(page).getByRole('button')).toHaveCount(0);

    await fakeFlasher.release();
    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();
    expect((await fakeFlasher.calls()).filter((call) => call === 'connect')).toHaveLength(1);
  });

  test('announces "Found" once, however many percentages follow', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [20, 40, 60], hold: true });
    await page.goto('/robomania/projects/blink/');
    await page.evaluate(() => {
      const added: string[] = [];
      (window as unknown as { __messages: string[] }).__messages = added;
      new MutationObserver((records) => {
        for (const record of records) record.addedNodes.forEach((node) => added.push(node.textContent ?? ''));
      }).observe(document.querySelector('[data-message]')!, { childList: true });
    });

    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('60%')).toBeVisible();
    await fakeFlasher.release();
    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();

    const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages);
    expect(messages.filter((message) => message === 'Found ESP32')).toHaveLength(1);
  });

  test('moves the focus to the status when the focused button goes away', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).focus();
    await page.keyboard.press('Enter');

    await expect(card(page).getByText('40%')).toBeVisible();
    await expect(card(page).locator('[data-message]')).toBeFocused();
    await fakeFlasher.release();
  });
})

test.describe('a failure', () => {
  const RUNNING = 'Your board is running Blink.';
  const connectCalls = ['connect', 'disconnect', 'connect', 'load', 'write', 'reset'];

  test('noPort: asks to plug the board in, and the button connects again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ failFirst: { connect: 'NotFoundError' } });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText('No board was chosen. Plug it in and try again.');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(connectCalls);
  });

  test('portBusy: names the programs that hold the port, and the button connects again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ failFirst: { connect: 'InvalidStateError' } });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText(
      'Another program is using the board. Close the serial monitor or the Arduino IDE, then connect again.',
    );
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(connectCalls);
  });

  test('noAnswer: tells how to reach the bootloader, and the button connects again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ failFirst: { connect: 'Error' } });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText(
      'The board did not answer. Hold its BOOT button and connect again. On an ESP-01S, set the USB adapter to flash mode first.',
    );
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(connectCalls);
  });

  test('noImage: names the chip and the chips the project has, and the button connects another board', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: ['ESP8266', 'ESP32'] });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText('This board is an ESP8266. Blink has images for: ESP32.');
    await card(page).getByRole('button', { name: 'Connect another board' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'disconnect', 'connect', 'load', 'write', 'reset']);
  });

  test('noDownload: blames the connection, and the button connects again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ failFirst: { load: 'DownloadError' } });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText(
      'The image did not download. Check your internet connection and try again.',
    );
    await card(page).getByRole('button', { name: 'Flash again' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'disconnect', 'connect', 'load', 'write', 'reset']);
  });

  test('dropped: says how far the flashing got, and the button flashes again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], failFirst: { write: 'NetworkError' } });
    await page.goto('/robomania/projects/blink/');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('.notice')).toHaveText(
      'The connection dropped at 40%. Nothing is broken. Plug the board back in and flash again.',
    );
    await card(page).getByRole('button', { name: 'Flash again' }).click();
    await expect(card(page).getByText(RUNNING)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'disconnect', 'connect', 'load', 'write', 'reset']);
  });

  test('unsupported: shows at page load with links to the images and to the build-it-yourself section', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serial?: unknown }).serial;
    });
    await page.goto('/robomania/projects/blink/');

    await expect(card(page).locator('.notice')).toHaveText(
      'This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.',
    );
    await expect(card(page).getByRole('button')).toHaveCount(0);
    await expect(card(page).getByRole('link')).toHaveText([
      'esp32: blink.ino.bootloader.bin',
      'esp32: blink.ino.bin',
      'Run it on your board',
    ]);
    const hrefs = await card(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(hrefs).toEqual([
      '/robomania/firmware/blink/esp32/blink.ino.bootloader.bin',
      '/robomania/firmware/blink/esp32/blink.ino.bin',
      '#run-it-on-your-board',
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
