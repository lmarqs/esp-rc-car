import type { Page } from '@playwright/test';
import { expect, test } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const status = (page: Page) => bench(page).locator('[data-board-word]');
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
    await bench(page).locator('[data-board-action]').click();
    await expect(status(page)).toHaveText('Live');

    await nav(page).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL('/robomania/projects/');
    await page.getByRole('main').getByRole('link', { name: /Blink/ }).click();

    await expect(status(page)).toHaveText('Live');
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

    await expect(dock(page).getByRole('link', { name: 'Blink · step 2' })).toHaveAttribute('href', '/robomania/projects/blink/');
    await expect(dock(page)).toContainText('ESP32');
    await expect(dock(page).locator('[data-dock-last]')).toHaveText('wait 1000');
    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeHidden();
    // The dock restarts the board into what it holds, read at the speed every ladder step prints at.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
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
    await bench(page).locator('[data-board-action]').click();
    await expect(status(page)).toHaveText('Live');
    await nav(page).getByRole('link', { name: 'Learn' }).click();

    await dock(page).getByRole('button', { name: 'Flash again' }).click();

    await expect(dock(page)).toContainText('Writing Blink · step 1');
    await expect(dock(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await fakeFlasher.release();
    await expect(dock(page).getByRole('link', { name: 'Blink · step 1' })).toBeVisible();
    expect(await fakeFlasher.loaded()).toEqual([['blink/simple/esp32/simple.ino.bootloader.bin', 'blink/simple/esp32/simple.ino.bin']]);
  });

  test('lets the board go on Disconnect, and offers to connect again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('link', { name: 'Blink · step 2' })).toBeVisible();

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
});
