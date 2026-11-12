import { expect, test, type Page } from '@playwright/test';

/** Marks the document, so a test can tell a page swapped in place from a page loaded afresh, which loses the mark. */
async function mark(page: Page) {
  await page.evaluate(() => Object.assign(window, { __sameDocument: true }));
}

async function sameDocument(page: Page) {
  return page.evaluate(() => (window as { __sameDocument?: boolean }).__sameDocument === true);
}

test.describe('moving between pages', () => {
  test('swaps the page in place, so the document and what it holds stay', async ({ page }) => {
    await page.goto('/robomania/');
    await mark(page);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();

    await expect(page).toHaveURL('/robomania/projects/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projects');
    expect(await sameDocument(page)).toBe(true);
  });

  test('runs the level filter on a page reached by a link', async ({ page }) => {
    await page.goto('/robomania/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL('/robomania/projects/');

    await page.getByRole('group', { name: 'Filter by level' }).getByRole('button', { name: 'Advanced' }).click();

    await expect(page.locator('[data-level-item="beginner"]').first()).toHaveAttribute('hidden', '');
  });

  test('runs the workbench on a project page reached by a link, and again after leaving and coming back', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/robomania/projects/');
    await mark(page);

    await page.getByRole('link', { name: /Blink/ }).click();
    const bench = page.getByRole('region', { name: 'Workbench' });
    await bench.getByRole('tab', { name: /2/ }).click();
    await expect(bench.getByRole('tab', { name: /2/ })).toHaveAttribute('aria-selected', 'true');

    await page.goBack();
    await expect(page).toHaveURL('/robomania/projects/');
    await page.getByRole('link', { name: /Blink/ }).click();
    await bench.getByRole('tab', { name: /3/ }).click();

    await expect(bench.getByRole('tab', { name: /3/ })).toHaveAttribute('aria-selected', 'true');
    expect(await sameDocument(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});
