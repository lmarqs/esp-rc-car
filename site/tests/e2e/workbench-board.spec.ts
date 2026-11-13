import type { Locator, Page } from '@playwright/test';
import { dock, dockAction, plugIn } from './dock';
import { expect, test, type FakeFlasherOptions } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
/** The word on the board pane's frame, which names what the pane shows. */
const tagWord = (page: Page) => bench(page).locator('[data-tag-word]');
/** The frame's tag, a live region for a screen reader: the word and the sentence that says more. */
const tag = (page: Page) => bench(page).locator('[data-pane-tag]');
const boardSwitch = (page: Page) => bench(page).getByRole('group', { name: 'What the board pane shows' });
const simulatorButton = (page: Page) => bench(page).locator('[data-pane-simulator]');
const myBoardButton = (page: Page) => bench(page).locator('[data-pane-board]');
const picture = (page: Page) => bench(page).locator('[data-picture]');
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const card = (page: Page) => page.getByRole('region', { name: 'Put it on your board' });

/**
 * Where `locator` sits on the page rather than in the window, so a scroll does not count as a move: the page may
 * come back from another one scrolled.
 */
const onPage = (locator: Locator) =>
  locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + scrollX, y: y + scrollY, width, height };
  });

/** Which half of the switch is pressed, as each reads it out. */
async function pressed(page: Page) {
  const halves = [simulatorButton(page), myBoardButton(page)];
  return Promise.all(halves.map((half) => half.getAttribute('aria-pressed')));
}

/** Connects the board without flashing it, then opens My board. */
async function connect(page: Page) {
  await plugIn(page);
  await myBoardButton(page).click();
}

/** Opens My board and presses the dock's button, which connects the board and flashes the selected step. */
async function flashFromDock(page: Page) {
  await myBoardButton(page).click();
  await dockAction(page).click();
}

test.describe('the switch', () => {
  test('has the simulator pressed before a board is connected, and My board says no board is connected', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await expect(boardSwitch(page)).toBeVisible();
    await expect(simulatorButton(page)).toHaveAccessibleName('Simulator');
    await expect(myBoardButton(page)).toHaveAccessibleName('My board');
    await expect(myBoardButton(page)).toHaveAttribute('title', 'My board: not connected');
    expect(await pressed(page)).toEqual(['true', 'false']);
    await expect(tag(page)).toHaveText('Simulated Running in the browser');

    await myBoardButton(page).click();

    expect(await pressed(page)).toEqual(['false', 'true']);
    await expect(tag(page)).toHaveText('My board Not connected');
    expect(await fakeFlasher.calls()).toEqual([]);
  });

  test('keeps the LED and the watch in place, dimmed, under My board, and Simulator brings them back', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);
    const ledRow = bench(page).locator('.led-row');
    const opacity = () => ledRow.evaluate((row) => getComputedStyle(row).opacity);
    const before = await ledRow.boundingBox();
    expect(await opacity()).toBe('1');

    await myBoardButton(page).click();

    await expect(tag(page)).toHaveText('My board Not connected');
    await expect(picture(page)).toBeVisible();
    expect(await opacity()).toBe('0.4');
    expect(await ledRow.boundingBox()).toEqual(before);
    await expect(bench(page).locator('[data-watch-row="LED"] dd')).toHaveText('…');

    await simulatorButton(page).click();

    await expect(tagWord(page)).toHaveText('Simulated');
    expect(await opacity()).toBe('1');
    await expect(serial(page)).toContainText('sketch blink/simple');
  });

  test('goes live once the board names the selected step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);
    await connect(page);
    await expect(tag(page)).toHaveText('My board Waiting for it to name its sketch');

    await fakeFlasher.print('sketch blink/simple');

    await expect(tag(page)).toHaveText('Live Drawn from what your board prints');
    await expect(bench(page).locator('[data-frame]')).toHaveAttribute('data-mode', 'live');
    await expect(myBoardButton(page)).toHaveAttribute('title', 'My board: connected');
    expect(await pressed(page)).toEqual(['false', 'true']);
    // Connecting from a page with no sketch open restarts the board into what it holds: nothing is written.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('waits under My board when the board runs another step, and the dock offers to flash the selected one', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/commands'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(tag(page)).toHaveText('My board Runs commands');
    await expect(dockAction(page)).toHaveAccessibleName('Flash Blink · simple');
    expect(await pressed(page)).toEqual(['false', 'true']);
  });

  test('names a board that runs simple on the commands step, and the dock offers to flash commands', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await tab(page, '4 commands').click();

    await connect(page);

    await expect(tag(page)).toHaveText('My board Runs simple');
    await expect(dockAction(page)).toHaveAccessibleName('Flash Blink · commands');
  });

  test('names a sketch from outside the project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch servo/sweep'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(tag(page)).toHaveText('My board Runs servo/sweep');
  });

  test('changes the tag, a live region, in one change, so a screen reader announces it once', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/commands'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(tag(page)).toHaveText('My board Runs commands');
    await tag(page).evaluate((region) => {
      const changes: string[] = [];
      (window as unknown as { tagChanges: string[] }).tagChanges = changes;
      new MutationObserver((records) => {
        for (const record of records) changes.push(record.target === region ? record.type : 'inner');
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });

    await tab(page, '4 commands').click();

    await expect(tagWord(page)).toHaveText('Live');
    const changes = await page.evaluate(() => (window as unknown as { tagChanges: string[] }).tagChanges);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change === 'childList')).toBe(true);
  });

  test('says it waits for a board that has not named its sketch, and the dock offers to flash the step', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['HIGH'] });
    await page.goto(BLINK);

    await connect(page);

    await expect(tag(page)).toHaveText('My board Waiting for it to name its sketch');
    await expect(dockAction(page)).toHaveAccessibleName('Flash Blink · simple');
  });

  test('asks to press reset on the adapter of a picked ESP-01S that has not named its sketch', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP8266', lines: ['HIGH'] });
    await page.goto('/robomania/learn/');
    await page.getByRole('combobox', { name: 'My board' }).selectOption({ label: 'ESP-01S' });
    await page.goto(BLINK);

    await connect(page);

    await expect(tag(page)).toHaveText('My board Waiting for it to name its sketch: press reset on its adapter');
  });

  test('Simulator hands the pane to the simulator while the board keeps its step, and My board takes it back', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await simulatorButton(page).click();

    expect(await pressed(page)).toEqual(['true', 'false']);
    await expect(tag(page)).toHaveText('Simulated Running in the browser; your board runs this step under My board');

    await myBoardButton(page).click();

    expect(await pressed(page)).toEqual(['false', 'true']);
    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('outlines each half in blue when it has the keyboard focus', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);

    await tab(page, '4 commands').focus();
    await page.keyboard.press('Tab');
    await expect(simulatorButton(page)).toBeFocused();
    await expect(simulatorButton(page)).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
    await page.keyboard.press('Tab');
    await expect(myBoardButton(page)).toBeFocused();
    await expect(myBoardButton(page)).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
  });

  test('makes the terminal inert while My board waits, and gives it back to the simulator', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install();
    await page.goto(BLINK);
    const terminal = bench(page).locator('[data-terminal]');

    await myBoardButton(page).click();

    await expect(terminal).toHaveJSProperty('inert', true);
    await simulatorButton(page).click();
    await expect(terminal).toHaveJSProperty('inert', false);
  });
});

test.describe('the pane while the dock works on the board', () => {
  const layout = async (page: Page) => ({
    frame: await onPage(bench(page).locator('[data-frame]')),
    picture: await onPage(picture(page)),
    watch: await onPage(bench(page).locator('.watch')),
    scope: await onPage(bench(page).locator('.scope')),
  });

  const flash = 'Flash Blink · commands';
  /** What the board does after the dock's button is pressed under My board, and what the tag and the button then say. */
  const states: { name: string; options: FakeFlasherOptions; tag: string; action: string }[] = [
    { name: 'connects', options: { holdConnect: true }, tag: 'My board Connecting…', action: 'Connecting…' },
    { name: 'flashes', options: { progress: [40], hold: true }, tag: 'My board Flashing…', action: 'Flashing…' },
    { name: 'fails', options: { failFirst: { connect: 'NotFoundError' } }, tag: 'My board Not connected', action: 'Try again' },
    { name: 'runs another step', options: { lines: ['sketch blink/simple'] }, tag: 'My board Runs simple', action: flash },
    { name: 'runs the step', options: { announce: true }, tag: 'Live Drawn from what your board prints', action: flash },
  ];

  for (const state of states) {
    test(`keeps its layout and height while the board ${state.name}`, async ({ page, fakeFlasher }) => {
      await fakeFlasher.install(state.options);
      await page.goto(BLINK);
      await tab(page, '4 commands').click();
      await myBoardButton(page).click();
      await expect(tag(page)).toHaveText('My board Not connected');
      const waiting = await layout(page);

      await dockAction(page).click();

      await expect(dockAction(page)).toHaveAccessibleName(state.action);
      await expect(tag(page)).toHaveText(state.tag);
      await expect(picture(page)).toBeVisible();
      expect(await layout(page)).toEqual(waiting);
    });
  }

  test('names the work on the switch while the board connects', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ holdConnect: true, announce: true });
    await page.goto(BLINK);

    await flashFromDock(page);

    await expect(myBoardButton(page)).toHaveAttribute('title', 'My board: connecting…');
    await fakeFlasher.release();
    await expect(tagWord(page)).toHaveText('Live');
  });

  test('goes Live once the dock flashes the selected step onto the board', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await tab(page, '2 input').click();
    await expect(tag(page)).toHaveText('My board Runs simple');
    await dockAction(page).click();

    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.loaded()).toEqual([['blink/input/esp32/input.ino.bootloader.bin', 'blink/input/esp32/input.ino.bin']]);
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200', 'connect reuse', 'load', 'write', 'monitor 115200']);
  });

  test('goes Live on the step the dock wrote once a board left in flash mode is read again', async ({
    page,
    fakeFlasher,
  }) => {
    // An ESP8266 that prints nothing after the write is still in flash mode, and never names its sketch.
    await fakeFlasher.install({ chip: 'ESP8266' });
    await page.goto(BLINK);

    await flashFromDock(page);
    await expect(dockAction(page)).toHaveAccessibleName('Connect again', { timeout: 10_000 });
    await dockAction(page).click();

    await expect(tag(page)).toHaveText('Live Drawn from what your board prints');
  });

  test('keeps the port open while the visitor switches steps, and the dock names the step to flash', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/timer'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(tag(page)).toHaveText('My board Runs timer');

    for (const [name, word, action] of [
      ['2 input', 'My board', 'Flash Blink · input'],
      ['3 timer', 'Live', 'Flash Blink · timer'],
      ['4 commands', 'My board', 'Flash Blink · commands'],
      ['1 simple', 'My board', 'Flash Blink · simple'],
      ['3 timer', 'Live', 'Flash Blink · timer'],
    ]) {
      await tab(page, name).click();
      await expect(tagWord(page), name).toHaveText(word);
      await expect(dockAction(page), name).toHaveAccessibleName(action);
    }
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('stays on the board the dock refused to flash, which keeps running its step', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32-C3', lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await tab(page, '2 input').click();

    await dockAction(page).click();

    await expect(dock(page).locator('[data-dock-message]')).toContainText('Blink · input has images for: ESP32');
    await expect(tag(page)).toHaveText('My board Runs simple');
    await expect(picture(page)).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('in a browser without Web Serial, simulates and shows the note in place of My board', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serial?: unknown }).serial;
    });
    await page.goto(BLINK);

    await expect(myBoardButton(page)).toBeHidden();
    const note = bench(page).locator('[data-needs-browser]');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('This browser cannot reach a USB board. Open this page in Chrome or Edge on a computer.');
    await expect(note).toHaveAttribute('title', 'This browser cannot reach a USB board.');
    // The note fits the rail as the switch does, so the rail keeps the 70 px it has at 1280 px.
    expect((await bench(page).locator('.rail').boundingBox())!.height).toBe(70);
    await expect(tagWord(page)).toHaveText('Simulated');
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

  test('is gone from Servo, whose selected step the dock flashes', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/servo/');

    await expect(bench(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await expect(dockAction(page)).toHaveAccessibleName(/^Flash Servo · /);
  });

  test('stays on a single-sketch project', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/projects/balance-beam/');

    await expect(bench(page)).toHaveCount(0);
    await expect(card(page)).toContainText('Connect and flash it from the board bar below.');
    await expect(dockAction(page)).toHaveAccessibleName('Flash Balance beam');
  });
});

test.describe('the rail', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const box = (locator: Locator): Promise<Box> => onPage(locator);
  const middle = (b: Box) => b.y + b.height / 2;

  async function railBoxes(page: Page) {
    return {
      tabs: await Promise.all((await bench(page).getByRole('tab').all()).map(box)),
      board: await box(boardSwitch(page)),
      simulator: await box(simulatorButton(page)),
      myBoard: await box(myBoardButton(page)),
    };
  }

  const states: { name: string; options: FakeFlasherOptions; reach: (page: Page) => Promise<void> }[] = [
    {
      name: 'connecting',
      options: { holdConnect: true },
      reach: async (page) => {
        await flashFromDock(page);
        await expect(tag(page)).toHaveText('My board Connecting…');
      },
    },
    {
      name: 'connected',
      options: { lines: ['HIGH'] },
      reach: async (page) => {
        await connect(page);
        await expect(tag(page)).toHaveText('My board Waiting for it to name its sketch');
      },
    },
    {
      name: 'Live',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(tagWord(page)).toHaveText('Live');
      },
    },
    {
      name: 'Simulated, after Pause',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(tagWord(page)).toHaveText('Live');
        await bench(page).getByRole('toolbar', { name: 'Debugger' }).getByRole('button', { name: 'Pause' }).click();
        await expect(tagWord(page)).toHaveText('Simulated');
      },
    },
    {
      name: 'Runs commands',
      options: { lines: ['sketch blink/commands'] },
      reach: async (page) => {
        await connect(page);
        await expect(tag(page)).toHaveText('My board Runs commands');
      },
    },
    {
      name: 'another sketch',
      options: { lines: ['sketch servo/sweep'] },
      reach: async (page) => {
        await connect(page);
        await expect(tag(page)).toHaveText('My board Runs servo/sweep');
      },
    },
    {
      name: 'flashing',
      options: { lines: ['sketch blink/commands'], progress: [40], hold: true },
      reach: async (page) => {
        await connect(page);
        await expect(tag(page)).toHaveText('My board Runs commands');
        await dockAction(page).click();
        await expect(tag(page)).toHaveText('My board Flashing…');
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
      await expect(tagWord(page)).toHaveText('Simulated');
      const simulated = await railBoxes(page);

      await state.reach(page);

      expect(await railBoxes(page)).toEqual(simulated);
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

test.describe('the finish of the switch and the frame', () => {
  const HALF = 104;
  const widthOf = async (locator: Locator) => (await locator.boundingBox())!.width;
  const duration = (locator: Locator, property = 'transition-duration') =>
    locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

  const states: { name: string; options: FakeFlasherOptions; reach: (page: Page) => Promise<void> }[] = [
    { name: 'not connected', options: {}, reach: async (page) => myBoardButton(page).click() },
    {
      name: 'connecting',
      options: { holdConnect: true },
      reach: async (page) => {
        await flashFromDock(page);
        await expect(tag(page)).toHaveText('My board Connecting…');
      },
    },
    {
      name: 'connected',
      options: { lines: ['HIGH'] },
      reach: async (page) => {
        await connect(page);
        await expect(tag(page)).toHaveText('My board Waiting for it to name its sketch');
      },
    },
    {
      name: 'live',
      options: { lines: ['sketch blink/simple'] },
      reach: async (page) => {
        await connect(page);
        await expect(tagWord(page)).toHaveText('Live');
      },
    },
  ];

  for (const state of states) {
    test(`gives each half of the switch ${HALF} px at 1100 px, and keeps it: ${state.name}`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install(state.options);
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.goto(BLINK);
      expect([await widthOf(simulatorButton(page)), await widthOf(myBoardButton(page))]).toEqual([HALF, HALF]);

      await state.reach(page);

      expect([await widthOf(simulatorButton(page)), await widthOf(myBoardButton(page))]).toEqual([HALF, HALF]);
    });
  }

  test('has no horizontal scroll at 380 px with My board chosen', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.setViewportSize({ width: 380, height: 900 });
    await page.goto(BLINK);

    await myBoardButton(page).click();

    await expect(tag(page)).toHaveText('My board Not connected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(380);
  });

  test('slides the pill behind the pressed half, and gives the half the colour of the card', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install();
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(BLINK);
    const pill = boardSwitch(page).locator('.pill');
    const left = async () => (await pill.boundingBox())!.x;
    const simulatorLeft = (await simulatorButton(page).boundingBox())!.x;
    const boardLeft = (await myBoardButton(page).boundingBox())!.x;
    expect(await left()).toBe(simulatorLeft);
    expect(await widthOf(pill)).toBe(HALF);
    const pressedColour = await simulatorButton(page).evaluate((half) => getComputedStyle(half).color);
    const cardColour = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('i'));
      probe.style.color = 'var(--card)';
      return getComputedStyle(probe).color;
    });
    expect(pressedColour).toBe(cardColour);

    await myBoardButton(page).click();

    await expect.poll(left).toBe(boardLeft);
    expect(await widthOf(pill)).toBe(HALF);
  });

  test('moves the pill, the frame and the dot over time, and not at all when the visitor asks for less motion', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ holdConnect: true });
    await page.goto(BLINK);
    const pill = boardSwitch(page).locator('.pill');
    const frame = bench(page).locator('[data-frame]');
    const dot = bench(page).locator('[data-board-dot]');
    expect(await duration(pill)).toBe('0.22s');
    expect(await duration(frame)).toBe('0.25s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await flashFromDock(page);
    await expect(dot).toHaveAttribute('data-link', 'busy');

    expect(await duration(pill)).toBe('0s');
    expect(await duration(frame)).toBe('0s');
    expect(await duration(dot, 'animation-name')).toBe('none');
    expect(await duration(myBoardButton(page))).toBe('0s');
  });

  test('pulses the dot while the session works, and fills it green once the board is connected', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ announce: true, holdConnect: true });
    await page.goto(BLINK);
    const dot = bench(page).locator('[data-board-dot]');
    const background = () => dot.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background()).toBe('rgba(0, 0, 0, 0)');
    expect(await duration(dot, 'animation-name')).toBe('none');

    await flashFromDock(page);
    await expect(dot).toHaveAttribute('data-link', 'busy');
    expect(await duration(dot, 'animation-name')).not.toBe('none');

    await fakeFlasher.release();
    await expect(dot).toHaveAttribute('data-link', 'on');
    expect(await duration(dot, 'animation-name')).toBe('none');
    // The fill fades in, so its first frame may still be clear.
    await expect.poll(background).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('names the work on the dot: connected, then flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/commands'], progress: [40], hold: true });
    await page.goto(BLINK);

    await connect(page);
    await expect(tag(page)).toHaveText('My board Runs commands');
    expect(await myBoardButton(page).getAttribute('title')).toBe('My board: connected');
    await dockAction(page).click();

    await expect(tag(page)).toHaveText('My board Flashing…');
    await expect(myBoardButton(page)).toHaveAttribute('title', 'My board: flashing…');
  });

  for (const state of states.slice(0, 1)) {
    test(`gives the tag the sentence it shows as its title, in every view: ${state.name}`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ announce: true });
      await page.goto(BLINK);
      await expect(tag(page)).toHaveAttribute('title', 'Simulated Running in the browser');

      await state.reach(page);
      await expect(tag(page)).toHaveAttribute('title', 'My board Not connected');

      await dockAction(page).click();
      await expect(tagWord(page)).toHaveText('Live');
      await expect(tag(page)).toHaveAttribute('title', 'Live Drawn from what your board prints');
    });
  }

  test('keeps the stage one height in every step and view', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ announce: true });
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(BLINK);
    const stage = bench(page).locator('.stage');
    const height = async (locator: Locator) => (await locator.boundingBox())!.height;
    await tab(page, '4 commands').click();
    const simulatedHeight = await height(stage);
    expect(simulatedHeight).toBeGreaterThanOrEqual(await height(bench(page).locator('.watch')));
    for (const name of ['1 simple', '2 input', '3 timer']) {
      await tab(page, name).click();
      expect(await height(stage), name).toBe(simulatedHeight);
    }
    await tab(page, '4 commands').click();

    await myBoardButton(page).click();
    await expect(tag(page)).toHaveText('My board Not connected');
    expect(await height(stage)).toBe(simulatedHeight);

    await dockAction(page).click();
    await expect(tagWord(page)).toHaveText('Live');
    expect(await height(stage)).toBe(simulatedHeight);
  });
});
