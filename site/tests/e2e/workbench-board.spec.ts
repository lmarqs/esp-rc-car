import type { Locator, Page } from '@playwright/test';
import { expect, test, type FakeFlasherOptions } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
/** The word the Board status, a live region for a screen reader, reads. */
const status = (page: Page) => bench(page).locator('[data-board-word]');
/** The Board status: the word and the sentence that names the board's sketch. */
const statusLine = (page: Page) => bench(page).locator('[data-board-status]');
const boardSwitch = (page: Page) => bench(page).getByRole('group', { name: 'What drives the board pane' });
const boardButton = (page: Page) => bench(page).locator('[data-board-action]');
const simulatorButton = (page: Page) => bench(page).locator('[data-pane-simulator]');
const flashAgain = (page: Page) => bench(page).getByRole('button', { name: 'Flash again' });
const message = (page: Page) => bench(page).locator('[data-board-message]');
const picture = (page: Page) => bench(page).locator('[data-picture]');
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const card = (page: Page) => page.getByRole('region', { name: 'Put it on your board' });

/** The icon the board half shows: `plug`, `bolt` or `dot`. */
async function icon(page: Page) {
  for (const name of ['plug', 'bolt', 'dot']) {
    if (await boardButton(page).locator(`.i-${name}`).isVisible()) return name;
  }
  return 'none';
}

/** Which half of the switch drives the pane, as each reads it out. */
async function pressed(page: Page) {
  return [await simulatorButton(page).getAttribute('aria-pressed'), await boardButton(page).getAttribute('aria-pressed')];
}

async function connect(page: Page) {
  await boardButton(page).click();
}

test.describe('the Board switch', () => {
  test('has the simulator pressed and offers to connect, with a plug, before a board is connected', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await expect(boardSwitch(page)).toBeVisible();
    await expect(simulatorButton(page)).toHaveAccessibleName('Simulator');
    await expect(boardButton(page)).toHaveAccessibleName('Connect my board');
    expect(await icon(page)).toBe('plug');
    expect(await pressed(page)).toEqual(['true', 'false']);
    await expect(status(page)).toHaveText('Simulated');
    await expect(flashAgain(page)).toBeHidden();
    expect(await fakeFlasher.calls()).toEqual([]);
  });

  test('presses My board, live, and offers Flash again in the pane once the board names the selected step', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Live');
    await expect(boardButton(page)).toHaveAccessibleName('My board, live');
    expect(await icon(page)).toBe('dot');
    expect(await pressed(page)).toEqual(['false', 'true']);
    await expect(flashAgain(page)).toBeVisible();
    // The workbench connects by restarting the board into what it holds: nothing is downloaded or written.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('keeps the simulator pressed and offers to flash the selected step when the board runs another step', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/commands'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Runs step 4');
    await expect(statusLine(page)).toHaveText('Runs step 4: Your board runs blink/commands');
    await expect(boardButton(page)).toHaveAccessibleName('Flash step 1 to board');
    expect(await icon(page)).toBe('bolt');
    expect(await pressed(page)).toEqual(['true', 'false']);
    await expect(flashAgain(page)).toBeHidden();
  });

  test('names a sketch from outside the project for a screen reader, and offers to flash the step', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch servo/sweep'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(status(page)).toHaveText('Other sketch');
    await expect(statusLine(page)).toHaveText('Other sketch: Your board runs servo/sweep');
    await expect(boardButton(page)).toHaveAccessibleName('Flash step 1 to board');
  });

  test('changes the status, a live region, in one change, so a screen reader announces it once', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await statusLine(page).evaluate((region) => {
      const changes: string[] = [];
      (window as unknown as { statusChanges: string[] }).statusChanges = changes;
      new MutationObserver((records) => {
        for (const record of records) changes.push(record.target === region ? record.type : 'inner');
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });

    await connect(page);

    await expect(status(page)).toHaveText('Live');
    const changes = await page.evaluate(() => (window as unknown as { statusChanges: string[] }).statusChanges);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change === 'childList')).toBe(true);
  });

  test('offers to flash the step on a board that has not named its sketch', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(boardButton(page)).toHaveAccessibleName('Flash step 1 to board');
    await expect(status(page)).toHaveText('Connected');
    expect(await pressed(page)).toEqual(['true', 'false']);
  });

  test('Simulator hands the pane to the simulator while the board keeps its step, and My board takes it back', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(status(page)).toHaveText('Live');

    await simulatorButton(page).click();

    expect(await pressed(page)).toEqual(['true', 'false']);
    await expect(boardButton(page)).toHaveAccessibleName('My board');
    await expect(flashAgain(page)).toBeHidden();

    await boardButton(page).click();

    expect(await pressed(page)).toEqual(['false', 'true']);
    await expect(boardButton(page)).toHaveAccessibleName('My board, live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('Flash again flashes the step the board runs', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(status(page)).toHaveText('Live');

    await flashAgain(page).click();

    await expect(status(page)).toHaveText('Live');
    expect(await fakeFlasher.loaded()).toEqual([['blink/simple/esp32/simple.ino.bootloader.bin', 'blink/simple/esp32/simple.ino.bin']]);
  });

  test('outlines each half in blue when it has the keyboard focus', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await tab(page, '4 commands').focus();
    await page.keyboard.press('Tab');
    await expect(simulatorButton(page)).toBeFocused();
    await expect(simulatorButton(page)).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
    await page.keyboard.press('Tab');
    await expect(boardButton(page)).toBeFocused();
    await expect(boardButton(page)).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
  });
});

test.describe('flashing from the workbench', () => {
  test("Flash step flashes the selected step's image on the open port and ends live", async ({
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
    await expect(boardButton(page)).toHaveAccessibleName('My board, live');
    await expect(flashAgain(page)).toBeVisible();
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
    await expect(boardButton(page)).toHaveAccessibleName('Connecting…');
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
      ['Runs step 3', 'Flash step 2 to board'],
      ['Live', 'My board, live'],
      ['Runs step 3', 'Flash step 4 to board'],
      ['Runs step 3', 'Flash step 1 to board'],
      ['Live', 'My board, live'],
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
    await expect(boardButton(page)).toHaveAccessibleName('Connect my board');

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
    await expect(boardButton(page)).toHaveAccessibleName('Connect my board');
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

    await expect(message(page)).toHaveText(
      'This board is an ESP32-C3. blink/input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    await expect(picture(page)).toBeHidden();
    await expect(status(page)).toHaveText('Runs step 1');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await tab(page, '3 timer').click();

    await expect(picture(page)).toBeVisible();
    await expect(message(page)).toBeHidden();
  });

  for (const width of [821, 400]) {
    test(`keeps the reports in place when the no-image message shows at ${width} px`, async ({ page, fakeFlasher }) => {
      await fakeFlasher.install({ chip: 'ESP32-C3', lines: ['sketch blink/simple'] });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(BLINK);
      await connect(page);
      await tab(page, '2 input').click();
      const scopeBefore = await bench(page).locator('.scope').boundingBox();

      await boardButton(page).click();

      await expect(message(page)).toContainText('pick another step');
      expect(await bench(page).locator('.scope').boundingBox()).toEqual(scopeBefore);
    });
  }

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
    await expect(boardButton(page)).toHaveAccessibleName('Connect my board');
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
      board: await box(boardSwitch(page)),
      simulator: await box(simulatorButton(page)),
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
      name: 'Connected',
      options: { lines: ['HIGH'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Connected');
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
      name: 'My board, after Pause',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(status(page)).toHaveText('Live');
        await bench(page).getByRole('toolbar', { name: 'Debugger' }).getByRole('button', { name: 'Pause' }).click();
        await expect(boardButton(page)).toHaveAccessibleName('My board');
        expect(await icon(page)).toBe('dot');
      },
    },
    {
      name: 'the longest label',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await tab(page, '4 commands').click();
        await expect(boardButton(page)).toHaveAccessibleName('Flash step 4 to board');
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
        await expect(boardButton(page)).toHaveAccessibleName('Flash step 1 to board');
        await boardButton(page).click();
        await expect(message(page)).toHaveText('Found ESP32');
      },
    },
  ];

  for (const state of states) {
    test(`keeps every tab and both halves of the switch where Simulated has them: ${state.name}`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install(state.options);
      await page.goto(BLINK);
      await expect(status(page)).toHaveText('Simulated');
      const simulated = await railBoxes(page);

      await state.reach(page);

      expect(await railBoxes(page)).toEqual(simulated);
      expect(await fits(boardButton(page))).toBe(true);
    });
  }

  test('centres the switch and the tabs on one line', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    const centres = [
      middle(await box(boardSwitch(page))),
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
