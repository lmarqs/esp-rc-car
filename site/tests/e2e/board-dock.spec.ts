import type { Page } from '@playwright/test';
import { plugIn } from './dock';
import { expect, test } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
/** The word on the board pane's frame, which names what the pane shows. */
const tagWord = (page: Page) => bench(page).locator('[data-tag-word]');

/** Connects the board without flashing it, then opens the workbench's My board. */
async function connect(page: Page) {
  await plugIn(page);
  await bench(page).locator('[data-pane-board]').click();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const dock = (page: Page) => page.getByRole('complementary', { name: 'Your board' });
const monitor = (page: Page) => dock(page).getByRole('log', { name: 'Board output' });
/** The dock's panel: the computer, the cable and the chip, the board's button and what is happening. */
const panel = (page: Page) => dock(page).locator('[data-dock-panel]');
const panelMessage = (page: Page) => panel(page).locator('[data-dock-message]');
/** The bar under the panel. */
const bar = (page: Page) => dock(page).locator('.bar');

test.describe('the board, from page to page', () => {
  test('stays connected while the visitor reads another page, and the workbench follows it again on return', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await nav(page).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL('/robomania/projects/');
    await page.getByRole('main').getByRole('link', { name: /Blink/ }).click();

    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });
});

test.describe('the board dock', () => {
  test('offers to connect a board on any page, then names its chip and the sketch it runs, linked to its project', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'wait 1000'] });
    await page.goto('/robomania/learn/');
    await expect(dock(page)).toContainText('No board');

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page).getByRole('link', { name: 'Blink · 2 input' })).toHaveAttribute('href', '/robomania/projects/blink/#input');
    await expect(dock(page)).toContainText('ESP32 is running Blink · 2 input');
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAccessibleDescription('wait 1000');
    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeHidden();
    // The dock restarts the board into what it holds, read at the speed every ladder step prints at.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await dock(page).getByRole('link', { name: 'Blink · 2 input' }).click();
    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
  });

  test('links to the step the board runs, which opens on My board, Live', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await dock(page).getByRole('link', { name: 'Blink · 2 input' }).click();

    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).locator('[data-pane-board]')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('opens on My board, Live, at an address that names the step the board runs', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page)).toContainText('Blink · 2 input');

    // A link anywhere on the site, which the router follows as the dock's.
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/robomania/projects/blink/#input';
      link.textContent = 'Blink, input';
      document.querySelector('main')!.append(link);
    });
    await page.getByRole('link', { name: 'Blink, input' }).click();

    await expect(page).toHaveURL('/robomania/projects/blink/#input');
    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).locator('[data-pane-board]')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagWord(page)).toHaveText('Live');
  });

  test('opens a serial monitor with what the board printed, and sends it a line', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH', 'LOW'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).locator('[data-dock-last]')).toHaveText('LOW');

    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAttribute('aria-expanded', 'true');
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');
    await expect(dock(page).getByRole('textbox', { name: 'Line to send to the board' })).toBeFocused();

    await page.keyboard.type('500');
    await page.keyboard.press('Enter');

    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW\n› 500');
    expect(await fakeFlasher.calls()).toContain('send 500');
    await fakeFlasher.print('wait 500');
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW\n› 500\nwait 500');
  });

  test('clears the serial monitor and goes on showing what the board prints next', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH', 'LOW'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');

    await dock(page).getByRole('button', { name: 'Clear' }).click();

    await expect(monitor(page)).toHaveText('');
    await expect(dock(page)).toContainText('ESP32 is running Blink · 2 input');
    await fakeFlasher.print('HIGH');
    await expect(monitor(page)).toHaveText('HIGH');
  });

  test('says the open Serial button hides the output, and closes the monitor on Close with the focus back on Serial', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    const serial = dock(page).getByRole('button', { name: 'Serial' });
    await expect(serial).toContainText('HIGH');

    await serial.click();
    await expect(serial).toContainText('Hide output');
    await expect(serial.locator('[data-dock-last]')).toBeHidden();
    await dock(page).getByRole('button', { name: 'Close' }).click();

    await expect(monitor(page)).toBeHidden();
    await expect(serial).toHaveAttribute('aria-expanded', 'false');
    await expect(serial).toBeFocused();
    await expect(serial).toContainText('HIGH');
  });

  test('keeps the monitor open and its lines as the visitor moves to another page', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH');

    await nav(page).getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL('/robomania/library/');
    await fakeFlasher.print('LOW');

    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');
  });

  test('flashes the sketch the visitor has open, named on its button, and offers none where no sketch is open', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');
    await expect(dock(page).getByRole('button', { name: 'Flash Blink · 1 simple' })).toBeVisible();

    await bench(page).getByRole('tab', { name: /^2 input/ }).click();
    await dock(page).getByRole('button', { name: 'Flash Blink · 2 input' }).click();

    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.loaded()).toEqual([['blink/input/esp32/input.ino.bootloader.bin', 'blink/input/esp32/input.ino.bin']]);
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page).toHaveURL(/\/learn\/$/);
    await expect(dock(page).getByRole('button', { name: /^Flash/ })).toBeHidden();
  });

  test('lets the board go on Disconnect, and offers to connect again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('link', { name: 'Blink · 2 input' })).toBeVisible();

    await dock(page).getByRole('button', { name: 'Disconnect' }).click();

    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(dock(page)).toContainText('No board');
    expect((await fakeFlasher.calls()).at(-1)).toBe('disconnect');
  });

  test('stays at the bottom of the window, over no part of the page at its end', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/robomania/learn/');

    const box = (await dock(page).boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(640);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = (await page.locator('.site-footer').boundingBox())!;
    const end = (await dock(page).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(end.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  test('keeps the Serial button in place and the same width as lines arrive and buttons come and go', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    const serial = dock(page).getByRole('button', { name: 'Serial' });
    const before = (await serial.boundingBox())!;

    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await fakeFlasher.print('distance=182 cm left=0.42 right=0.40 heading=271 battery=7.4V and more besides');
    await expect(serial).toHaveAccessibleDescription(/^distance=182/);

    const after = (await serial.boundingBox())!;
    expect([after.x, after.width]).toEqual([before.x, before.width]);
  });
});

test.describe('the board dock panel', () => {
  test('opens with the progress while it flashes the open sketch, then folds away with Disconnect in the bar', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
    await page.goto(BLINK);
    await expect(panel(page)).toBeHidden();
    const serial = bar(page).getByRole('button', { name: 'Serial' });
    const before = (await serial.boundingBox())!;

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panel(page)).toBeVisible();
    expect(await serial.boundingBox()).toEqual(before);
    await expect(panel(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await expect(panelMessage(page)).toHaveText('Found ESP32. Keep the board plugged in.');
    const busy = panel(page).locator('[data-dock-action]');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');
    await expect(busy).toBeFocused();
    await expect(bar(page).locator('[data-dock-action]')).toBeHidden();

    await fakeFlasher.release();

    await expect(panel(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' })).toBeFocused();
    await expect(dock(page)).toContainText('ESP32 is running Blink · 1 simple');
    expect(await serial.boundingBox()).toEqual(before);
    expect(await fakeFlasher.loaded()).toEqual([['blink/simple/esp32/simple.ino.bootloader.bin', 'blink/simple/esp32/simple.ino.bin']]);
  });

  test('tries a dropped flash again in one press: it connects, then flashes the open sketch', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, failFirst: { write: 'NetworkError' } });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panelMessage(page)).toContainText('The connection dropped');
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toBeVisible();

    await panel(page).getByRole('button', { name: 'Try again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(dock(page)).toContainText('ESP32 is running Blink · 1 simple');
    expect((await fakeFlasher.calls()).filter((call) => call === 'write')).toHaveLength(2);
  });

  test('says the board is still in flash mode after the write, and Connect again reads it as it runs', async ({
    page,
    fakeFlasher,
  }) => {
    // An ESP8266 that prints nothing after the write is still in flash mode.
    await fakeFlasher.install({ chip: 'ESP8266' });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panel(page).getByRole('button', { name: 'Connect again' })).toBeVisible({ timeout: 10_000 });
    await expect(panelMessage(page)).toContainText('UART');
    await expect(panel(page).locator('[data-hand-hint]')).toHaveAttribute('data-hint', 'uart');

    await panel(page).getByRole('button', { name: 'Connect again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    expect((await fakeFlasher.calls()).at(-2)).toBe('attach');
  });

  test('draws the switch to PROG beside the words when a picked ESP-01S does not answer', async ({ page, fakeFlasher }) => {
    // esptool-js failing to sync with the bootloader throws a plain error.
    await fakeFlasher.install({ lines: ['led on'], failFirst: { connect: 'Error' } });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('combobox', { name: 'My board' }).selectOption({ label: 'ESP-01S' });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panelMessage(page)).toContainText("Set the adapter's switch to PROG");
    await expect(panel(page).locator('[data-hand-hint]')).toHaveAttribute('data-hint', 'prog');
    await expect(panel(page).locator('[data-hand-hint]')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('tries a failed connect again in one press, which connects and flashes the open sketch', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ announce: true, failFirst: { connect: 'NotFoundError' } });
    await page.goto(BLINK);
    await bench(page).locator('[data-pane-board]').click();

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panelMessage(page)).toHaveText('No board was chosen. Plug it in and try again.');
    await expect(panelMessage(page)).toHaveAttribute('data-notice');

    await panel(page).getByRole('button', { name: 'Try again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(tagWord(page)).toHaveText('Live');
    expect((await fakeFlasher.calls()).filter((call) => call === 'load')).toHaveLength(1);
  });

  test('says the board stopped talking once the port is lost, and offers Connect again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ announce: true, monitorEnds: true });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();

    await expect(panelMessage(page)).toHaveText('The board stopped talking to the page. Plug it back in and connect again.');
    await expect(panel(page).getByRole('button', { name: 'Connect again' })).toBeVisible();
  });

  test('names the chips the open sketch has images for when the board has none, until another step is opened', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP32-C3', lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await bench(page).getByRole('tab', { name: /^2 input/ }).click();

    await dock(page).getByRole('button', { name: 'Flash Blink · 2 input' }).click();

    await expect(panelMessage(page)).toHaveText(
      'This board is an ESP32-C3. blink/input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await bench(page).getByRole('tab', { name: /^3 timer/ }).click();

    await expect(panel(page)).toBeHidden();
  });

  test('connects without flashing on a page with no sketch open, whatever the last page opened', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto(BLINK);
    await expect(bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' })).toBeVisible();
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page).toHaveURL(/\/learn\/$/);

    await bar(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page)).toContainText('ESP32 is running Blink · 2 input');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  for (const width of [860, 1280]) {
    test(`keeps the action, Disconnect and Serial in place on one row at ${width} px as it flashes and runs`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
      await page.setViewportSize({ width, height: 700 });
      await page.goto(BLINK);
      const picker = dock(page).getByRole('combobox', { name: 'My board' });
      /** Where the bar's controls sit, shown or keeping their room, and whether each is on the picker's row. */
      const controls = async () => {
        const row = (await picker.boundingBox())!;
        const boxes = await Promise.all(
          ['[data-dock-action="bar"]', '[data-dock-disconnect]', '[data-dock-serial]'].map((selector) =>
            bar(page)
              .locator(selector)
              .evaluate((element) => {
                const { x, y, width } = element.getBoundingClientRect();
                return { x, y, width };
              }),
          ),
        );
        for (const box of boxes) expect(box.y).toBeLessThan(row.y + row.height);
        return boxes;
      };
      const idle = await controls();

      await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();
      await expect(panel(page)).toBeVisible();
      await expect(bar(page).getByRole('progressbar', { name: 'Flashing' })).toBeVisible();
      expect(await controls()).toEqual(idle);

      await fakeFlasher.release();
      await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await expect(bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' })).toBeVisible();
      await dock(page).screenshot({ path: test.info().outputPath('dock.png') });
      expect(await controls()).toEqual(idle);
    });
  }

  for (const width of [560, 561, 700, 839]) {
    test(`keeps the status in view, the page from scrolling sideways and the controls in place at ${width} px`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
      await page.setViewportSize({ width, height: 700 });
      await page.goto(BLINK);
      /** Where the bar's controls sit, shown or keeping their room, after checking the status and the page's width. */
      const controls = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect((await bar(page).locator('[data-dock-status]').boundingBox())!.width).toBeGreaterThan(0);
        return Promise.all(
          ['[data-dock-action="bar"]', '[data-dock-disconnect]', '[data-dock-serial]'].map((selector) =>
            bar(page)
              .locator(selector)
              .evaluate((element) => {
                const { x, y, width } = element.getBoundingClientRect();
                return { x, y, width };
              }),
          ),
        );
      };
      const idle = await controls();

      await bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' }).click();
      await expect(bar(page).getByRole('progressbar', { name: 'Flashing' })).toBeVisible();
      expect(await controls()).toEqual(idle);

      await fakeFlasher.release();
      await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
      expect(await controls()).toEqual(idle);
    });
  }

  test('shows the whole name of a sketch its bar button cuts on hover', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await expect(bar(page).getByRole('button', { name: 'Flash Blink · 1 simple' })).toHaveAttribute(
      'title',
      'Flash Blink · 1 simple',
    );
  });
});

test.describe('the board pick', () => {
  const pick = (page: Page) => dock(page).getByRole('combobox', { name: 'My board' });

  test('is kept from page to page and from visit to visit', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/learn/');
    await expect(pick(page)).toHaveValue('');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await nav(page).getByRole('link', { name: 'Projects' }).click();
    await expect(pick(page)).toHaveValue('esp01s');
    await page.reload();
    await expect(pick(page)).toHaveValue('esp01s');
  });

  test('follows the chip that answers without a word when it is not the picked one', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP32-C3' });

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp32');
    await expect(dock(page).getByRole('status')).toHaveCount(0);
  });

  test('reads a picked ESP-01S as it runs, without asking for flash mode', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['led on'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(dock(page)).toContainText('ESP8266');
    expect(await fakeFlasher.calls()).toEqual(['attach', 'monitor 115200']);
  });

  test('keeps the bar on one row when the picked board needs its adapter set', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 700 });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await expect(dock(page)).toContainText('set to PROG');
    await dock(page).screenshot({ path: test.info().outputPath('dock.png') });
    const picker = await pick(page).boundingBox();
    const connect = await dock(page).getByRole('button', { name: 'Connect board' }).boundingBox();
    const serial = await dock(page).getByRole('button', { name: 'Serial' }).boundingBox();
    for (const button of [connect, serial]) {
      expect(button!.y).toBeLessThan(picker!.y + picker!.height);
    }
  });

  test('takes the board from the chip that answers when none was picked', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP8266', lines: ['sketch web-relay'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp01s');
  });
});
