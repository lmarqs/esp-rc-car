import type { Page } from '@playwright/test';
import { expect, test } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const status = (page: Page) => bench(page).locator('[data-board-word]');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

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
    await page.getByRole('link', { name: /Blink/ }).click();

    await expect(status(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });
});
