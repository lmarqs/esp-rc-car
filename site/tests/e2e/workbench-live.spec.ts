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
/** The word on the board pane's frame, which names what the pane shows. */
const tagWord = (page: Page) => bench(page).locator('[data-tag-word]');
/** The frame's tag: the word and the sentence that says more. */
const tag = (page: Page) => bench(page).locator('[data-pane-tag]');
const simulatorButton = (page: Page) => bench(page).locator('[data-pane-simulator]');
const myBoardButton = (page: Page) => bench(page).locator('[data-pane-board]');
/** The My board view's button, which connects the board or flashes the step. */
const boardButton = (page: Page) => bench(page).locator('[data-board-action]');
const picture = (page: Page) => bench(page).locator('[data-picture]');
const watchValue = (page: Page, name: string) => bench(page).locator(`[data-watch-row="${name}"] dd`);
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const toolbar = (page: Page) => bench(page).getByRole('toolbar', { name: 'Debugger' });
const debuggerButton = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const commandLine = (page: Page) => bench(page).getByRole('textbox', { name: 'Line to send to the board' });
const sendButton = (page: Page) => bench(page).getByRole('button', { name: 'Send', exact: true });
const shortcuts = (page: Page) => bench(page).locator('[data-shortcuts]:visible [data-shortcut]');
const runningRow = (page: Page) => bench(page).locator('[data-code]:visible [data-running]');
const livePill = (page: Page) => bench(page).locator('[data-code]:visible [data-live="blinkDelay"]');
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
const levelNow = async (page: Page) =>
  Number([...(await tracePath(page, 'level')).matchAll(/(?:^M[\d.]+ |V)(\d+)/g)].at(-1)?.[1]);

/** Opens My board and connects the board from its view. */
async function connect(page: Page) {
  await myBoardButton(page).click();
  await boardButton(page).click();
}

/**
 * Connects under My board from the `name` tab to a board that prints `sketch <key>` first, then waits for the frame's
 * tag to read `shown`, such as `Live` or `Runs input`.
 */
/** Connects a board that runs `key` on the step tab `name`; with `slow`, turns Slow on first, as the visitor can. */
async function connectTo(page: Page, fakeFlasher: FakeFlasher, key: string, name: string, shown: string, slow = false) {
  await fakeFlasher.install({ lines: ['', `sketch ${key}`] });
  await page.goto(BLINK);
  await tab(page, name).click();
  if (slow) await debuggerButton(page, 'Slow').click();
  await connect(page);
  await expect(tag(page)).toContainText(shown);
}

test.describe('live mode', () => {
  test('follows the board that runs the selected step: the LED, the watch, the trace and the serial output', async ({
    page,
    fakeFlasher,
  }) => {
    await page.clock.install();
    await connectTo(page, fakeFlasher, 'blink/input', '1 simple', 'Runs input');

    // Picking the step the board runs follows the board.
    await tab(page, '2 input').click();
    await expect(tagWord(page)).toHaveText('Live');
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

  test('keeps the interval the board announced across My board', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    // The sketch line means the board just started, with the interval its source sets.
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await fakeFlasher.print('delay 500');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');

    await debuggerButton(page, 'Pause').click();
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await myBoardButton(page).click();

    await expect(tagWord(page)).toHaveText('Live');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');
    await expect(livePill(page)).toHaveText('500');
  });

  test(`takes the source's interval once the board restarts while the simulator has the pane`, async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await fakeFlasher.print('delay 500');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');
    await debuggerButton(page, 'Pause').click();
    // A restart wipes what was sent before, and lines sent meanwhile went to the simulator.
    await fakeFlasher.print('', 'sketch blink/input', 'HIGH');
    await myBoardButton(page).click();

    await expect(tagWord(page)).toHaveText('Live');
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await expect(livePill(page)).toHaveText('1000');
  });

  test('counts the answer the board printed while the simulator had the pane', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');
    await expect.poll(() => fakeFlasher.calls()).toContain('send 500');

    await debuggerButton(page, 'Pause').click();
    await fakeFlasher.print('LOW', 'delay 500', 'HIGH');
    await expect(serial(page)).not.toContainText('delay 500');
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await myBoardButton(page).click();

    await expect(tagWord(page)).toHaveText('Live');
    await expect(watchValue(page, 'wait')).toHaveText('500 ms');
    await expect(livePill(page)).toHaveText('500');
  });

  test('shows the interval simple fixes in its source', async ({ page, fakeFlasher }) => {
    await connectTo(page, fakeFlasher, 'blink/simple', '1 simple', 'Live');
    await debuggerButton(page, 'Pause').click();
    await fakeFlasher.print('sketch blink/simple');
    await myBoardButton(page).click();

    await expect(watchValue(page, 'wait')).toHaveText('1000 ms (fixed)');
  });

  test('takes back a line the port refused, and says the board did not get it', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['', 'sketch blink/input'], failFirst: { send: 'NetworkError' } });
    await page.goto(BLINK);
    await tab(page, '2 input').click();
    await connect(page);
    await expect(tagWord(page)).toHaveText('Live');

    const heightBefore = (await bench(page).boundingBox())!.height;
    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');

    const problem = bench(page).locator('[data-problem]');
    await expect(problem).toHaveText('The board did not get 500. Check that it is still plugged in, then send it again.');
    // The problem takes the hint's place, so the workbench keeps its size.
    await expect(bench(page).locator('[data-hint]:not([hidden])')).toHaveCSS('visibility', 'hidden');
    expect((await bench(page).boundingBox())!.height).toBe(heightBefore);
    await expect(serial(page).locator('[data-sent]')).toHaveCount(0);
    expect(await tracePath(page, 'sent')).toBe('');

    await commandLine(page).fill('600');
    await commandLine(page).press('Enter');
    await expect(serial(page).locator('[data-sent]')).toHaveText('› 600');
    await expect(problem).toBeHidden();
  });

  test('while the board prints nothing, leaves the code, watch, output, tag and alert unwritten', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['', 'sketch blink/input', 'delay 700'], failFirst: { send: 'NetworkError' } });
    await page.goto(BLINK);
    await tab(page, '2 input').click();
    await connect(page);
    await expect(watchValue(page, 'wait')).toHaveText('700 ms');
    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');
    await expect(bench(page).locator('[data-problem]')).toBeVisible();

    const changes = await bench(page).evaluate(async (workbench) => {
      const seen: string[] = [];
      const watched = ['[data-serial]', '.watch', '[data-problem]', '[data-pane-tag]', '[data-code]:not([hidden])'];
      const observer = new MutationObserver((records) => {
        for (const record of records) seen.push((record.target as Element).nodeName ?? 'text');
      });
      for (const selector of watched) {
        observer.observe(workbench.querySelector(selector)!, { subtree: true, childList: true, characterData: true });
      }
      await new Promise((done) => setTimeout(done, 500));
      observer.disconnect();
      return seen;
    });

    expect(changes).toEqual([]);
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

  test('drops a line a chip is typing when the board turns out to run another step', async ({ page, fakeFlasher }) => {
    await page.clock.install();
    await connectTo(page, fakeFlasher, 'blink/commands', '4 commands', 'Live');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);

    await bench(page).getByRole('button', { name: 'pause', exact: true }).click();
    await page.clock.runFor(60);
    await expect(commandLine(page)).toHaveAttribute('data-typing', '');
    await fakeFlasher.print('', 'sketch blink/simple');
    await expect(tag(page)).toHaveText('My board Runs simple');
    await page.clock.runFor(2000);

    await expect(commandLine(page)).toHaveValue('');
    expect(await fakeFlasher.calls()).not.toContain('send pause');
    await expect(serial(page).locator('[data-sent]')).toHaveCount(0);
  });

  test('moves the focus from the command line to the My board view as the terminal goes inert', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await commandLine(page).fill('5');
    await expect(commandLine(page)).toBeFocused();

    await fakeFlasher.print('sketch blink/commands');

    await expect(bench(page).locator('[data-terminal]')).toHaveJSProperty('inert', true);
    await expect(boardButton(page)).toHaveAccessibleName('Flash input to board');
    await expect(boardButton(page)).toBeFocused();
  });

  test('drops a line a chip is typing when the visitor pauses, rather than sending it to the simulator', async ({
    page,
    fakeFlasher,
  }) => {
    await page.clock.install();
    await connectTo(page, fakeFlasher, 'blink/commands', '4 commands', 'Live');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);

    await bench(page).getByRole('button', { name: 'pause', exact: true }).click();
    await page.clock.runFor(60);
    await debuggerButton(page, 'Pause').click();
    await page.clock.runFor(2000);

    await expect(commandLine(page)).toHaveValue('');
    await expect(serial(page).locator('[data-sent]')).toHaveCount(0);
    expect(await fakeFlasher.calls()).not.toContain('send pause');
  });

  test('turns Slow off and disables it, and gives the simulator its Slow back after the visitor pauses', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live', true);

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
  test('Simulator simulates the selected step beside it with every control on, and sends nothing to the board', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/simple', '2 input', 'Runs simple');
    await simulatorButton(page).click();
    await expect(tagWord(page)).toHaveText('Simulated');

    await expect(commandLine(page)).toBeEnabled();
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'a number, then Enter');
    await expect(sendButton(page)).toBeEnabled();
    for (const control of await shortcuts(page).all()) await expect(control).toBeEnabled();
    for (const name of ['Pause', 'Step', 'Restart', 'Slow']) await expect(debuggerButton(page, name)).toBeEnabled();

    await fakeFlasher.print('HIGH');
    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');
    await expect(serial(page)).not.toContainText('sketch blink/simple');
    expect(await fakeFlasher.calls()).not.toContainEqual(expect.stringMatching(/^send /));
  });

  test('Flash step puts the selected step on the board and follows it live, with the Send area back', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['', 'sketch blink/simple'], announce: true });
    await page.goto(BLINK);
    await tab(page, '2 input').click();
    await connect(page);
    await expect(tag(page)).toHaveText('My board Runs simple');

    await boardButton(page).click();

    await expect(tagWord(page)).toHaveText('Live');
    await expect(bench(page).getByRole('button', { name: 'Flash again' })).toHaveCount(0);
    await expect(commandLine(page)).toBeEnabled();
    await expect(serial(page)).toHaveText('sketch blink/input');
    await fakeFlasher.print('HIGH');
    await expect(serial(page)).toHaveText('sketch blink/input\nHIGH');
    await commandLine(page).fill('500');
    await commandLine(page).press('Enter');
    await expect.poll(() => fakeFlasher.calls()).toEqual([
      'connect',
      'monitor 115200',
      'connect reuse',
      'load',
      'write',
      'monitor 115200',
      'send 500',
    ]);
  });

  test('follows the board, Live, once the visitor picks the step the board runs', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/commands', '2 input', 'Runs commands');

    await tab(page, '4 commands').click();

    await expect(tagWord(page)).toHaveText('Live');
    await expect(commandLine(page)).toBeEnabled();
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'a command, then Enter');
    for (const control of await shortcuts(page).all()) await expect(control).toBeEnabled();
  });
});

test.describe('back to the board', () => {
  for (const pressed of ['Pause', 'Step', 'Restart'] as const) {
    test(`${pressed} while live presses Simulator, at the first line, and My board follows the board again`, async ({
      page,
      fakeFlasher,
    }) => {
      await page.clock.install();
      await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live', true);
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
      await fakeFlasher.print('HIGH');
      await nextFrame(page);
      await expect(watchValue(page, 'LED')).toHaveText('HIGH');

      await debuggerButton(page, pressed).click();
      await nextFrame(page);

      await expect(simulatorButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(myBoardButton(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(tagWord(page)).toHaveText('Simulated');
      await expect(tag(page)).toHaveText('Simulated Running in the browser; your board runs this step under My board');
      await expect(runningRow(page)).toHaveAttribute(
        'data-line',
        String(lineNumber(source('input'), 'output.begin("blink/input");')),
      );
      // Pause and Step leave the simulator paused; Restart, as in the simulator, keeps it running.
      await expect(debuggerButton(page, pressed === 'Restart' ? 'Pause' : 'Continue')).toBeVisible();
      await expect(watchValue(page, 'LED')).toHaveText('LOW');
      await expect(serial(page)).toHaveText('');

      // The board's lines go on arriving but are not shown while the simulator has the pane.
      await fakeFlasher.print('LOW', 'HIGH');
      await nextFrame(page);
      await expect(serial(page)).not.toContainText('HIGH');

      await myBoardButton(page).click();
      await nextFrame(page);

      await expect(tag(page)).toHaveText('Live Drawn from what your board prints');
      await expect(debuggerButton(page, 'Slow')).toBeDisabled();
      await fakeFlasher.print('LOW', 'HIGH');
      await nextFrame(page);
      await expect(serial(page)).toHaveText('LOW\nHIGH');
      await expect(watchValue(page, 'LED')).toHaveText('HIGH');
      // The port stayed open throughout.
      expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200']);
    });
  }

  const waits = [
    {
      name: 'with no board',
      async open(page: Page, fakeFlasher: FakeFlasher) {
        await fakeFlasher.install();
        await page.goto(BLINK);
        await tab(page, '2 input').click();
        await debuggerButton(page, 'Slow').click();
        await myBoardButton(page).click();
        await expect(tag(page)).toHaveText('My board Not connected');
      },
    },
    {
      name: 'with the board on another step',
      open: (page: Page, fakeFlasher: FakeFlasher) =>
        connectTo(page, fakeFlasher, 'blink/commands', '2 input', 'Runs commands', true),
    },
  ];
  for (const pressed of ['Pause', 'Step', 'Restart'] as const) {
    for (const waiting of waits) {
      test(`${pressed} while My board waits ${waiting.name} presses Simulator, at the first line`, async ({
        page,
        fakeFlasher,
      }) => {
        await page.clock.install();
        await waiting.open(page, fakeFlasher);
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);

        await debuggerButton(page, pressed).click();
        await nextFrame(page);

        await expect(simulatorButton(page)).toHaveAttribute('aria-pressed', 'true');
        await expect(myBoardButton(page)).toHaveAttribute('aria-pressed', 'false');
        await expect(tagWord(page)).toHaveText('Simulated');
        await expect(picture(page)).toBeVisible();
        await expect(runningRow(page)).toHaveAttribute(
          'data-line',
          String(lineNumber(source('input'), 'output.begin("blink/input");')),
        );
        await expect(debuggerButton(page, pressed === 'Restart' ? 'Pause' : 'Continue')).toBeVisible();
        await expect(serial(page)).toHaveText('');
      });
    }
  }

  test('a tab pick keeps the simulator the visitor chose, and My board follows the board again', async ({
    page,
    fakeFlasher,
  }) => {
    await connectTo(page, fakeFlasher, 'blink/input', '2 input', 'Live');
    await debuggerButton(page, 'Pause').click();
    await expect(tagWord(page)).toHaveText('Simulated');

    await tab(page, '1 simple').click();
    await tab(page, '2 input').click();

    await expect(tagWord(page)).toHaveText('Simulated');
    await myBoardButton(page).click();
    await expect(tagWord(page)).toHaveText('Live');
    await fakeFlasher.print('HIGH');
    await expect(serial(page)).toHaveText('HIGH');
  });
});
