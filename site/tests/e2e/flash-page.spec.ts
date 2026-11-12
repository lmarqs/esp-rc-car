import { readFileSync } from 'node:fs';
import { expect, test } from './fake-flasher';

/** The manifest the build of these tests reads, whose keys name the sketches that have an image. */
const manifestKeys = Object.keys(
  (JSON.parse(readFileSync(new URL('./fixtures/firmware-manifest.json', import.meta.url), 'utf8')) as { sketches: object })
    .sketches,
);

const pick = (page: import('@playwright/test').Page, title: 'Omnidirectional robot' | 'Balance beam') =>
  page.getByRole('list', { name: 'Projects you can flash' }).getByRole('button', { name: title, exact: true });
const heading = (page: import('@playwright/test').Page, title: 'Omnidirectional robot' | 'Balance beam') =>
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
    await expect(projects.getByRole('button')).toHaveText(['Omnidirectional robot', 'Balance beam']);
    await expect(projects.getByRole('list', { name: 'Boards' })).toHaveText(['ESP32', 'ESP32', 'ESP32', 'ESP32']);
    await expect(page.getByText(LOCKED)).toBeHidden();
    await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page)).toHaveCount(0);
  });

  test('says on each card that picking it flashes it here, and once picked, that the card below flashes it', async ({
    page,
  }) => {
    await page.goto('/robomania/flash/');
    const hint = (title: 'Omnidirectional robot' | 'Balance beam') =>
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('button', { name: title, exact: true }) })
        .locator('[data-pick-hint] > span:visible');

    for (const title of ['Omnidirectional robot', 'Balance beam'] as const) {
      await expect(hint(title)).toHaveText('Pick to flash here');
      await expect(hint(title).locator('svg:visible')).toHaveCount(1);
    }

    await pick(page, 'Balance beam').click();

    await expect(hint('Balance beam')).toHaveText('Flash it below');
    await expect(hint('Balance beam').locator('svg:visible')).toHaveCount(1);
    await expect(hint('Omnidirectional robot')).toHaveText('Pick to flash here');
  });

  test('picking omnidirectional shows its card and the link to its wiring', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Omnidirectional robot').click();

    await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveCount(1);
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wiring and details for Omnidirectional robot' })).toHaveAttribute(
      'href',
      '/robomania/projects/omnidirectional/',
    );
    await expect(page).toHaveURL('/robomania/flash/#omnidirectional');
  });

  test('picking another project swaps the card', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Omnidirectional robot').click();
    await pick(page, 'Balance beam').click();

    await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'false');
    await expect(pick(page, 'Balance beam')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Wiring and details for Balance beam' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wiring and details for Omnidirectional robot' })).toBeHidden();
  });

  test('opens the project that the address names', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/#balance-beam');

    await expect(pick(page, 'Balance beam')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('link', { name: 'Wiring and details for Balance beam' })).toBeVisible();
    await expect(card(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  });

  for (const hash of ['#nothing', '#usb-key', '#blink', '#servo', '#%']) {
    test(`selects nothing for the address ${hash}`, async ({ page }) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));

      await page.goto(`/robomania/flash/${hash}`);

      await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'false');
      await expect(pick(page, 'Balance beam')).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('moves the focus to the card when a project is picked with the keyboard', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/');

    await pick(page, 'Balance beam').focus();
    await page.keyboard.press('Enter');

    await expect(heading(page, 'Balance beam')).toBeFocused();
  });

  test('flashes the picked project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32' });
    await page.goto('/robomania/flash/#omnidirectional');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'load', 'write', 'reset', 'monitor 115200']);
  });

  test('cannot pick another project while a board is flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/flash/#omnidirectional');

    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).getByText('40%')).toBeVisible();
    await expect(pick(page, 'Balance beam')).toBeDisabled();
    await expect(pick(page, 'Omnidirectional robot')).toBeDisabled();
    await expect(page.getByText(LOCKED)).toBeVisible();

    await fakeFlasher.release();

    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();
    await expect(pick(page, 'Balance beam')).toBeEnabled();
    await expect(page.getByText(LOCKED)).toBeHidden();
  });

  test('cannot change the project through the address while a board is flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/flash/#omnidirectional');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('40%')).toBeVisible();

    await page.evaluate(() => (location.hash = '#balance-beam'));

    await expect(page).toHaveURL('/robomania/flash/#omnidirectional');
    await expect(pick(page, 'Omnidirectional robot')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick(page, 'Balance beam')).toHaveAttribute('aria-pressed', 'false');
    await fakeFlasher.release();
    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();
  });

  test('keeps the board connected when another project is picked, and its card flashes it on a press', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto('/robomania/flash/#omnidirectional');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();

    await pick(page, 'Balance beam').click();
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(card(page).getByText('Plug the board in over USB. This replaces whatever is on the board.')).toBeVisible();
    expect(await fakeFlasher.calls()).not.toContain('disconnect');

    await pick(page, 'Omnidirectional robot').click();
    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();

    await pick(page, 'Balance beam').click();
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('Found ESP32. Check the settings, then flash the board.')).toBeVisible();
    expect(await fakeFlasher.calls()).toContain('disconnect');
  });

  test('lists the sketches outside the manifest as flashed from the computer, and leaves out a project with no sketch', async ({
    page,
  }) => {
    await page.goto('/robomania/flash/');

    const list = page.getByRole('heading', { name: 'Flashed from your computer' }).locator('..').getByRole('listitem');
    await expect(list).toHaveCount(2);
    await expect(list.filter({ hasText: 'Web-controlled relay' })).toContainText(
      'this board is flashed from your computer with the tools, not from the browser.',
    );
    await expect(page.getByRole('link', { name: 'Web-controlled relay' })).toHaveAttribute(
      'href',
      '/robomania/projects/web-relay/',
    );
    await expect(page.getByRole('link', { name: 'USB password key' })).toHaveAttribute('href', '/robomania/projects/usb-key/');
    await expect(page.getByRole('link', { name: 'FPV drone' })).toHaveCount(0);
  });

  test('lists no project that has a workbench as a pick', async ({ page }) => {
    await page.goto('/robomania/flash/');

    await expect(pick(page, 'Omnidirectional robot')).toBeVisible();
    for (const title of ['Blink', 'Servo']) {
      await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    }
    await expect(page.locator('[data-panel]')).toHaveCount(2);
  });

  test('has no script errors', async ({ page, fakeFlasher }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await fakeFlasher.install();

    await page.goto('/robomania/flash/');
    await pick(page, 'Omnidirectional robot').click();
    await pick(page, 'Balance beam').click();
    await page.goto('/robomania/flash/#omnidirectional');

    expect(errors).toEqual([]);
  });
});

const ladders = [
  { title: 'Blink', id: 'blink' },
  { title: 'Servo', id: 'servo' },
];

test.describe('a project with a workbench on the Flash page', () => {
  const projectCard = (page: import('@playwright/test').Page, title: string) =>
    page.getByRole('list', { name: 'Projects you can flash' }).getByRole('listitem').filter({
      has: page.getByRole('heading', { level: 3, name: title, exact: true }),
    });

  for (const { title, id } of ladders) {
    test(`${title} has one card with its chips and a link to its workbench`, async ({ page }) => {
      await page.goto('/robomania/flash/');

      const item = projectCard(page, title);
      await expect(item).toHaveCount(1);
      await expect(item.getByRole('list', { name: 'Boards' }).getByRole('listitem')).toHaveText(['ESP32']);
      await expect(item.getByRole('button')).toHaveCount(0);
      await expect(item.getByRole('link')).toHaveCount(1);
      await expect(item.getByRole('link', { name: `Open the workbench for ${title}` })).toHaveAttribute(
        'href',
        `/robomania/projects/${id}/#workbench`,
      );
      await expect(item.getByRole('link')).toHaveText(/^\s*Open the workbench/);
      await expect(item.getByRole('link').locator('svg')).toHaveCount(1);
    });

    test(`the link of ${title} lands on its workbench`, async ({ page }) => {
      await page.goto('/robomania/flash/');

      await page.getByRole('link', { name: `Open the workbench for ${title}` }).click();

      await expect(page).toHaveURL(`/robomania/projects/${id}/#workbench`);
      const bench = page.getByRole('region', { name: 'Workbench' });
      await expect(bench).toHaveAttribute('id', 'workbench');
      await expect(bench).toBeInViewport();
    });

    test(`${title} has no flash card on the Flash page`, async ({ page }) => {
      await page.goto(`/robomania/flash/#${id}`);

      await expect(card(page)).toHaveCount(0);
      await expect(page.locator(`[data-panel="${id}"]`)).toHaveCount(0);
    });
  }

  test('a click on the card follows the link', async ({ page }) => {
    await page.goto('/robomania/flash/');

    await projectCard(page, 'Servo').click({ position: { x: 20, y: 20 } });

    await expect(page).toHaveURL('/robomania/projects/servo/#workbench');
  });

  test('the link cannot be followed while a board is flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ progress: [40], hold: true });
    await page.goto('/robomania/flash/#omnidirectional');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(card(page).getByText('40%')).toBeVisible();

    const link = page.getByRole('link', { name: 'Open the workbench for Blink' });
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await link.click({ force: true });

    await expect(page).toHaveURL('/robomania/flash/#omnidirectional');
    await fakeFlasher.release();
    await expect(card(page).getByText('Your board is running Omnidirectional robot.')).toBeVisible();
    await expect(link).not.toHaveAttribute('aria-disabled');
  });
});

test.describe('the links of the Flash page', () => {
  test('lead to a page that exists, and to an anchor that exists on it', async ({ page }) => {
    await page.goto('/robomania/flash/');
    const hrefs = await page
      .locator('main a[href^="/robomania/projects/"]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')!))]);
    expect(hrefs).toContain('/robomania/projects/blink/#workbench');
    expect(hrefs).toContain('/robomania/projects/servo/#workbench');

    for (const href of hrefs) {
      const [path, anchor] = href.split('#');
      const response = await page.goto(path);
      expect(response?.status(), href).toBe(200);
      if (anchor) await expect(page.locator(`[id="${anchor}"]`), href).toHaveCount(1);
    }
  });

  test('name only sketches that the manifest has', async ({ page }) => {
    await page.goto('/robomania/flash/');
    const cards = await page.locator('[data-flash-card]').evaluateAll((all) => all.map((node) => (node as HTMLElement).dataset.sketch!));
    const pages = await page
      .locator('main a[href$="#workbench"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')!));

    expect(cards.length).toBeGreaterThan(0);
    for (const key of cards) expect(manifestKeys, key).toContain(key);
    expect(pages).toHaveLength(2);
    for (const href of pages) {
      await page.goto(href);
      const workbench = page.locator('[data-workbench]');
      const steps = JSON.parse((await workbench.getAttribute('data-steps'))!) as unknown[];
      // The page's manifest names each step's images by the key the session flashes.
      const flashed = JSON.parse((await workbench.getAttribute('data-manifest'))!) as { sketches: object };
      const keys = Object.keys(flashed.sketches);
      expect(steps.length, href).toBeGreaterThan(1);
      expect(keys, href).toHaveLength(steps.length);
      for (const key of keys) expect(manifestKeys, `${href} ${key}`).toContain(key);
    }
  });
});
