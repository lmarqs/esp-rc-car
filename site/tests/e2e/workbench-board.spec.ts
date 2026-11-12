import type { Locator, Page } from '@playwright/test';
import { expect, test, type FakeFlasherOptions } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
const cell = (page: Page) => bench(page).locator('[data-board-cell]');
/** The word the Board cell shows. */
const status = (page: Page) => bench(page).locator('[data-board-word]');
/** The status line: the dot, the word and, for a screen reader only, the sentence that names the board's sketch. */
const statusLine = (page: Page) => bench(page).locator('[data-board-status]');
const boardButton = (page: Page) => bench(page).locator('[data-board-action]');
const message = (page: Page) => bench(page).locator('[data-board-message]');
const picture = (page: Page) => bench(page).locator('[data-picture]');
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const card = (page: Page) => page.getByRole('region', { name: 'Put it on your board' });

const GREY = 'rgb(154, 167, 179)';
const GREY_CORE = 'rgb(201, 209, 216)';
const GREEN = 'rgb(46, 158, 107)';
const CORAL = 'rgb(226, 96, 58)';

/** Waits for the status dot and the chip's centre to show `colour`; the centre fades to it. */
async function expectColour(page: Page, colour: { dot: string; core: string }) {
  await expect(cell(page).locator('.core')).toHaveCSS('fill', colour.core);
  expect(await statusLine(page).evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).toBe(colour.dot);
}

/** The icon the button shows: `plug`, `bolt` or `back`. */
async function icon(page: Page) {
  if (await boardButton(page).locator('.i-plug').isVisible()) return 'plug';
  if (await boardButton(page).locator('.i-bolt').isVisible()) return 'bolt';
  if (await boardButton(page).locator('.i-back').isVisible()) return 'back';
  return 'none';
}

async function connect(page: Page) {
  await boardButton(page).click();
}

test.describe('the Board cell', () => {
  test('reads Simulated in grey with Connect and a plug before a board is connected', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await expect(cell(page)).toContainText('Board');
    await expect(status(page)).toHaveText('Simulated');
    await expect(statusLine(page)).toHaveAttribute('title', 'Running in the browser');
    await expectColour(page, { dot: GREY, core: GREY_CORE });
    await expect(boardButton(page)).toHaveAccessibleName('Connect');
    expect(await icon(page)).toBe('plug');
    expect(await fakeFlasher.calls()).toEqual([]);
  });

  test('reads Live in green and offers Flash again once the board names the selected step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Live');
    await expectColour(page, { dot: GREEN, core: GREEN });
    await expect(statusLine(page)).toHaveCSS('color', 'rgb(31, 122, 81)');
    await expect(boardButton(page)).toHaveAccessibleName('Flash again');
    expect(await icon(page)).toBe('bolt');
    // The workbench connects by restarting the board into what it holds: nothing is downloaded or written.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('reads Runs and the key in coral, and offers Flash step, when the board runs another step', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/commands'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Runs step 4');
    await expect(statusLine(page)).toHaveAttribute('title', 'Your board runs blink/commands');
    await expect(statusLine(page)).toHaveText('Runs step 4: Your board runs blink/commands');
    await expectColour(page, { dot: CORAL, core: CORAL });
    await expect(statusLine(page)).toHaveCSS('color', 'rgb(184, 67, 31)');
    await expect(boardButton(page)).toHaveAccessibleName('Flash step');
    expect(await icon(page)).toBe('bolt');
  });

  test('reads Other sketch in coral, with the key for a screen reader, when the board runs a sketch from outside the project', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch servo/sweep'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Other sketch');
    await expect(statusLine(page)).toHaveAttribute('title', 'Your board runs servo/sweep');
    await expect(statusLine(page)).toHaveText('Other sketch: Your board runs servo/sweep');
    await expectColour(page, { dot: CORAL, core: CORAL });
    await expect(boardButton(page)).toHaveAccessibleName('Flash step');
  });

  test('stays Simulated and offers Flash step on a board that has not named its sketch', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(boardButton(page)).toHaveAccessibleName('Flash step');
    await expect(status(page)).toHaveText('Simulated');
  });

  test('outlines the button in blue when it has the keyboard focus', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await tab(page, '4 commands').focus();
    await page.keyboard.press('Tab');

    await expect(boardButton(page)).toBeFocused();
    await expect(boardButton(page)).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
  });
});

test.describe('flashing from the workbench', () => {
  test("Flash step flashes the selected step's image on the open port and ends on Flash again", async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(status(page)).toHaveText('Live');

    await tab(page, '2 input').click();
    await expect(status(page)).toHaveText('Runs step 1');
    await boardButton(page).click();

    await expect(status(page)).toHaveText('Live');
    await expect(boardButton(page)).toHaveAccessibleName('Flash again');
    expect(await fakeFlasher.loaded()).toEqual([['blink/input/esp32/input.ino.bootloader.bin', 'blink/input/esp32/input.ino.bin']]);
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200', 'connect reuse', 'load', 'write', 'monitor 115200']);
  });

  test('shows the progress in place of the picture, and the picture once the board runs', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
    await page.goto(BLINK);
    await connect(page);
    await tab(page, '3 timer').click();
    const scope = bench(page).locator('.scope');
    const before = await scope.boundingBox();

    await boardButton(page).click();

    await expect(message(page)).toHaveText('Found ESP32');
    expect(await scope.boundingBox()).toEqual(before);
    await expect(bench(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await expect(bench(page).getByText('40%')).toBeVisible();
    await expect(picture(page)).toBeHidden();
    await expect(boardButton(page)).toHaveAttribute('aria-disabled', 'true');
    // Playwright waits for an aria-disabled button to be enabled, so the press is dispatched.
    await boardButton(page).dispatchEvent('click');
    expect((await fakeFlasher.calls()).filter((call) => call === 'load')).toHaveLength(1);

    await fakeFlasher.release();

    await expect(picture(page)).toBeVisible();
    await expect(message(page)).toBeHidden();
    await expect(status(page)).toHaveText('Live');
  });

  test('says it is connecting in place of the picture', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], holdConnect: true });
    await page.goto(BLINK);

    await connect(page);

    await expect(message(page)).toHaveText('Connecting to the board.');
    await expect(picture(page)).toBeHidden();
    await expect(boardButton(page)).toHaveAccessibleName('Connect');
    await expect(boardButton(page)).toHaveAttribute('aria-disabled', 'true');
    await fakeFlasher.release();
    await expect(picture(page)).toBeVisible();
    await expect(status(page)).toHaveText('Live');
  });

  test('keeps the port open while the visitor switches steps', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/timer'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(status(page)).toHaveText('Runs step 3');

    const seen: [string, string][] = [];
    for (const name of ['2 input', '3 timer', '4 commands', '1 simple', '3 timer']) {
      await tab(page, name).click();
      seen.push([(await status(page).textContent())!, (await boardButton(page).textContent())!.trim()]);
    }

    expect(seen).toEqual([
      ['Runs step 3', 'Flash step'],
      ['Live', 'Flash again'],
      ['Runs step 3', 'Flash step'],
      ['Runs step 3', 'Flash step'],
      ['Live', 'Flash again'],
    ]);
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test("shows a failure in the flash card's words in place of the picture, and Connect tries again", async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], failFirst: { connect: 'NotFoundError' } });
    await page.goto(BLINK);
    const scopeBefore = await bench(page).locator('.scope').boundingBox();

    await connect(page);

    await expect(message(page)).toHaveText('No board was chosen. Plug it in and try again.');
    expect(await bench(page).locator('.scope').boundingBox()).toEqual(scopeBefore);
    await expect(message(page)).toHaveClass(/notice/);
    await expect(picture(page)).toBeHidden();
    await expect(status(page)).toHaveText('Simulated');
    await expect(boardButton(page)).toHaveAccessibleName('Connect');

    await connect(page);

    await expect(status(page)).toHaveText('Live');
    await expect(picture(page)).toBeVisible();
  });

  test('says the board stopped talking once the port is lost, and offers Connect', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], monitorEnds: true });
    await page.goto(BLINK);

    await connect(page);

    await expect(message(page)).toHaveText('The board stopped talking to the page. Plug it back in and connect again.');
    await expect(status(page)).toHaveText('Simulated');
    await expect(boardButton(page)).toHaveAccessibleName('Connect');
  });

  test('names the chips a step has images for when the board has none, until another step is picked', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP32-C3', lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await tab(page, '2 input').click();

    await boardButton(page).click();

    await expect(message(page)).toHaveText('This board is an ESP32-C3. blink/input has images for: ESP32.');
    await expect(picture(page)).toBeHidden();
    await expect(status(page)).toHaveText('Runs step 1');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await tab(page, '3 timer').click();

    await expect(picture(page)).toBeVisible();
    await expect(message(page)).toBeHidden();
  });

  test('in a browser without Web Serial, simulates and shows the browser note in place of the button', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serial?: unknown }).serial;
    });
    await page.goto(BLINK);

    await expect(boardButton(page)).toBeHidden();
    const note = bench(page).locator('[data-needs-browser]');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.');
    await expect(note).toHaveAttribute('title', 'This browser cannot reach a USB board.');
    // The note fits the rail as the button does, so the rail keeps the 70 px it has at 1280 px.
    expect((await bench(page).locator('.rail').boundingBox())!.height).toBe(70);
    await expect(status(page)).toHaveText('Simulated');
    await expect(picture(page)).toBeVisible();
    await expect(serial(page)).toContainText('sketch blink/simple');
  });
});

test.describe('the flash card', () => {
  test('is gone from a ladder page, which flashes from the workbench', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await expect(bench(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });

  test('is gone from Servo, whose workbench flashes each step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/servo/');

    await expect(bench(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await expect(boardButton(page)).toHaveAccessibleName('Connect');
  });

  test('stays on a single-sketch project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/balance-beam/');

    await expect(bench(page)).toHaveCount(0);
    await expect(card(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
  });
});

test.describe('the rail', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
  const middle = (b: Box) => b.y + b.height / 2;
  /** Whether the element shows its whole text, with no ellipsis. */
  const fits = (locator: Locator) => locator.evaluate((element) => element.scrollWidth <= element.clientWidth);

  async function railBoxes(page: Page) {
    return {
      tabs: await Promise.all((await bench(page).getByRole('tab').all()).map(box)),
      cell: await box(cell(page)),
      button: await box(boardButton(page)),
    };
  }

  const states: { name: string; options: FakeFlasherOptions; reach: (page: Page) => Promise<void> }[] = [
    {
      name: 'connecting',
      options: { holdConnect: true },
      reach: async (page) => {
        await connect(page);
        await expect(message(page)).toHaveText('Connecting to the board.');
      },
    },
    {
      name: 'Live',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Live');
      },
    },
    {
      name: 'Back to live',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Live');
        await bench(page).getByRole('toolbar', { name: 'Debugger' }).getByRole('button', { name: 'Pause' }).click();
        await expect(boardButton(page)).toHaveAccessibleName('Back to live');
        expect(await icon(page)).toBe('back');
      },
    },
    {
      name: 'Runs step 4',
      options: { lines: ['sketch blink/commands'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Runs step 4');
      },
    },
    {
      name: 'Other sketch',
      options: { lines: ['sketch servo/sweep'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Other sketch');
      },
    },
    {
      name: 'flashing',
      options: { lines: ['sketch blink/commands'], progress: [40], hold: true },
      reach: async (page) => {
        await connect(page);
        await expect(boardButton(page)).toHaveAccessibleName('Flash step');
        await boardButton(page).click();
        await expect(message(page)).toHaveText('Found ESP32');
      },
    },
  ];

  for (const state of states) {
    test(`keeps every tab, the Board cell and the button where Simulated has them: ${state.name}`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install(state.options);
      await page.goto(BLINK);
      await expect(status(page)).toHaveText('Simulated');
      const simulated = await railBoxes(page);
      expect(await fits(statusLine(page))).toBe(true);

      await state.reach(page);

      expect(await railBoxes(page)).toEqual(simulated);
      expect(await fits(statusLine(page))).toBe(true);
      expect(await fits(boardButton(page))).toBe(true);
    });
  }

  test('centres the chip, the words, the button and the tabs on one line', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    const words = [await box(cell(page).locator('.name')), await box(status(page))];
    const centres = [
      middle(await box(cell(page).locator('.cpu'))),
      (words[0].y + words[1].y + words[1].height) / 2,
      middle(await box(boardButton(page))),
      ...(await Promise.all((await bench(page).getByRole('tab').all()).map(async (each) => middle(await box(each))))),
    ];

    for (const centre of centres) expect(Math.abs(centre - centres[0])).toBeLessThanOrEqual(1);
  });
});

test.describe('the watch', () => {
  for (const width of [1280, 821, 400]) {
    test(`keeps each value of every step on one line at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(BLINK);
      await expect(bench(page).locator('.watch div:visible').filter({ hasText: '1000 ms (fixed)' })).toHaveCount(1);

      for (const name of ['1 simple', '2 input', '3 timer', '4 commands']) {
        await tab(page, name).click();
        for (const row of await bench(page).locator('.watch div:visible').all()) {
          const [label, value] = await Promise.all([row.locator('dt').boundingBox(), row.locator('dd').boundingBox()]);
          expect(value!.height, `${name}: ${await row.textContent()}`).toBe(label!.height);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
});
