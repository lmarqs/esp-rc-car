import { expect, test } from '@playwright/test';

test('the home page links to Robomania', async ({ page }) => {
  await page.goto('/robomania/');

  await expect(page.getByRole('link', { name: 'Robomania', exact: true })).toBeVisible();
});
