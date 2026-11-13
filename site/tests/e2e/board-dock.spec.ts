import type { Page } from '@playwright/test';
import { plugIn } from './dock';
import { expect, test } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
/** The word on the board pane's frame, which names what the pane shows. */
const tagWord = (page: Page) => bench(page).locator('[data-tag-word]');

/** Connects the board without flashing it, then opens the workbench's My board. */
async function connect(page: Page) {
  await plugIn(page);
  await bench(page).locator('[data-pane-board]').click();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const dock = (page: Page) => page.getByRole('complementary', { name: 'Your board' });
const monitor = (page: Page) => dock(page).getByRole('log', { name: 'Board output' });
/** The dock's panel: the computer, the cable and the chip, the board's button and what is happening. */
const panel = (page: Page) => dock(page).locator('[data-dock-panel]');
const panelMessage = (page: Page) => panel(page).locator('[data-dock-message]');
/** The bar under the panel. */
const bar = (page: Page) => dock(page).locator('.bar');

test.describe('the board, from page to page', () => {
  test('stays connected while the visitor reads another page, and the workbench follows it again on return', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await nav(page).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL('/robomania/projects/');
    await page.getByRole('main').getByRole('link', { name: /Blink/ }).click();

    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });
});

test.describe('the board dock', () => {
  test('offers to connect a board on any page, then names its chip and the sketch it runs, linked to its project', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'wait 1000'] });
    await page.goto('/robomania/learn/');
    await expect(dock(page)).toContainText('No board');

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page).getByRole('link', { name: 'Blink · input' })).toHaveAttribute('href', '/robomania/projects/blink/#input');
    await expect(dock(page)).toContainText('ESP32 is running Blink · input');
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAccessibleDescription('wait 1000');
    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeHidden();
    // The dock restarts the board into what it holds, read at the speed every ladder step prints at.
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await dock(page).getByRole('link', { name: 'Blink · input' }).click();
    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
  });

  test('links to the step the board runs, which opens on My board, Live', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await dock(page).getByRole('link', { name: 'Blink · input' }).click();

    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).locator('[data-pane-board]')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  test('opens on My board, Live, at an address that names the step the board runs', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page)).toContainText('Blink · input');

    // A link anywhere on the site, which the router follows as the dock's.
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/robomania/projects/blink/#input';
      link.textContent = 'Blink, input';
      document.querySelector('main')!.append(link);
    });
    await page.getByRole('link', { name: 'Blink, input' }).click();

    await expect(page).toHaveURL('/robomania/projects/blink/#input');
    await expect(page.getByRole('tab', { name: '2 input' })).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).locator('[data-pane-board]')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagWord(page)).toHaveText('Live');
  });

  test('opens a serial monitor with what the board printed, and sends it a line', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH', 'LOW'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).locator('[data-dock-last]')).toHaveText('LOW');

    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAttribute('aria-expanded', 'true');
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');
    await expect(dock(page).getByRole('textbox', { name: 'Line to send to the board' })).toBeFocused();

    await page.keyboard.type('500');
    await page.keyboard.press('Enter');

    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW\n› 500');
    expect(await fakeFlasher.calls()).toContain('send 500');
    await fakeFlasher.print('wait 500');
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW\n› 500\nwait 500');
  });

  test('connects a board without flashing from a page with a sketch, where Flash sits beside Connect board', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH'] });
    await page.goto(BLINK);
    await expect(bar(page).getByRole('button', { name: 'Flash Blink · simple' })).toBeVisible();

    await bar(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page)).toContainText('ESP32 is running Blink · input');
    await expect(bar(page).getByRole('button', { name: 'Connect board' })).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    expect(await fakeFlasher.calls()).not.toContain('write');
  });

  test('offers Connect board as the same round button in the same place with a sketch open or not', async ({ page }) => {
    const connectBoard = () => bar(page).getByRole('button', { name: 'Connect board' });
    await page.goto(BLINK);
    await expect(connectBoard()).toHaveClass(/round/);
    const withSketch = await connectBoard().boundingBox();

    await page.goto('/robomania/learn/');

    await expect(connectBoard()).toHaveClass(/round/);
    await expect(bar(page).locator('[data-dock-action="bar"]')).toHaveAttribute('data-off');
    expect(await connectBoard().boundingBox()).toEqual(withSketch);
  });

  test('clears the serial monitor and goes on showing what the board prints next', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH', 'LOW'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');

    await dock(page).getByRole('button', { name: 'Clear' }).click();

    await expect(monitor(page)).toHaveText('');
    await expect(dock(page)).toContainText('ESP32 is running Blink · input');
    await fakeFlasher.print('HIGH');
    await expect(monitor(page)).toHaveText('HIGH');
  });

  test('says the open Serial button hides the output, and closes the monitor on Close with the focus back on Serial', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    const serial = dock(page).getByRole('button', { name: 'Serial' });
    await expect(serial).toContainText('HIGH');

    await serial.click();
    await expect(serial).toContainText('Hide output');
    await expect(serial.locator('[data-dock-last]')).toBeHidden();
    await dock(page).getByRole('button', { name: 'Close' }).click();

    await expect(monitor(page)).toBeHidden();
    await expect(serial).toHaveAttribute('aria-expanded', 'false');
    await expect(serial).toBeFocused();
    await expect(serial).toContainText('HIGH');
  });

  test('keeps the monitor open and its lines as the visitor moves to another page', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input', 'HIGH'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH');

    await nav(page).getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL('/robomania/library/');
    await fakeFlasher.print('LOW');

    await expect(monitor(page)).toHaveText('sketch blink/input\nHIGH\nLOW');
  });

  test('flashes the sketch the visitor has open, named on its button, and offers none where no sketch is open', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');
    await expect(dock(page).getByRole('button', { name: 'Flash Blink · simple' })).toBeVisible();

    await bench(page).getByRole('tab', { name: /^2 input/ }).click();
    await dock(page).getByRole('button', { name: 'Flash Blink · input' }).click();

    await expect(tagWord(page)).toHaveText('Live');
    expect(await fakeFlasher.loaded()).toEqual([['blink/input/esp32/input.ino.bootloader.bin', 'blink/input/esp32/input.ino.bin']]);
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page).toHaveURL(/\/learn\/$/);
    await expect(dock(page).getByRole('button', { name: /^Flash/ })).toBeHidden();
  });

  test('lets the board go on Disconnect, says it keeps running, and offers to connect again', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('link', { name: 'Blink · input' })).toBeVisible();

    await dock(page).getByRole('button', { name: 'Disconnect' }).click();

    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(dock(page).locator('[data-dock-status]')).toHaveText(
      'Your board is released and runs on.',
    );
    expect((await fakeFlasher.calls()).at(-1)).toBe('disconnect');
  });

  test('says the board on one line, and draws Connect board, Restart board and Disconnect as round icons of one size', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(BLINK);
    const said = dock(page).locator('[data-dock-said]');
    const oneLine = async () => {
      const { height, line } = await said.evaluate((el) => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
      expect(height).toBeLessThanOrEqual(line + 1);
    };
    const size = async (name: string) => {
      const { width, height } = (await bar(page).getByRole('button', { name }).boundingBox())!;
      return { width, height };
    };
    await oneLine();
    const connect = await size('Connect board');
    expect(connect.width).toBe(connect.height);

    await bar(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await oneLine();
    expect(await size('Disconnect')).toEqual(connect);
    expect(await size('Restart board')).toEqual(connect);
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toHaveAttribute('title', 'Disconnect');

    await bar(page).getByRole('button', { name: 'Disconnect' }).click();
    await expect(dock(page).locator('[data-dock-status]')).toHaveText('Your board is released and runs on.');
    await oneLine();
  });

  test('restarts a running board on the open port, staying connected, and writes nothing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('link', { name: 'Blink · input' })).toBeVisible();
    const before = (await fakeFlasher.calls()).length;

    await bar(page).getByRole('button', { name: 'Restart board' }).click();

    await expect.poll(async () => (await fakeFlasher.calls()).slice(before)).toEqual(['restart']);
    await expect(dock(page).getByRole('link', { name: 'Blink · input' })).toBeVisible();
    await expect(dock(page).locator('[data-dock-dot]')).toHaveAttribute('data-tone', 'on');
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await dock(page).getByRole('button', { name: 'Serial' }).click();
    await expect(dock(page).getByRole('log', { name: 'Board output' })).toHaveText('sketch blink/input\nsketch blink/input');
  });

  test('stays at the bottom of the window, over no part of the page at its end', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/robomania/learn/');

    const box = (await dock(page).boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(640);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = (await page.locator('.site-footer').boundingBox())!;
    const end = (await dock(page).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(end.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  test('keeps the Serial button in place and the same width as lines arrive and buttons come and go', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    const serial = dock(page).getByRole('button', { name: 'Serial' });
    const before = (await serial.boundingBox())!;

    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await fakeFlasher.print('distance=182 cm left=0.42 right=0.40 heading=271 battery=7.4V and more besides');
    await expect(serial).toHaveAccessibleDescription(/^distance=182/);

    const after = (await serial.boundingBox())!;
    expect([after.x, after.width]).toEqual([before.x, before.width]);
  });
});

test.describe('the board dock panel', () => {
  test('opens with the progress while it flashes the open sketch, its button in the bar all along, then folds away', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
    await page.goto(BLINK);
    await expect(panel(page)).toBeHidden();
    const serial = bar(page).getByRole('button', { name: 'Serial' });
    const before = (await serial.boundingBox())!;
    const action = await bar(page).locator('[data-dock-action="bar"]').boundingBox();

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panel(page)).toBeVisible();
    expect(await serial.boundingBox()).toEqual(before);
    await expect(panel(page).getByRole('progressbar', { name: 'Flashing' })).toHaveAttribute('aria-valuenow', '40');
    await expect(panelMessage(page)).toHaveText('Found ESP32. Keep the board plugged in.');
    const busy = bar(page).locator('[data-dock-action="bar"]');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');
    await expect(busy).toHaveAccessibleName('Flashing…');
    await expect(busy.locator('[data-action-pct]')).toHaveText('40%');
    await expect(busy).toBeFocused();
    expect(await busy.boundingBox()).toEqual(action);

    await fakeFlasher.release();

    await expect(panel(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(bar(page).getByRole('button', { name: 'Flash Blink · simple' })).toBeFocused();
    await expect(dock(page)).toContainText('ESP32 is running Blink · simple');
    expect(await serial.boundingBox()).toEqual(before);
    expect(await fakeFlasher.loaded()).toEqual([['blink/simple/esp32/simple.ino.bootloader.bin', 'blink/simple/esp32/simple.ino.bin']]);
  });

  test('starts nothing when its button is pressed while it flashes', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ announce: true, progress: [40], hold: true });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();
    const busy = bar(page).locator('[data-dock-action="bar"]');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');
    // Playwright waits for an aria-disabled button to be enabled, so the press is dispatched.
    await busy.dispatchEvent('click');
    await busy.dispatchEvent('click');

    await fakeFlasher.release();
    await expect(panel(page)).toBeHidden();
    expect((await fakeFlasher.calls()).filter((call) => call === 'load')).toHaveLength(1);
  });

  test('says a connection in the bar alone, with its panel shut', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ holdConnect: true });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page)).toContainText('Board is connecting');
    await expect(bar(page).locator('[data-dock-action="bar"]')).toHaveText('Connecting…');
    await expect(panel(page)).toBeHidden();
  });

  test('shows a lost board as its one step, Connect, with no step of a flash', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], monitorEnds: true });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(panelMessage(page)).toContainText('stopped talking');

    await expect(panel(page).locator('[data-connect-step]')).toHaveAttribute('data-mark', 'failed');
    await expect(panel(page).locator('[data-connect-step]')).toHaveText('Connect');
    await expect(panel(page).locator('[data-flash-step]:visible')).toHaveCount(0);
  });

  for (const width of [380, 1100]) {
    test(`puts what to do right beside the step that failed where it is wide, and under it where it is not, at ${width} px`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ failFirst: { connect: 'NotFoundError' } });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(BLINK);

      await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();
      await expect(panelMessage(page)).toContainText('No board was chosen');

      const box = async (selector: string) => (await panel(page).locator(selector).first().boundingBox())!;
      const rail = await box('[data-flash-rail]');
      const words = await box('[data-dock-message]');
      if (width >= 840) {
        expect(words.x).toBeGreaterThanOrEqual(rail.x + rail.width);
        expect(words.x - (rail.x + rail.width)).toBeLessThanOrEqual(40);
      } else {
        expect(words.y).toBeGreaterThanOrEqual(rail.y + rail.height);
      }
      // Find failed, so the rail marks it and nothing after it.
      const marks = await panel(page).locator('[data-flash-step]').evaluateAll((all) => all.map((step) => (step as HTMLElement).dataset.mark));
      expect(marks).toEqual(['failed', 'todo', 'todo']);
      await expect(panel(page).locator('[data-connect-step]')).toBeHidden();
    });

    test(`keeps the bar's button where it is as the session goes from connecting to a failure at ${width} px`, async ({
      page,
      fakeFlasher,
    }) => {
      // esptool-js failing to sync with the bootloader throws a plain error: the board did not answer.
      await fakeFlasher.install({ holdConnect: true, failFirst: { connect: 'Error' } });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(BLINK);
      const action = bar(page).locator('[data-dock-action="bar"]');
      const place = async () => {
        const { x, width, height } = (await action.boundingBox())!;
        const foot = await dock(page).evaluate((element) => element.getBoundingClientRect().bottom);
        const { y } = (await action.boundingBox())!;
        return { x, width, height, fromFoot: Math.round(foot - y) };
      };
      const idle = await place();

      await action.click();
      await expect(action).toHaveText('Connecting…');
      expect(await place()).toEqual(idle);

      await fakeFlasher.release();

      await expect(action).toHaveAccessibleName('Try again');
      await expect(panel(page)).toBeVisible();
      expect(await place()).toEqual(idle);
    });
  }

  test('closes its panel on the cross, and opens it again from Details in the bar', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ failFirst: { connect: 'NotFoundError' } });
    await page.goto(BLINK);
    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();
    await expect(panel(page)).toBeVisible();

    await panel(page).getByRole('button', { name: 'Close details' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Try again' })).toBeVisible();
    const details = bar(page).getByRole('button', { name: 'Details' });
    await expect(details).toBeFocused();

    await details.click();

    await expect(panelMessage(page)).toContainText('No board was chosen');
    await expect(details).toBeHidden();
  });

  test('tries a dropped flash again in one press: it connects, then flashes the open sketch', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, failFirst: { write: 'NetworkError' } });
    await page.goto(BLINK);
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panelMessage(page)).toContainText('The connection dropped');
    await expect(dock(page).locator('.bar').getByRole('button', { name: 'Try again' })).toBeVisible();

    await dock(page).locator('.bar').getByRole('button', { name: 'Try again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(dock(page)).toContainText('ESP32 is running Blink · simple');
    expect((await fakeFlasher.calls()).filter((call) => call === 'write')).toHaveLength(2);
  });

  test('says the board is still in flash mode after the write, and Connect again reads it as it runs', async ({
    page,
    fakeFlasher,
  }) => {
    // An ESP8266 that prints nothing after the write is still in flash mode.
    await fakeFlasher.install({ chip: 'ESP8266' });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(dock(page).locator('.bar').getByRole('button', { name: 'Connect again' })).toBeVisible({ timeout: 10_000 });
    await expect(panelMessage(page)).toContainText('UART');
    await expect(panel(page).locator('[data-hand-hint]')).toHaveAttribute('data-hint', 'uart');

    await dock(page).locator('.bar').getByRole('button', { name: 'Connect again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    expect((await fakeFlasher.calls()).at(-2)).toBe('attach');
  });

  test('draws the switch to PROG beside the words when a picked ESP-01S does not answer', async ({ page, fakeFlasher }) => {
    // esptool-js failing to sync with the bootloader throws a plain error.
    await fakeFlasher.install({ lines: ['led on'], failFirst: { connect: 'Error' } });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('combobox', { name: 'My board' }).selectOption({ label: 'ESP-01S' });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panelMessage(page)).toContainText("Set the adapter's switch to PROG");
    await expect(panel(page).locator('[data-hand-hint]')).toHaveAttribute('data-hint', 'prog');
    await expect(panel(page).locator('[data-hand-hint]')).toBeVisible();
    await expect(dock(page).locator('.bar').getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('tries a failed connect again in one press, which connects and flashes the open sketch', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ announce: true, failFirst: { connect: 'NotFoundError' } });
    await page.goto(BLINK);
    await bench(page).locator('[data-pane-board]').click();

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panelMessage(page)).toHaveText('No board was chosen. Plug it in and press Try again.');
    await expect(panelMessage(page)).toHaveAttribute('data-notice');

    await dock(page).locator('.bar').getByRole('button', { name: 'Try again' }).click();

    await expect(panel(page)).toBeHidden();
    await expect(tagWord(page)).toHaveText('Live');
    expect((await fakeFlasher.calls()).filter((call) => call === 'load')).toHaveLength(1);
  });

  test('announces what it does and why it stopped once each, however many percentages the flash goes through', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ announce: true, progress: [20, 40, 60], monitorEnds: true });
    await page.goto(BLINK);
    await page.evaluate(() => {
      const added: string[] = [];
      (window as unknown as { __messages: string[] }).__messages = added;
      new MutationObserver((records) => {
        for (const record of records) record.addedNodes.forEach((node) => added.push(node.textContent ?? ''));
      }).observe(document.querySelector('[data-dock-message]')!, { childList: true });
    });

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panelMessage(page)).toHaveText('The board stopped talking to the page. Plug it back in and connect again.');
    const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages);
    expect(messages.filter((message) => message === 'Found ESP32. Keep the board plugged in.')).toHaveLength(1);
    expect(messages.filter((message) => message.startsWith('The board stopped'))).toHaveLength(1);
  });

  test('says the board stopped talking once the port is lost, and offers Connect again', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ announce: true, monitorEnds: true });
    await page.goto(BLINK);

    await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();

    await expect(panelMessage(page)).toHaveText('The board stopped talking to the page. Plug it back in and connect again.');
    await expect(dock(page).locator('.bar').getByRole('button', { name: 'Connect again' })).toBeVisible();
    // The bar names the state; what to do is the panel's alone.
    await expect(bar(page).locator('[data-dock-status]')).toHaveText('ESP32 lost the connection');

    await dock(page).locator('.bar').getByRole('button', { name: 'Connect again' }).click();

    // Connect again reads what the board holds: only Flash writes it.
    await expect(dock(page)).toContainText('ESP32 is running Blink · simple');
    expect((await fakeFlasher.calls()).filter((call) => call === 'load')).toHaveLength(1);
  });

  test('names the chips the open sketch has images for when the board has none, until another step is opened', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP32-C3', lines: ['sketch blink/simple'] });
    await page.goto(BLINK);
    await connect(page);
    await bench(page).getByRole('tab', { name: /^2 input/ }).click();

    await dock(page).getByRole('button', { name: 'Flash Blink · input' }).click();

    await expect(panelMessage(page)).toHaveText(
      'This board is an ESP32-C3. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.',
    );
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);

    await bench(page).getByRole('tab', { name: /^3 timer/ }).click();

    await expect(panel(page)).toBeHidden();
  });

  test('names the step it tried to flash when the board has no image of it, after another step is opened', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ chip: 'ESP32-C3' });
    await page.goto(BLINK);
    await bench(page).getByRole('tab', { name: /^2 input/ }).click();
    const said = 'This board is an ESP32-C3. Blink · input has images for: ESP32. Connect an ESP32, or pick another step.';

    await bar(page).getByRole('button', { name: 'Flash Blink · input' }).click();
    await expect(panelMessage(page)).toHaveText(said);
    await bench(page).getByRole('tab', { name: /^3 timer/ }).click();

    await expect(panelMessage(page)).toHaveText(said);
  });

  test('connects without flashing on a page with no sketch open, whatever the last page opened', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/input'] });
    await page.goto(BLINK);
    await expect(bar(page).getByRole('button', { name: 'Flash Blink · simple' })).toBeVisible();
    await nav(page).getByRole('link', { name: 'Learn' }).click();
    await expect(page).toHaveURL(/\/learn\/$/);

    await bar(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page)).toContainText('ESP32 is running Blink · input');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
  });

  for (const width of [860, 1280]) {
    test(`keeps the action, Disconnect and Serial in place on one row at ${width} px as it flashes and runs`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
      await page.setViewportSize({ width, height: 700 });
      await page.goto(BLINK);
      const picker = dock(page).getByRole('combobox', { name: 'My board' });
      /** Where the bar's controls sit, shown or keeping their room, and whether each is on the picker's row. */
      const controls = async () => {
        const row = (await picker.boundingBox())!;
        const boxes = await Promise.all(
          ['[data-dock-action="bar"]', '[data-dock-disconnect]', '[data-dock-serial]'].map((selector) =>
            bar(page)
              .locator(selector)
              .evaluate((element) => {
                const { x, y, width } = element.getBoundingClientRect();
                return { x, y, width };
              }),
          ),
        );
        for (const box of boxes) expect(box.y).toBeLessThan(row.y + row.height);
        return boxes;
      };
      const idle = await controls();

      await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();
      await expect(panel(page)).toBeVisible();
      await expect(bar(page).locator('[data-action-pct]').first()).toHaveText('40%');
      expect(await controls()).toEqual(idle);

      await fakeFlasher.release();
      await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await expect(bar(page).getByRole('button', { name: 'Flash Blink · simple' })).toBeVisible();
      expect(await controls()).toEqual(idle);
    });
  }

  for (const width of [560, 561, 700, 839]) {
    test(`keeps the status in view, the page from scrolling sideways and the controls in place at ${width} px`, async ({
      page,
      fakeFlasher,
    }) => {
      await fakeFlasher.install({ lines: ['sketch blink/simple'], announce: true, progress: [40], hold: true });
      await page.setViewportSize({ width, height: 700 });
      await page.goto(BLINK);
      /** Where the bar's controls sit, shown or keeping their room, after checking the status and the page's width. */
      const controls = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect((await bar(page).locator('[data-dock-status]').boundingBox())!.width).toBeGreaterThan(0);
        return Promise.all(
          ['[data-dock-action="bar"]', '[data-dock-disconnect]', '[data-dock-serial]'].map((selector) =>
            bar(page)
              .locator(selector)
              .evaluate((element) => {
                const { x, y, width } = element.getBoundingClientRect();
                return { x, y, width };
              }),
          ),
        );
      };
      const idle = await controls();

      await bar(page).getByRole('button', { name: 'Flash Blink · simple' }).click();
      await expect(bar(page).locator('[data-action-pct]').first()).toHaveText('40%');
      expect(await controls()).toEqual(idle);

      await fakeFlasher.release();
      await expect(bar(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
      expect(await controls()).toEqual(idle);
    });
  }

  test('shows the whole name of a sketch its bar button cuts on hover', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/flash/#omnidirectional');

    await expect(bar(page).getByRole('button', { name: 'Flash Omnidirectional robot' })).toHaveAttribute(
      'title',
      'Flash Omnidirectional robot',
    );
  });
});

test.describe('the board pick', () => {
  const pick = (page: Page) => dock(page).getByRole('combobox', { name: 'My board' });

  test('is kept from page to page and from visit to visit', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install();
    await page.goto('/robomania/learn/');
    await expect(pick(page)).toHaveValue('');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await nav(page).getByRole('link', { name: 'Projects' }).click();
    await expect(pick(page)).toHaveValue('esp01s');
    await page.reload();
    await expect(pick(page)).toHaveValue('esp01s');
  });

  test('follows the chip that answers without a word when it is not the picked one', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['sketch blink/input'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP32-C3' });

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp32');
    await expect(dock(page).getByRole('status')).toHaveCount(0);
  });

  test('reads a picked ESP-01S as it runs, without asking for flash mode', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP32', lines: ['led on'] });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(dock(page)).toContainText('ESP8266');
    expect(await fakeFlasher.calls()).toEqual(['attach', 'monitor 115200']);
  });

  test('keeps the bar on one row when the picked board needs its adapter set', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 700 });
    await page.goto('/robomania/learn/');
    await pick(page).selectOption({ label: 'ESP-01S' });

    await expect(dock(page)).toContainText('on PROG');
    const picker = await pick(page).boundingBox();
    const connect = await dock(page).getByRole('button', { name: 'Connect board' }).boundingBox();
    const serial = await dock(page).getByRole('button', { name: 'Serial' }).boundingBox();
    for (const button of [connect, serial]) {
      expect(button!.y).toBeLessThan(picker!.y + picker!.height);
    }
  });

  test('takes the board from the chip that answers when none was picked', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ chip: 'ESP8266', lines: ['sketch web-relay'] });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(pick(page)).toHaveValue('esp01s');
  });
});
