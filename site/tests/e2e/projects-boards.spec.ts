import type { Page } from '@playwright/test';
import { expect, test } from './fake-flasher';

const card = (page: Page, title: string) => page.getByRole('main').getByRole('link', { name: new RegExp(title) });
const pick = (page: Page) => page.getByRole('complementary', { name: 'Your board' }).getByRole('combobox', { name: 'My board' });

test.describe('the boards on the project cards', () => {
  test('names the boards a project runs on, then whether it runs on the picked one', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/');
    await expect(card(page, 'Blink').locator('[data-boards]')).toHaveText('Runs on ESP32 dev board and ESP-01S');

    await pick(page).selectOption({ label: 'ESP-01S' });

    await expect(card(page, 'Blink').locator('[data-boards]')).toHaveText('Runs on your ESP-01S');
    await expect(card(page, 'Servo').locator('[data-boards]')).toHaveText('Needs an ESP32 dev board');
  });
});
