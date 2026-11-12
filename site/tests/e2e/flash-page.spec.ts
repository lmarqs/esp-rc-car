import { expect, test } from './fake-flasher';

const pick = (page: import('@playwright/test').Page, title: 'Blink' | 'Servo') =>
  page.getByRole('list', { name: 'Projects you can flash' }).getByRole('button', { name: title, exact: true });
const heading = (page: import('@playwright/test').Page, title: 'Blink' | 'Servo') =>
  page.getByRole('heading', { level: 2, name: title });
const LOCKED = 'Finish or stop the current flash before picking another project.';
const card = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Put it on your board' });

test.describe('the Flash page', () => {
  test('is in the main navigation', async ({ page }) => {
    await page.goto('/robomania/');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Flash', exact: true }).click();

    await expect(page).toHaveURL('/robomania/flash/');
    await expect(page.getByRole('heading', { level: 1, name: 'Flash' })).toBeVisible();
  });

  test('lists the projects of the manifest with their chips and shows no card until one is picked', async ({ page }) => {
    await page.goto('/robomania/flash/');

    const projects = page.getByRole('list', { name: 'Projects you can flash' });
    await expect(projects.getByRole('button')).toHaveText(['Blink', 'Servo', 'Balance beam']);
    await expect(projects.getByRole('list', { name: 'Boards' })).toHaveText(['ESP32', 'ESP32', 'ESP32']);
    await expect(page.getByText(LOCKED)).toBeHidden();
    await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page)).toHaveCount(0);
  });

  test('picking blink shows its card and the link to its wiring', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Blink').click();

    await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveCount(1);
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wiring and details for Blink' })).toHaveAttribute(
      'href',
      '/robomania/projects/blink/',
    );
    await expect(page).toHaveURL('/robomania/flash/#blink');
  });

  test('picking another project swaps the card', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Blink').click();
    await pick(page, 'Servo').click();

    await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'false');
    await expect(pick(page, 'Servo')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Wiring and details for Servo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wiring and details for Blink' })).toBeHidden();
  });

  test('opens the project that the address names', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/#servo');

    await expect(pick(page, 'Servo')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('link', { name: 'Wiring and details for Servo' })).toBeVisible();
    await expect(card(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  });

  for (const hash of ['#nothing', '#omnidirectional', '#%']) {
    test(`selects nothing for the address ${hash}`, async ({ page }) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));

      await page.goto(`/robomania/flash/${hash}`);

      await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'false');
      await expect(pick(page, 'Servo')).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('moves the focus to the card when a project is picked with the keyboard', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Servo').focus();
    await page.keyboard.press('Enter');

    await expect(heading(page, 'Servo')).toBeFocused();
  });

  test('flashes the picked project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32' });
    await page.goto('/robomania/flash/#blink');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset', 'monitor 9600']);
  });

  test('cannot pick another project while a board is flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/flash/#blink');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('40%')).toBeVisible();
    await expect(pick(page, 'Servo')).toBeDisabled();
    await expect(pick(page, 'Blink')).toBeDisabled();
    await expect(page.getByText(LOCKED)).toBeVisible();

    await fakeFlasher.release();

    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();
    await expect(pick(page, 'Servo')).toBeEnabled();
    await expect(page.getByText(LOCKED)).toBeHidden();
  });

  test('cannot change the project through the address while a board is flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/flash/#blink');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('40%')).toBeVisible();

    await page.evaluate(() => (location.hash = '#servo'));

    await expect(page).toHaveURL('/robomania/flash/#blink');
    await expect(pick(page, 'Blink')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick(page, 'Servo')).toHaveAttribute('aria-pressed', 'false');
    await fakeFlasher.release();
    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();
  });

  test('lets go of a running board when another project is picked', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto('/robomania/flash/#blink');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('Your board is running Blink.')).toBeVisible();

    await pick(page, 'Servo').click();
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    expect((await fakeFlasher.calls()).at(-1)).toBe('disconnect');

    await pick(page, 'Blink').click();
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(card(page).getByText('Plug the board in over USB. This replaces whatever is on the board.')).toBeVisible();
  });

  test('lists the sketches outside the manifest as flashed from the computer, and leaves out a project with no sketch', async ({
    page,
  }) => {
    await page.goto('/robomania/flash/');

    const list = page.getByRole('heading', { name: 'Flashed from your computer' }).locator('..').getByRole('listitem');
    await expect(list).toHaveCount(3);
    await expect(list.filter({ hasText: 'Omnidirectional robot' })).toContainText(
      'this board is flashed from your computer with the tools, not from the browser.',
    );
    await expect(page.getByRole('link', { name: 'Omnidirectional robot' })).toHaveAttribute(
      'href',
      '/robomania/projects/omnidirectional/',
    );
    await expect(page.getByRole('link', { name: 'USB password key' })).toHaveAttribute('href', '/robomania/projects/usb-key/');
    await expect(page.getByRole('link', { name: 'FPV drone' })).toHaveCount(0);
  });

  test('has no script errors', async ({ page, fakeFlasher }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await fakeFlasher.install();

    await page.goto('/robomania/flash/');
    await pick(page, 'Blink').click();
    await pick(page, 'Servo').click();
    await page.goto('/robomania/flash/#blink');

    expect(errors).toEqual([]);
  });
});
