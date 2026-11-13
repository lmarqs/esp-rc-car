import type { Page } from '@playwright/test';
import { expect, test } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
/** The word on the board pane's frame, which names what the pane shows. */
const tagWord = (page: Page) => bench(page).locator('[data-tag-word]');

/** Opens the workbench's My board view and connects the board from it. */
async function connect(page: Page) {
  await bench(page).locator('[data-pane-board]').click();
  await bench(page).locator('[data-board-action]').click();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const dock = (page: Page) => page.getByRole('complementary', { name: 'Your board' });
const monitor = (page: Page) => dock(page).getByRole('log', { name: 'Board output' });

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

  test('flashes the sketch the board runs again from another page, showing the progress', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], progress: [40], hold: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');
    await nav(page).getByRole('link', { name: 'Learn' }).click();

    await dock(page).getByRole('button', { name: 'Flash again' }).click();

    await expect(dock(page)).toContainText('ESP32 is writing Blink · 1 simple');
    await expect(dock(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await fakeFlasher.release();
    await expect(dock(page).getByRole('link', { name: 'Blink · 1 simple' })).toBeVisible();
    expect(await fakeFlasher.loaded()).toEqual([['blink/simple/esp32/simple.ino.bootloader.bin', 'blink/simple/esp32/simple.ino.bin']]);
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

  test('follows the chip that answers, and says so when it is not the picked one', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP32-C3' });

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp32');
    await expect(dock(page).getByRole('status')).toHaveText(
      'You picked an ESP32-C3, but the board that answered is an ESP32. The site now gives the steps for an ESP32 dev board.',
    );
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

  test('drops the note once the board that answered is disconnected', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP32-C3' });
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('status')).toBeVisible();

    await dock(page).getByRole('button', { name: 'Disconnect' }).click();

    await expect(dock(page).getByRole('status')).toBeHidden();
  });

  test('takes the board from the chip that answers when none was picked', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP8266', lines: ['sketch web-relay'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp01s');
    await expect(dock(page).getByRole('status')).toBeHidden();
  });
});
