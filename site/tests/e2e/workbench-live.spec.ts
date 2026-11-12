import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { lineNumber } from '../../src/lib/workbench/source';
import { HIGH_Y, LOW_Y } from '../../src/lib/workbench/trace';
import { expect, test, type FakeFlasher } from './fake-flasher';

const BLINK = '/robomania/projects/blink/';
const source = (sketch: string) =>
  readFileSync(new URL(`../../../sketches/blink/${sketch}/${sketch}.ino`, import.meta.url), 'utf8');

const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
const status = (page: Page) => bench(page).locator('[data-board-word]');
const boardButton = (page: Page) => bench(page).locator('[data-board-action]');
const picture = (page: Page) => bench(page).locator('[data-picture]');
const watchValue = (page: Page, name: string) => bench(page).locator(`[data-watch-row="${name}"] dd`);
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const toolbar = (page: Page) => bench(page).getByRole('toolbar', { name: 'Debugger' });
const debuggerButton = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const commandLine = (page: Page) => bench(page).getByRole('textbox', { name: 'Line to send to the board' });
const sendButton = (page: Page) => bench(page).getByRole('button', { name: 'Send', exact: true });
const shortcuts = (page: Page) => bench(page).locator('[data-shortcuts]:visible [data-shortcut]');
const notice = (page: Page) => bench(page).locator('[data-other-step]');
const runningRow = (page: Page) => bench(page).locator('[data-code]:visible [data-running]');
const livePill = (page: Page) => bench(page).locator('[data-code]:visible [data-live]');
/** How full the clock on the arrow's line is, from 0 to 100. */
const clockFill = (page: Page) =>
  runningRow(page)
    .locator('[data-pie] .fill')
    .evaluate((fill) => parseFloat(getComputedStyle(fill).strokeDasharray));
const trace = (page: Page) => bench(page).getByRole('img', { name: /^The level of GPIO 2/ });
const tracePath = (page: Page, part: 'sent' | 'applied' | 'level') =>
  trace(page).locator(`[data-trace-${part}]`).getAttribute('d').then((d) => d ?? '');
/** Lets the page paint once while its time is frozen. */
const nextFrame = (page: Page) => page.clock.runFor(20);
/** The level the trace draws at its right edge. */
const levelNow = async (page: Page) => Number([...(await tracePath(page, 'level')).matchAll(/(?:^M0 |V)(\d+)/g)].at(-1)?.[1]);

/** Connects from the `name` tab to a board that prints `sketch <key>` first, then waits for the cell to read `word`. */
async function connectTo(page: Page, fakeFlasher: FakeFlasher, key: string, name: string, word: string) {
  await fakeFlasher.install({ lines: ['', `sketch ${key}`] });
  await page.goto(BLINK);
  await tab(page, name).click();
  await boardButton(page).click();
  await expect(status(page)).toHaveText(word);
}

test.describe('live mode', () => {
  test('follows the board that runs the selected step: the LED, the watch, the trace and the serial output', async ({
    page,
    fakeFlasher,
  }) => {
    await page.clock.install();
    await connectTo(page, fakeFlasher, 'blink/input', '1 simple', 'Runs step 2');

    // Picking the step the board runs follows the board.
    await tab(page, '2 input').click();
    await expect(status(page)).toHaveText('Live');
    await expect(serial(page)).toHaveText('');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);

    await fakeFlasher.print('HIGH');
    await nextFrame(page);
    await expect(picture(page)).toHaveClass(/\bon\b/);
    await expect(watchValue(page, 'LED')).toHaveText('HIGH');
    await expect(serial(page)).toHaveText('HIGH');
    expect(await levelNow(page)).toBe(HIGH_Y);

    await page.clock.runFor(700);
    await fakeFlasher.print('LOW');
    await nextFrame(page);
    await expect(picture(page)).not.toHaveClass(/\bon\b/);
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    // Timed by when the lines arrived.
    await expect(watchValue(page, 'measured')).toHaveText('720 ms');
    await expect(serial(page)).toHaveText('HIGH\nLOW');
    expect(await levelNow(page)).toBe(LOW_Y);

    // The clock on the delay the board waits in fills from the LOW line's arrival over the 1000 ms interval.
    const pie = runningRow(page).locator('[data-pie]');
    await expect(pie).toHaveClass(/\bwaiting\b/);
    await page.clock.runFor(500);
    const fill = await clockFill(page);
    expect(fill).toBeGreaterThan(45);
    expect(fill).toBeLessThan(60);
  });

  test('shows the clock of the delay the board waits in full and still under reduced motion', async ({ page, fakeFlasher }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connectTo(page, fakeFlasher, 'blink/simple', '1 simple', 'Live');

    await fakeFlasher.print('HIGH');

    await expect(runningRow(page).locator('[data-pie]')).toHaveClass(/\bwaiting\b/);
    expect(await clockFill(page)).toBe(100);
  });

  test('writes a typed line to the board, marks it sent, and marks it applied when the board answers it', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await fakeFlasher.print('HIGH');

    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');

    await expect.poll(() => fakeFlasher.calls()).toContain('send 500');
    expect((await fakeFlasher.calls()).filter((call) => call === 'send 500')).toHaveLength(1);
    await expect(serial(page)).toHaveText('sketch blink/input\nHIGH\n› 500');
    await expect(serial(page).locator('[data-sent]')).toHaveText('› 500');
    expect(await tracePath(page, 'sent')).not.toBe('');
    expect(await tracePath(page, 'applied')).toBe('');

    // A line that answers nothing sent leaves the mark yellow.
    await fakeFlasher.print('LOW');
    await expect(serial(page)).toContainText('LOW');
    expect(await tracePath(page, 'applied')).toBe('');

    await fakeFlasher.print('delay 500');
    await expect.poll(() => tracePath(page, 'applied')).not.toBe('');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');
    await expect(livePill(page)).toHaveText('500');
  });

  test('keeps the interval the board announced across Back to live', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    // The sketch line means the board just started, with the interval its source sets.
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await fakeFlasher.print('delay 500');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');

    await debuggerButton(page, 'Pause').click();
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await boardButton(page).click();

    await expect(boardButton(page)).toHaveAccessibleName('Flash again');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');
    await expect(livePill(page)).toHaveText('500');
  });

  test('shows the interval as unknown, in the watch and the code, until the board announces it', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await debuggerButton(page, 'Pause').click();
    // The board restarts while the simulator has the pane: the page did not see what it did since.
    await fakeFlasher.print('', 'sketch blink/input', 'HIGH');
    await boardButton(page).click();

    await expect(watchValue(page, 'wait')).toHaveText('…');
    await expect(livePill(page)).toHaveText('…');
    // The arrow is placed, but how far along the wait is cannot be told.
    await fakeFlasher.print('LOW');
    await expect(runningRow(page)).toHaveCount(1);
    await expect(bench(page).locator('[data-pie].waiting')).toHaveCount(0);
    await fakeFlasher.print('delay 700');
    await expect(watchValue(page, 'wait')).toHaveText('700 ms');
    await expect(livePill(page)).toHaveText('700');
  });

  test('shows the interval simple fixes in its source', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/simple', '1 simple', 'Live');
    await debuggerButton(page, 'Pause').click();
    await fakeFlasher.print('sketch blink/simple');
    await boardButton(page).click();

    await expect(watchValue(page, 'wait')).toHaveText('1000 ms (fixed)');
  });

  test('writes the shortcuts to the board', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/commands', '4 commands', 'Live');

    await bench(page).getByRole('button', { name: 'pause', exact: true }).click();

    await expect.poll(() => fakeFlasher.calls()).toContain('send pause');
    await expect(serial(page).locator('[data-sent]')).toHaveText('› pause');
  });

  for (const [key, wait] of [
    ['simple', 'delay(1000);'],
    ['input', 'delay(blinkDelay);'],
  ] as const) {
    test(`on ${key}, puts the arrow on the delay after the LED write that HIGH or LOW announced`, async ({
      page,
      fakeFlasher,
    }) => {
      await connectTo(page, fakeFlasher, `blink/${key}`, key === 'simple' ? '1 simple' : '2 input', 'Live');
      await expect(runningRow(page)).toHaveCount(0);

      await fakeFlasher.print('HIGH');
      await expect(runningRow(page)).toHaveAttribute('data-line', String(lineNumber(source(key), wait, 1)));
      await fakeFlasher.print('LOW');
      await expect(runningRow(page)).toHaveAttribute('data-line', String(lineNumber(source(key), wait, 2)));
    });
  }

  for (const key of ['timer', 'commands'] as const) {
    test(`on ${key}, whose lines do not tell where the board is, shows no arrow`, async ({ page, fakeFlasher }) => {
      await connectTo(page, fakeFlasher, `blink/${key}`, key === 'timer' ? '3 timer' : '4 commands', 'Live');
      await fakeFlasher.print('HIGH');
      await expect(watchValue(page, 'LED')).toHaveText('HIGH');
      await expect(runningRow(page)).toHaveCount(0);
    });
  }

  test('turns Slow off and disables it, and gives the simulator its Slow back after the visitor pauses', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');

    await expect(debuggerButton(page, 'Slow')).toBeDisabled();
    await expect(debuggerButton(page, 'Slow')).toHaveAttribute('aria-pressed', 'false');
    await expect(debuggerButton(page, 'Pause')).toBeEnabled();
    await expect(debuggerButton(page, 'Step')).toBeEnabled();
    await expect(debuggerButton(page, 'Restart')).toBeEnabled();

    await debuggerButton(page, 'Pause').click();

    await expect(debuggerButton(page, 'Slow')).toBeEnabled();
    await expect(debuggerButton(page, 'Slow')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('a board that runs another step', () => {
  test('reads Runs step 1, names both keys, disables the Send area and the debugger, and shows the board', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/simple', '2 input', 'Runs step 1');

    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toHaveText('Your board runs blink/simple. Flash blink/input to control it from here.');
    await expect(commandLine(page)).toBeDisabled();
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'the board runs another step');
    await expect(sendButton(page)).toBeDisabled();
    for (const control of await shortcuts(page).all()) await expect(control).toBeDisabled();
    for (const name of ['Pause', 'Step', 'Restart', 'Slow']) await expect(debuggerButton(page, name)).toBeDisabled();

    await fakeFlasher.print('HIGH');
    await expect(picture(page)).toHaveClass(/\bon\b/);
    await expect(serial(page)).toHaveText('sketch blink/simple\nHIGH');
    await expect(runningRow(page)).toHaveCount(0);
    expect(await fakeFlasher.calls()).not.toContainEqual(expect.stringMatching(/^send /));
  });

  for (const width of [1280, 400]) {
    test(`shows the notice in the hint's place, moving nothing, at ${width} px`, async ({ page, fakeFlasher }) => {
      await page.setViewportSize({ width, height: 900 });
      await fakeFlasher.install({ lines: ['sketch blink/simple'] });
      await page.goto(BLINK);
      await tab(page, '2 input').click();
      const hint = bench(page).locator('[data-hint]:visible');
      const boxes = async () => ({
        bench: await bench(page).boundingBox(),
        say: await bench(page).locator('[data-say]').boundingBox(),
        term: await bench(page).locator('.term').boundingBox(),
      });
      const before = await boxes();
      await expect(hint).toBeVisible();

      await boardButton(page).click();
      await expect(status(page)).toHaveText('Runs step 1');

      await expect(notice(page)).toBeVisible();
      await expect(hint).toBeHidden();
      expect(await boxes()).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      // The whole placeholder shows.
      const room = await commandLine(page).evaluate((input: HTMLInputElement) => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontSize} ${style.fontFamily}`;
        const free = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return free - context.measureText(input.placeholder).width;
      });
      expect(room).toBeGreaterThan(0);
    });
  }

  test('gives the Send area back and hides the notice once the visitor picks the step the board runs', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/commands', '2 input', 'Runs step 4');

    await tab(page, '4 commands').click();

    await expect(status(page)).toHaveText('Live');
    await expect(notice(page)).toBeHidden();
    await expect(commandLine(page)).toBeEnabled();
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'a command, then Enter');
    for (const control of await shortcuts(page).all()) await expect(control).toBeEnabled();
  });
});

test.describe('back to live', () => {
  for (const pressed of ['Pause', 'Step', 'Restart'] as const) {
    test(`${pressed} while live hands the pane to the simulator at the first line, and Back to live follows the board again`, async ({
      page,
      fakeFlasher,
    }) => {
      await page.clock.install();
      await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
      await fakeFlasher.print('HIGH');
      await nextFrame(page);
      await expect(watchValue(page, 'LED')).toHaveText('HIGH');

      await debuggerButton(page, pressed).click();
      await nextFrame(page);

      await expect(boardButton(page)).toHaveAccessibleName('Back to live');
      await expect(boardButton(page).locator('.i-back')).toBeVisible();
      await expect(status(page)).toHaveText('Live');
      await expect(runningRow(page)).toHaveAttribute(
        'data-line',
        String(lineNumber(source('input'), 'Serial.begin(115200);')),
      );
      // Pause and Step leave the simulator paused; Restart, as in the simulator, keeps it running.
      await expect(debuggerButton(page, pressed === 'Restart' ? 'Pause' : 'Continue')).toBeVisible();
      await expect(watchValue(page, 'LED')).toHaveText('LOW');
      await expect(serial(page)).toHaveText('');

      // The board's lines go on arriving but are not shown while the simulator has the pane.
      await fakeFlasher.print('LOW', 'HIGH');
      await nextFrame(page);
      await expect(serial(page)).not.toContainText('HIGH');

      await boardButton(page).click();
      await nextFrame(page);

      await expect(boardButton(page)).toHaveAccessibleName('Flash again');
      await expect(debuggerButton(page, 'Slow')).toBeDisabled();
      await fakeFlasher.print('LOW', 'HIGH');
      await nextFrame(page);
      await expect(serial(page)).toHaveText('LOW\nHIGH');
      await expect(watchValue(page, 'LED')).toHaveText('HIGH');
      // The port stayed open throughout.
      expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
    });
  }

  test('a tab pick drops the simulator and follows the board again', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await debuggerButton(page, 'Pause').click();
    await expect(boardButton(page)).toHaveAccessibleName('Back to live');

    await tab(page, '1 simple').click();
    await tab(page, '2 input').click();

    await expect(boardButton(page)).toHaveAccessibleName('Flash again');
    await fakeFlasher.print('HIGH');
    await expect(serial(page)).toHaveText('HIGH');
  });
});
