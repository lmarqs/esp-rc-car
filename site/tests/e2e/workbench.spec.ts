import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { lineNumber, newLines } from '../../src/lib/workbench/source';
import { blinkSteps } from '../../src/lib/workbench/steps/blink';
import { SERIAL_LINES } from '../../src/components/workbench/view';

const BLINK = '/robomania/projects/blink/';
const source = (sketch: string) => readFileSync(new URL(`../../../${sketch}/${sketch.split('/').at(-1)}.ino`, import.meta.url), 'utf8');

const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
const visibleCode = (page: Page) => bench(page).locator('[data-code]:visible');
const watchNames = (page: Page) => bench(page).locator('.watch div:visible dt');
const watchValue = (page: Page, name: string) => bench(page).locator(`[data-watch-row="${name}"] dd`);
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const toolbar = (page: Page) => bench(page).getByRole('toolbar', { name: 'Debugger' });
const button = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const commandLine = (page: Page) => bench(page).getByRole('textbox', { name: 'Line to send to the board' });
const sendButton = (page: Page) => bench(page).getByRole('button', { name: 'Send', exact: true });
const sentLines = (page: Page) => serial(page).locator('[data-sent]');
const runningLine = (page: Page) => runningRow(page).getAttribute('data-line').then(Number);
const runningRow = (page: Page) => visibleCode(page).locator('[data-running]');
const clockFill = (row: Locator) =>
  row.locator('[data-pie] .fill').evaluate((fill) => parseFloat(getComputedStyle(fill).strokeDasharray));

/** Stops the page's time from flowing on its own, then moves it on until the arrow is on `line`. */
async function freezeUntilRunning(page: Page, line: number) {
  // Far enough ahead that the page time, which flows until then, has not passed it yet.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  for (let i = 0; i < 100 && (await runningRow(page).getAttribute('data-line')) !== String(line); i++) {
    await page.clock.runFor(50);
  }
  await expect(runningRow(page)).toHaveAttribute('data-line', String(line));
}

/** The line numbers of `sketch`'s lines whose text is `text`, in order. */
const linesOf = (sketch: string, text: string) =>
  source(sketch)
    .split('\n')
    .flatMap((line, index) => (line.trim() === text ? [index + 1] : []));

test.describe('the Blink workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto(BLINK);
  });

  test('takes the place of the Try it example', async ({ page }) => {
    await expect(bench(page)).toBeVisible();
    await expect(page.getByText('Try it', { exact: true })).toHaveCount(0);
  });

  test('has one tab per step with its number, id and idea, the first selected', async ({ page }) => {
    const tabs = bench(page).getByRole('tablist', { name: 'Steps' }).getByRole('tab');
    const names = [
      '1 simple Blink with delay()',
      '2 input Set the delay from serial',
      '3 timer Blink without delay()',
      '4 commands Named commands: pause and run',
    ];
    await expect(tabs).toHaveCount(names.length);
    for (const [index, name] of names.entries()) await expect(tabs.nth(index)).toHaveAccessibleName(name);
    await expect(tab(page, '1 simple')).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).getByRole('tabpanel')).toHaveAccessibleName(/1 simple/);
  });

  for (const [index, step] of blinkSteps.entries()) {
    const id = step.key.split('/')[1];
    test(`the ${id} tab shows its file, path, whole .ino, hint and shortcuts`, async ({ page }) => {
      await tab(page, `${index + 1} ${id}`).click();

      await expect(tab(page, `${index + 1} ${id}`)).toHaveAttribute('aria-selected', 'true');
      await expect(bench(page).locator('.edtab:visible')).toHaveText(`${id}.ino`);
      await expect(bench(page).locator('.crumbs:visible')).toHaveText(`sketches › blink › ${id} › ${id}.ino`);
      const lines = source(step.sketch).replace(/\n$/, '').split('\n');
      await expect(visibleCode(page).locator('.ln')).toHaveCount(lines.length);
      await expect(visibleCode(page).locator('.ln > span')).toHaveText(lines.map((line) => line.trim()));
      await expect(bench(page).locator('[data-hint]:visible')).toHaveText(step.hint);
      await expect(bench(page).locator('[data-shortcuts]')).toHaveAttribute(
        'data-shortcuts',
        step.shortcuts.map((shortcut) => (shortcut.kind === 'chip' ? shortcut.text : shortcut.label)).join(' '),
      );
    });
  }

  test('tints the lines new in a step yellow and shows grey line numbers on the code background', async ({ page }) => {
    await expect(visibleCode(page).locator('.ln.new')).toHaveCount(0);

    await tab(page, '2 input').click();
    const added = newLines(source('sketches/blink/simple'), source('sketches/blink/input'));
    expect(added.length).toBeGreaterThan(0);
    const fresh = visibleCode(page).locator('.ln.new');
    await expect(fresh).toHaveCount(added.length);
    expect(await fresh.evaluateAll((rows) => rows.map((row) => Number((row as HTMLElement).dataset.line)))).toEqual(
      added,
    );
    await expect(fresh.first()).toHaveCSS('background-color', 'rgb(255, 247, 214)');

    const plain = visibleCode(page).locator('.ln:not(.new)').first();
    await expect(plain).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(plain.locator('i')).toHaveCSS('color', 'rgb(169, 179, 189)');
    await expect(plain.locator('i')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bench(page).locator('.code')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bench(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('shows the watch fields each step has', async ({ page }) => {
    await expect(watchNames(page)).toHaveText(['LED', 'wait', 'measured']);
    await tab(page, '2 input').click();
    await expect(watchNames(page)).toHaveText(['LED', 'wait', 'measured']);
    await tab(page, '3 timer').click();
    await expect(watchNames(page)).toHaveText(['LED', 'wait', 'measured', 'millis()']);
    await tab(page, '4 commands').click();
    await expect(watchNames(page)).toHaveText(['LED', 'wait', 'measured', 'millis()', 'paused']);
    await expect(watchValue(page, 'paused')).toHaveText('false');
  });

  test('opens running the selected step, slowly enough to follow', async ({ page }) => {
    const simple = source('sketches/blink/simple');
    await expect(visibleCode(page).locator('[data-running]')).toHaveAttribute(
      'data-line',
      String(lineNumber(simple, 'Serial.begin(115200);')),
    );
    await expect(serial(page)).toHaveText('');

    await page.clock.runFor(1600);
    await expect(serial(page)).toContainText('sketch blink/simple');
    await expect(serial(page)).not.toContainText('HIGH');
    await expect(watchValue(page, 'LED')).toHaveText('LOW');

    // Each line rests 500 ms in slow mode, and the LED changes at led.write, one line after the print.
    await page.clock.runFor(1000);
    await expect(serial(page)).toContainText('HIGH');
    await expect(watchValue(page, 'LED')).toHaveText('LOW');

    await page.clock.runFor(500);
    await expect(watchValue(page, 'LED')).toHaveText('HIGH');
    await expect(bench(page).locator('[data-picture]')).toHaveClass(/\bon\b/);
    await expect(watchValue(page, 'measured')).toHaveText('…');

    await page.clock.runFor(2000);
    await expect(serial(page)).toContainText('LOW');
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('1000 ms');
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms (fixed)');
  });

  test('starts the picked step afresh', async ({ page }) => {
    await page.clock.runFor(3000);
    await expect(serial(page)).toContainText('sketch blink/simple');

    await tab(page, '3 timer').click();
    await expect(serial(page)).toHaveText('');
    await expect(watchValue(page, 'millis()')).toHaveText('0');
    await page.clock.runFor(1600);
    await expect(serial(page)).toContainText('sketch blink/timer');
    await expect(serial(page)).not.toContainText('sketch blink/simple');
  });

  test('marks the running line with a coral tint, a coral bar and an arrow', async ({ page }) => {
    const row = runningRow(page);
    await expect(row).toHaveCount(1);
    await expect(row).toHaveCSS('background-color', 'rgb(251, 224, 214)');
    await expect(row).toHaveCSS('border-left-color', 'rgb(226, 96, 58)');
    const arrows = await visibleCode(page)
      .locator('.ln .pc')
      .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell, '::before').content));
    expect(arrows.filter((content) => content === '"▶"')).toHaveLength(1);
    expect(await row.locator('.pc').evaluate((cell) => getComputedStyle(cell, '::before').content)).toBe('"▶"');
  });

  test('ends each delay( line with a clock that is empty when idle and fills while it waits', async ({ page }) => {
    const delays = linesOf('sketches/blink/simple', 'delay(1000);');
    const pies = visibleCode(page).locator('.ln:has([data-pie])');
    await expect(pies).toHaveCount(delays.length);
    expect(await pies.evaluateAll((rows) => rows.map((row) => Number((row as HTMLElement).dataset.line)))).toEqual(delays);
    for (const at of delays) expect(await clockFill(visibleCode(page).locator(`[data-line="${at}"]`))).toBe(0);

    await freezeUntilRunning(page, delays[0]);
    const waiting = visibleCode(page).locator(`[data-line="${delays[0]}"] [data-pie]`);
    await expect(waiting).toHaveClass(/\bwaiting\b/);
    const early = await clockFill(runningRow(page));
    // The wait lasts 1000 ms, so 300 ms fill 30 of the clock's 100.
    await page.clock.runFor(300);
    const later = await clockFill(runningRow(page));
    expect(later - early).toBeGreaterThan(28);
    expect(later - early).toBeLessThan(32);
    expect(await clockFill(visibleCode(page).locator(`[data-line="${delays[1]}"]`))).toBe(0);

    await page.clock.runFor(1000);
    await expect(runningRow(page)).not.toHaveAttribute('data-line', String(delays[0]));
    await expect(waiting).not.toHaveClass(/\bwaiting\b/);
    expect(await clockFill(visibleCode(page).locator(`[data-line="${delays[0]}"]`))).toBe(0);
  });

  test('shows the clock of a waiting line full and still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const [delay] = linesOf('sketches/blink/simple', 'delay(1000);');
    await freezeUntilRunning(page, delay);
    await expect(runningRow(page).locator('[data-pie]')).toHaveClass(/\bwaiting\b/);
    const first = await clockFill(runningRow(page));
    await page.clock.runFor(300);
    expect(await clockFill(runningRow(page))).toBe(first);
    expect(first).toBe(100);
  });

  test('has a joined Pause, Step and Restart group and a separate Slow toggle in the editor tab row', async ({
    page,
  }) => {
    await expect(bench(page).locator('.edhead [role="toolbar"]')).toHaveCount(1);
    const names = ['Pause', 'Step', 'Restart', 'Slow'];
    await expect(toolbar(page).getByRole('button')).toHaveText(names);
    for (const name of names) await expect(button(page, name).locator('svg:visible')).toHaveCount(1);

    const [pause, step, restart, slow] = await Promise.all(names.map((name) => button(page, name).boundingBox()));
    expect(Math.abs(step!.x - (pause!.x + pause!.width))).toBeLessThan(1);
    expect(Math.abs(restart!.x - (step!.x + step!.width))).toBeLessThan(1);
    expect(slow!.x - (restart!.x + restart!.width)).toBeGreaterThan(4);
  });

  test('turns Pause into a green-play Continue of the same width, and back', async ({ page }) => {
    const pause = button(page, 'Pause');
    const before = await pause.boundingBox();
    await expect(pause.locator('.i-pause')).toBeVisible();
    await pause.click();

    const resume = button(page, 'Continue');
    await expect(resume).toBeVisible();
    await expect(resume.locator('.i-pause')).toBeHidden();
    await expect(resume.locator('.i-play')).toBeVisible();
    await expect(resume.locator('.i-play')).toHaveCSS('color', 'rgb(46, 158, 107)');
    const after = await resume.boundingBox();
    expect(after!.width).toBe(before!.width);
    expect(after!.x).toBe(before!.x);

    const line = await runningLine(page);
    await page.clock.runFor(3000);
    expect(await runningLine(page)).toBe(line);

    await resume.click();
    await expect(button(page, 'Pause')).toBeVisible();
    await page.clock.runFor(600);
    expect(await runningLine(page)).not.toBe(line);
  });

  test('opens with Slow pressed and lets the visitor turn it off with the keyboard', async ({ page }) => {
    const slow = button(page, 'Slow');
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await expect(slow).toHaveCSS('background-color', 'rgb(31, 45, 58)');

    await slow.focus();
    await expect(slow).toHaveCSS('outline-color', 'rgb(226, 96, 58)');
    await page.keyboard.press('Space');
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    await expect(slow).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // At full speed the lines before the first delay take no time, so the arrow goes straight to it.
    await page.clock.runFor(50);
    await expect(runningRow(page)).toHaveAttribute('data-line', String(linesOf('sketches/blink/simple', 'delay(1000);')[0]));
    await expect(serial(page)).toContainText('HIGH');
  });

  test('Step runs exactly one line, and the LED, output and watch change only when their line runs', async ({
    page,
  }) => {
    await tab(page, '2 input').click();
    await button(page, 'Pause').click();
    const input = source('sketches/blink/input');
    const at = (text: string, occurrence = 1) => lineNumber(input, text, occurrence)!;
    const order = [
      at('Serial.begin(115200);'),
      at('Serial.println();'),
      at('Serial.println("sketch blink/input");'),
      at('led.begin();'),
      at('if (Serial.available()) {'),
      at('Serial.println("HIGH");'),
      at('led.write(HIGH);'),
      at('delay(blinkDelay);'),
      at('Serial.println("LOW");'),
      at('led.write(LOW);'),
      at('delay(blinkDelay);', 2),
    ];
    const step = button(page, 'Step');
    await expect(runningRow(page)).toHaveAttribute('data-line', String(order[0]));
    for (const line of order.slice(1, 7)) {
      await step.click();
      await expect(runningRow(page)).toHaveAttribute('data-line', String(line));
    }
    // About to run led.write(HIGH): the print before it ran, the LED has not changed yet.
    await expect(serial(page)).toHaveText(/HIGH$/);
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(bench(page).locator('[data-picture]')).not.toHaveClass(/\bon\b/);

    await step.click();
    await expect(runningRow(page)).toHaveAttribute('data-line', String(order[7]));
    await expect(watchValue(page, 'LED')).toHaveText('HIGH');
    await expect(bench(page).locator('[data-picture]')).toHaveClass(/\bon\b/);

    // Step runs a whole delay at once, with no real wait.
    await step.click();
    await expect(runningRow(page)).toHaveAttribute('data-line', String(order[8]));
    await step.click();
    await expect(runningRow(page)).toHaveAttribute('data-line', String(order[9]));
    await expect(serial(page)).toHaveText(/LOW$/);
    await expect(watchValue(page, 'LED')).toHaveText('HIGH');
    await expect(watchValue(page, 'measured')).toHaveText('…');

    await step.click();
    await expect(runningRow(page)).toHaveAttribute('data-line', String(order[10]));
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('1000 ms');
    await expect(button(page, 'Continue')).toBeVisible();
  });

  test('Restart starts again from the first line with the output and watch cleared, and keeps on running', async ({
    page,
  }) => {
    const first = String(lineNumber(source('sketches/blink/simple'), 'Serial.begin(115200);'));
    await page.clock.runFor(5100);
    await expect(serial(page)).toContainText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('1000 ms');

    await button(page, 'Restart').click();
    await expect(runningRow(page)).toHaveAttribute('data-line', first);
    await expect(serial(page)).toHaveText('');
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('…');
    await expect(button(page, 'Pause')).toBeVisible();
    await page.clock.runFor(1600);
    await expect(serial(page)).toHaveText('\nsketch blink/simple');
  });

  test('Restart stays paused when the visitor had paused', async ({ page }) => {
    const first = String(lineNumber(source('sketches/blink/simple'), 'Serial.begin(115200);'));
    await page.clock.runFor(2600);
    await button(page, 'Pause').click();
    await button(page, 'Restart').click();
    await expect(runningRow(page)).toHaveAttribute('data-line', first);
    await expect(serial(page)).toHaveText('');
    await page.clock.runFor(2000);
    await expect(runningRow(page)).toHaveAttribute('data-line', first);
    await expect(button(page, 'Continue')).toBeVisible();
  });

  test('highlights a watch value briefly when it changes, but not the clock', async ({ page }) => {
    const led = watchValue(page, 'LED');
    await expect(led).not.toHaveAttribute('data-changed');
    // led.write(HIGH) runs at 3000 ms in slow mode.
    await page.clock.runFor(3050);
    await expect(led).toHaveText('HIGH');
    await expect(led).toHaveAttribute('data-changed');
    await expect(led).toHaveCSS('background-color', 'rgb(247, 201, 72)');
    await page.clock.runFor(1000);
    await expect(led).not.toHaveAttribute('data-changed');

    await tab(page, '3 timer').click();
    await expect(led).not.toHaveAttribute('data-changed');
    await page.clock.runFor(2600);
    await expect(watchValue(page, 'millis()')).not.toHaveText('0');
    await expect(watchValue(page, 'millis()')).not.toHaveAttribute('data-changed');
  });

  test('shows the live delay in the code at a width that holds every value', async ({ page }) => {
    await expect(visibleCode(page).locator('[data-live]')).toHaveCount(0);
    await tab(page, '2 input').click();
    const live = visibleCode(page).locator('[data-live]');
    await expect(live).toHaveText('1000');
    const declaration = String(lineNumber(source('sketches/blink/input'), 'int blinkDelay = 1000;'));
    await expect(visibleCode(page).locator(`[data-line="${declaration}"] [data-live]`)).toHaveCount(1);
    await expect(live).toHaveCSS('background-color', 'rgb(247, 201, 72)');

    // Layout only: the value changes when a sent number is applied, which the send area drives.
    await button(page, 'Pause').click();
    const widths: number[] = [];
    for (const value of ['100', '2000', '1000']) {
      await live.evaluate((element, text) => (element.textContent = text), value);
      widths.push((await live.boundingBox())!.width);
    }
    expect(new Set(widths).size).toBe(1);
  });

  test('has room for all six lines the serial output keeps', async ({ page }) => {
    await page.clock.runFor(9100);
    const text = await serial(page).textContent();
    expect(text!.split('\n')).toHaveLength(SERIAL_LINES);
    const room = await serial(page).evaluate((pre) => {
      const style = getComputedStyle(pre);
      const content = pre.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      return content / parseFloat(style.lineHeight);
    });
    expect(room).toBeGreaterThanOrEqual(SERIAL_LINES);
  });

  test('moves between tabs with the arrow keys and shows the focus', async ({ page }) => {
    await tab(page, '1 simple').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '2 input')).toBeFocused();
    await expect(tab(page, '2 input')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, '1 simple')).toHaveAttribute('tabindex', '-1');
    await expect(tab(page, '2 input')).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('End');
    await expect(tab(page, '4 commands')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '1 simple')).toHaveAttribute('aria-selected', 'true');
  });

  test('sends the command line with Enter or the Send button, and shows a sent line in yellow after ›', async ({
    page,
  }) => {
    await tab(page, '4 commands').click();
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'type a command and press Enter');
    const term = bench(page).locator('.term');
    const output = await serial(page).boundingBox();
    const line = await commandLine(page).boundingBox();
    expect(Math.abs(line!.y - (output!.y + output!.height))).toBeLessThan(2);
    await expect(sendButton(page).locator('svg')).toBeVisible();
    await expect(sendButton(page)).toHaveCSS('background-color', 'rgb(247, 201, 72)');

    await commandLine(page).fill('pause');
    await commandLine(page).press('Enter');
    await expect(commandLine(page)).toHaveValue('');
    await expect(serial(page)).toHaveText(/› pause$/);
    await expect(sentLines(page)).toHaveText(['› pause']);
    await expect(sentLines(page)).toHaveCSS('color', 'rgb(247, 201, 72)');
    await expect(term.locator('[data-serial-line]:not([data-sent])').first()).toHaveCSS('color', 'rgb(232, 238, 243)');

    await commandLine(page).fill('run');
    await sendButton(page).click();
    await expect(commandLine(page)).toHaveValue('');
    await expect(sentLines(page)).toHaveText(['› pause', '› run']);

    await sendButton(page).click();
    await expect(sentLines(page)).toHaveCount(2);
  });

  test('gives each step the placeholder its sketch needs', async ({ page }) => {
    for (const [index, step] of blinkSteps.entries()) {
      await tab(page, `${index + 1} ${step.key.split('/')[1]}`).click();
      await expect(commandLine(page)).toHaveAttribute('placeholder', step.placeholder);
    }
  });

  test('leaves the LED alone when the visitor types HIGH: only the sketch drives it', async ({ page }) => {
    await button(page, 'Pause').click();
    await commandLine(page).fill('HIGH');
    await commandLine(page).press('Enter');
    await expect(serial(page)).toHaveText(/› HIGH$/);
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(bench(page).locator('[data-picture]')).not.toHaveClass(/\bon\b/);
  });

  test('stacks the panes code first at phone width with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await tab(page, '4 commands').click();

    const code = await bench(page).locator('.code').boundingBox();
    const board = await bench(page).locator('.board').boundingBox();
    expect(code && board).toBeTruthy();
    expect(board!.y).toBeGreaterThanOrEqual(code!.y + code!.height - 1);
    expect(Math.abs(board!.x - code!.x)).toBeLessThan(1);
    const scroll = await page.evaluate(() => ({
      width: document.scrollingElement!.scrollWidth,
      client: document.scrollingElement!.clientWidth,
    }));
    expect(scroll.width).toBeLessThanOrEqual(scroll.client);

    const edge = await bench(page).boundingBox();
    for (const control of await toolbar(page).getByRole('button').all()) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(edge!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(edge!.x + edge!.width);
    }
  });
});

test('a project with steps but no step definitions keeps its Try it example', async ({ page }) => {
  await page.goto('/robomania/projects/servo/');

  await expect(page.getByText('Try it', { exact: true })).toBeVisible();
  await expect(bench(page)).toHaveCount(0);
});
