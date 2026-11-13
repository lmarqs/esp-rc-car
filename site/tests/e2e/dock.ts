import type { Page } from '@playwright/test';
import { expect } from './fake-flasher';

/** The board dock at the bottom of every page. */
export const dock = (page: Page) => page.getByRole('complementary', { name: 'Your board' });

/** The dock's one button for the board: in its panel while the panel is open, else in its bar. */
export const dockAction = (page: Page) => dock(page).locator('[data-dock-action]:visible');

/**
 * Connects the board without flashing it, as a visitor does from a page with no sketch open: from the Learn page's
 * dock, which only restarts and reads the board. Then goes back to the page, where the site keeps the board connected.
 */
export async function plugIn(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn' }).click();
  await expect(page).toHaveURL(/\/learn\/$/);
  await dock(page).getByRole('button', { name: 'Connect board' }).click();
  await expect(dock(page)).toContainText('is running');
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Workbench' })).toBeVisible();
}
