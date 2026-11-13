import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { lineNumber, newLines } from '../../src/lib/workbench/source';
import { blinkSteps } from '../../src/lib/workbench/steps/blink';
import { SERIAL_LINES } from '../../src/components/workbench/view';
import { HOLD_MS, LETTER_MS } from '../../src/lib/workbench/typist';
import { HIGH_Y, LOW_Y, TRACE_WINDOW_MS } from '../../src/lib/workbench/trace';

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
const shortcutRow = (page: Page) => bench(page).locator('[data-shortcuts]:visible');
const chip = (page: Page, text: string) => shortcutRow(page).getByRole('button', { name: text, exact: true });
const delaySlider = (page: Page) => shortcutRow(page).getByRole('slider', { name: 'delay in ms' });
/** Stops the page's time from flowing on its own, so a test moves it on with `runFor` alone. */
const freeze = async (page: Page) => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
/** Lets the page paint once while its time is frozen. */
const nextFrame = (page: Page) => page.clock.runFor(20);

/** Drags the delay slider's thumb to `share` of its track and holds it there, the mouse still down. */
async function dragDelay(page: Page, share: number) {
  await delaySlider(page).scrollIntoViewIfNeeded();
  const box = (await delaySlider(page).boundingBox())!;
  const value = Number(await delaySlider(page).inputValue());
  const at = (fraction: number) => box.x + 8 + fraction * (box.width - 16);
  await page.mouse.move(at((value - 100) / 1900), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(at(share), box.y + box.height / 2, { steps: 5 });
}
const runningLine = (page: Page) => runningRow(page).getAttribute('data-line').then(Number);
const runningRow = (page: Page) => visibleCode(page).locator('[data-running]');
const clockFill = (row: Locator) =>
  row.locator('[data-pie] .fill').evaluate((fill) => parseFloat(getComputedStyle(fill).strokeDasharray));

/** Stops the page's time from flowing on its own, then moves it on until the arrow is on `line`. */
/** Turns Slow on and restarts, so the step runs from its first line at half a second a line. */
async function slowFromStart(page: Page) {
  await button(page, 'Slow').click();
  await expect(button(page, 'Slow')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Restart').click();
}

async function freezeUntilRunning(page: Page, line: number) {
  // Far enough ahead that the page time, which flows until then, has not passed it yet.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  for (let i = 0; i < 100 && (await runningRow(page).getAttribute('data-line')) !== String(line); i++) {
    await page.clock.runFor(50);
  }
  await expect(runningRow(page)).toHaveAttribute('data-line', String(line));
}

/** Moves the frozen page time on until the arrow is on `line`. */
async function runUntilLine(page: Page, line: number) {
  for (let i = 0; i < 200 && (await runningRow(page).getAttribute('data-line')) !== String(line); i++) {
    await page.clock.runFor(50);
  }
  await expect(runningRow(page)).toHaveAttribute('data-line', String(line));
}

const trace = (page: Page) => bench(page).getByRole('img', { name: /^The level of GPIO 2/ });
/** Where the trace draws each mark of `kind`, in pixels from its left edge. */
const markXs = async (page: Page, kind: 'sent' | 'applied') => {
  const d = (await trace(page).locator(`[data-trace-${kind}]`).getAttribute('d')) ?? '';
  return [...d.matchAll(/M(-?[\d.]+) 3h2/g)].map((match) => Number(match[1]) + 1);
};
/** The trace's level path: where the pin stands at the right edge, and where it last rose. */
const levelPath = async (page: Page) => {
  const d = (await trace(page).locator('[data-trace-level]').getAttribute('d')) ?? '';
  const ys = [...d.matchAll(/(?:^M[\d.]+ |V)(\d+)/g)].map((match) => Number(match[1]));
  const rise = [...d.matchAll(/H([\d.]+)V(\d+)/g)].filter((match) => Number(match[2]) === HIGH_Y).at(-1);
  return { now: ys.at(-1), rise: rise === undefined ? undefined : Number(rise[1]) };
};

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
      '4 commands Pause and run by name',
    ];
    await expect(tabs).toHaveCount(names.length);
    for (const [index, name] of names.entries()) await expect(tabs.nth(index)).toHaveAccessibleName(name);
    await expect(tab(page, '1 simple')).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).getByRole('tabpanel')).toHaveAccessibleName(/1 simple/);
  });

  test('opens the step the address names, such as #timer', async ({ page }) => {
    await page.goto(`${BLINK}#timer`);
    await expect(tab(page, '3 timer')).toHaveAttribute('aria-selected', 'true');
    await expect(bench(page).locator('.edtab:visible')).toHaveText('timer.ino');
  });

  test('names the picked step in the address', async ({ page }) => {
    await tab(page, '2 input').click();
    await expect(page).toHaveURL(new RegExp(`${BLINK}#input$`));
  });

  test('opens the step a link on the page names', async ({ page }) => {
    await page.evaluate(() => {
      const link = Object.assign(document.createElement('a'), { href: '#commands', textContent: 'to commands' });
      document.body.append(link);
    });
    await page.getByRole('link', { name: 'to commands' }).click();
    await expect(tab(page, '4 commands')).toHaveAttribute('aria-selected', 'true');
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
      const chips = step.shortcuts.flatMap((shortcut) => (shortcut.kind === 'chip' ? [shortcut.text] : []));
      const sliders = step.shortcuts.filter((shortcut) => shortcut.kind === 'slider');
      await expect(shortcutRow(page)).toHaveCount(step.shortcuts.length > 0 ? 1 : 0);
      await expect(shortcutRow(page).locator('.chip')).toHaveText(chips);
      await expect(shortcutRow(page).getByRole('slider')).toHaveCount(sliders.length);
      for (const slider of sliders) {
        await expect(shortcutRow(page).getByRole('slider', { name: `${slider.label} in ${slider.unit}` })).toHaveValue(
          String(slider.initial),
        );
        await expect(shortcutRow(page).locator('output')).toHaveText(String(slider.initial));
      }
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

  test('runs the selected step slowly enough to follow once Slow is on', async ({ page }) => {
    await slowFromStart(page);
    const simple = source('sketches/blink/simple');
    await expect(visibleCode(page).locator('[data-running]')).toHaveAttribute(
      'data-line',
      String(lineNumber(simple, 'output.begin("blink/simple");')),
    );
    await expect(serial(page)).toHaveText('');

    await page.clock.runFor(600);
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
    await slowFromStart(page);
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
    await slowFromStart(page);
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

  test('starts filling the clock as soon as the visitor turns reduced motion off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const [delay] = linesOf('sketches/blink/simple', 'delay(1000);');
    await freezeUntilRunning(page, delay);
    expect(await clockFill(runningRow(page))).toBe(100);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // The browser reports the change at its next rendering step, which the frozen page time does not hold back.
    await expect
      .poll(async () => {
        await page.clock.runFor(20);
        return clockFill(runningRow(page));
      })
      .toBeLessThan(100);
    const early = await clockFill(runningRow(page));
    await page.clock.runFor(300);
    expect(await clockFill(runningRow(page))).toBeGreaterThan(early);
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
    await slowFromStart(page);
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

  test('opens with Slow off and lets the visitor turn it on and off with the keyboard', async ({ page }) => {
    const slow = button(page, 'Slow');
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    await expect(slow).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await slow.focus();
    await expect(slow).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
    await expect(slow).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await expect(slow).toHaveCSS('background-color', 'rgb(31, 45, 58)');
    await page.keyboard.press('Space');
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    await button(page, 'Restart').click();
    // At full speed the lines before the first delay take no time, so the arrow goes straight to it.
    await page.clock.runFor(50);
    await expect(runningRow(page)).toHaveAttribute('data-line', String(linesOf('sketches/blink/simple', 'delay(1000);')[0]));
    await expect(serial(page)).toContainText('HIGH');
  });

  test('Step runs exactly one line, and the LED, output and watch change only when their line runs', async ({
    page,
  }) => {
    await freeze(page);
    await tab(page, '2 input').click();
    await button(page, 'Pause').click();
    await nextFrame(page);
    const input = source('sketches/blink/input');
    const at = (text: string, occurrence = 1) => lineNumber(input, text, occurrence)!;
    // Each line in the order Step runs them, what it prints and which watch values it changes.
    const runs: { line: number; prints?: string | string[]; watch?: Record<string, string> }[] = [
      { line: at('output.begin("blink/input");'), prints: ['', 'sketch blink/input'] },
      { line: at('led.begin();') },
      { line: at('if (input.ready()) {') },
      { line: at('output.println("HIGH");'), prints: 'HIGH' },
      { line: at('led.write(HIGH);'), watch: { LED: 'HIGH' } },
      // Step runs a whole delay at once, with no real wait.
      { line: at('delay(blinkDelay);') },
      { line: at('output.println("LOW");'), prints: 'LOW' },
      { line: at('led.write(LOW);'), watch: { LED: 'LOW', measured: '1000 ms' } },
      { line: at('delay(blinkDelay);', 2) },
    ];
    const output: string[] = [];
    let watch: Record<string, string> = { LED: 'LOW', wait: '1000 ms', measured: '…' };
    const expectBoard = async () => {
      await expect.poll(() => serial(page).textContent()).toBe(output.slice(-SERIAL_LINES).join('\n'));
      await expect(bench(page).locator('.watch div:visible dt')).toHaveText(Object.keys(watch));
      await expect(bench(page).locator('.watch div:visible dd')).toHaveText(Object.values(watch));
      const picture = bench(page).locator('[data-picture]');
      await (watch.LED === 'HIGH' ? expect(picture).toHaveClass(/\bon\b/) : expect(picture).not.toHaveClass(/\bon\b/));
    };

    await expect(runningRow(page)).toHaveAttribute('data-line', String(runs[0].line));
    await expectBoard();
    for (const [index, run] of runs.slice(0, -1).entries()) {
      await button(page, 'Step').click();
      await nextFrame(page);
      await expect(runningRow(page)).toHaveAttribute('data-line', String(runs[index + 1].line));
      if (run.prints !== undefined) output.push(...[run.prints].flat());
      watch = { ...watch, ...run.watch };
      await expectBoard();
    }
    await expect(button(page, 'Continue')).toBeVisible();
  });

  test('Restart starts again from the first line with the output and watch cleared, and keeps on running', async ({
    page,
  }) => {
    await slowFromStart(page);
    const first = String(lineNumber(source('sketches/blink/simple'), 'output.begin("blink/simple");'));
    await page.clock.runFor(5100);
    await expect(serial(page)).toContainText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('1000 ms');

    await button(page, 'Restart').click();
    await expect(runningRow(page)).toHaveAttribute('data-line', first);
    await expect(serial(page)).toHaveText('');
    await expect(watchValue(page, 'LED')).toHaveText('LOW');
    await expect(watchValue(page, 'measured')).toHaveText('…');
    await expect(button(page, 'Pause')).toBeVisible();
    await page.clock.runFor(600);
    await expect(serial(page)).toHaveText('\nsketch blink/simple');
  });

  test('Restart stays paused when the visitor had paused', async ({ page }) => {
    const first = String(lineNumber(source('sketches/blink/simple'), 'output.begin("blink/simple");'));
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
    await button(page, 'Slow').click();
    await expect(button(page, 'Slow')).toHaveAttribute('aria-pressed', 'true');
    await freeze(page);
    await button(page, 'Restart').click();
    await expect(led).not.toHaveAttribute('data-changed');
    // led.write(HIGH) runs at 2000 ms in slow mode.
    await page.clock.runFor(2050);
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

  test('shows every variable of commands live, so ledOn and lastToggle change as the LED toggles', async ({ page }) => {
    await tab(page, '4 commands').click();
    const live = (name: string) => visibleCode(page).locator(`[data-live="${name}"]`);
    await expect(live('blinkDelay')).toHaveText('1000');
    await expect(live('ledOn')).toHaveText('false');
    await expect(live('paused')).toHaveText('false');
    await expect(live('lastToggle')).toHaveText('0');
    await button(page, 'Slow').click();
    await page.clock.runFor(1100);
    await expect(live('ledOn')).toHaveText('true');
    await expect(live('lastToggle')).not.toHaveText('0');
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
    await slowFromStart(page);
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'a command, then Enter');
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

  test('fits the placeholder of each step in the command line at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    for (const [index, step] of blinkSteps.entries()) {
      await tab(page, `${index + 1} ${step.key.split('/')[1]}`).click();
      const room = await commandLine(page).evaluate((input: HTMLInputElement) => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontSize} ${style.fontFamily}`;
        const free = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return free - context.measureText(input.placeholder).width;
      });
      expect(room, step.placeholder).toBeGreaterThan(0);
    }
  });

  test('gives each step the placeholder its sketch needs', async ({ page }) => {
    for (const [index, step] of blinkSteps.entries()) {
      await tab(page, `${index + 1} ${step.key.split('/')[1]}`).click();
      await expect(commandLine(page)).toHaveAttribute('placeholder', step.placeholder);
    }
  });

  test('leaves the LED alone when the visitor types HIGH: the sketch reads it and only the sketch drives the LED', async ({
    page,
  }) => {
    await freeze(page);
    await tab(page, '4 commands').click();
    await commandLine(page).fill('HIGH');
    await commandLine(page).press('Enter');
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› HIGH']);
    const watch = { LED: 'LOW', wait: '1000 ms', measured: '…', paused: 'false' };
    for (let i = 0; i < 200 && !(await serial(page).textContent())!.includes('? HIGH'); i++) await page.clock.runFor(50);
    // Sent before setup() ran, the line is read on the first pass of loop(), which answers it.
    await expect.poll(() => serial(page).textContent()).toBe('› HIGH\n\nsketch blink/commands\n? HIGH');
    for (const [name, value] of Object.entries(watch)) await expect(watchValue(page, name)).toHaveText(value);
    await expect(bench(page).locator('[data-picture]')).not.toHaveClass(/\bon\b/);
  });

  test('a chip types its word letter by letter in yellow, holds it, then sends it and clears the line', async ({
    page,
  }) => {
    await tab(page, '4 commands').click();
    await freeze(page);
    await chip(page, 'pause').click();
    await expect(commandLine(page)).toHaveValue('');
    await expect(commandLine(page)).toHaveAttribute('data-typing', '');
    for (const typed of ['p', 'pa', 'pau', 'paus', 'pause']) {
      await page.clock.runFor(LETTER_MS);
      await expect(commandLine(page)).toHaveValue(typed);
    }
    await expect(commandLine(page)).toHaveCSS('color', 'rgb(247, 201, 72)');
    await page.clock.runFor(HOLD_MS - 20);
    await expect(commandLine(page)).toHaveValue('pause');
    await expect(sentLines(page)).toHaveCount(0);
    await page.clock.runFor(20);
    await expect(commandLine(page)).toHaveValue('');
    await expect(commandLine(page)).not.toHaveAttribute('data-typing');
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› pause']);
  });

  test('a second shortcut used while one types sends the first at once, then types the next', async ({ page }) => {
    await tab(page, '4 commands').click();
    await freeze(page);
    await chip(page, 'pause').click();
    await page.clock.runFor(2 * LETTER_MS);
    await expect(commandLine(page)).toHaveValue('pa');
    await chip(page, 'run').click();
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› pause']);
    await expect(commandLine(page)).toHaveValue('');
    await page.clock.runFor(3 * LETTER_MS);
    await expect(commandLine(page)).toHaveValue('run');
    await page.clock.runFor(HOLD_MS);
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› pause', '› run']);
  });

  test('typing in the command line by hand stops a shortcut typing', async ({ page }) => {
    await tab(page, '4 commands').click();
    await freeze(page);
    await chip(page, 'pause').click();
    await page.clock.runFor(2 * LETTER_MS);
    await commandLine(page).press('End');
    await commandLine(page).pressSequentially('x');
    await expect(commandLine(page)).toHaveValue('pax');
    await expect(commandLine(page)).not.toHaveAttribute('data-typing');
    await expect(commandLine(page)).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.clock.runFor(10 * HOLD_MS);
    await expect(commandLine(page)).toHaveValue('pax');
    await expect(sentLines(page)).toHaveCount(0);
  });

  test('a chip shows its whole word at once under reduced motion, and still sends it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tab(page, '4 commands').click();
    await freeze(page);
    await chip(page, 'run').click();
    await expect(commandLine(page)).toHaveValue('run');
    await page.clock.runFor(HOLD_MS);
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› run']);
  });

  for (const [id, number, line] of [
    ['commands', 4, (ms: string) => `delay ${ms}`],
    ['input', 2, (ms: string) => ms],
  ] as const) {
    test(`the delay slider on ${id} shows the line it would send while dragged, and sends it on release`, async ({
      page,
    }) => {
      await tab(page, `${number} ${id}`).click();
      await freeze(page);
      await dragDelay(page, 0.75);
      const value = await delaySlider(page).inputValue();
      expect(Number(value)).toBeGreaterThan(1000);
      await expect(shortcutRow(page).locator('output')).toHaveText(value);
      await expect(commandLine(page)).toHaveValue(line(value));
      await expect(commandLine(page)).toHaveCSS('color', 'rgb(247, 201, 72)');
      await page.clock.runFor(2 * HOLD_MS);
      await expect(sentLines(page)).toHaveCount(0);

      await page.mouse.up();
      await expect(commandLine(page)).toHaveValue(line(value));
      await page.clock.runFor(HOLD_MS);
      await nextFrame(page);
      await expect(sentLines(page)).toHaveText([`› ${line(value)}`]);
      await expect(commandLine(page)).toHaveValue('');
    });
  }

  test('the delay slider sends only the value it ends on when the arrow keys move it', async ({ page }) => {
    await tab(page, '4 commands').click();
    await freeze(page);
    await delaySlider(page).focus();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.clock.runFor(100);
    }
    await expect(delaySlider(page)).toHaveValue('1500');
    await expect(commandLine(page)).toHaveValue('delay 1500');
    await page.clock.runFor(HOLD_MS);
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› delay 1500']);
    await page.clock.runFor(2 * HOLD_MS);
    await expect(sentLines(page)).toHaveCount(1);
  });

  for (const width of [1280, 400]) {
    test(`ends the slider's value and the Send button at the same right edge at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await tab(page, '4 commands').click();
      const value = (await shortcutRow(page).locator('output').boundingBox())!;
      const send = (await sendButton(page).boundingBox())!;
      expect(Math.abs(value.x + value.width - (send.x + send.width))).toBeLessThan(1);
      const row = (await shortcutRow(page).boundingBox())!;
      const line = (await commandLine(page).boundingBox())!;
      expect(row.y).toBeGreaterThan(line.y + line.height - 1);
    });
  }

  test('traces GPIO 2 over the last 10 s: low at the start, high once led.write(HIGH) runs, scrolling left', async ({
    page,
  }) => {
    await expect(bench(page).locator('.scope figcaption')).toHaveText(/GPIO 2, last 10 s\s*you sent\s*board applied/);
    await button(page, 'Slow').click();
    await expect(button(page, 'Slow')).toHaveAttribute('aria-pressed', 'true');
    await freeze(page);
    await button(page, 'Restart').click();
    await nextFrame(page);
    expect(await levelPath(page)).toEqual({ now: LOW_Y, rise: undefined });

    // led.write(HIGH) runs at 2000 ms in slow mode; the delay after it then fills for 1000 ms.
    await page.clock.runFor(2050);
    await expect(watchValue(page, 'LED')).toHaveText('HIGH');
    const width = (await trace(page).boundingBox())!.width;
    const first = await levelPath(page);
    expect(first.now).toBe(HIGH_Y);
    expect(first.rise).toBeGreaterThan(width - 10);
    await page.clock.runFor(500);
    const later = await levelPath(page);
    // The page paints once a frame, so each reading may lag the clock by up to a frame of 1/60 s.
    const frame = (width * 17) / TRACE_WINDOW_MS + 0.1;
    expect(Math.abs(first.rise! - later.rise! - (width * 500) / TRACE_WINDOW_MS)).toBeLessThan(2 * frame);
  });

  test('on input a sent number reaches wait and the live delay only when the arrow is back at input.ready(), the yellow mark before the green', async ({
    page,
  }) => {
    const input = source('sketches/blink/input');
    const at = (text: string, occurrence = 1) => lineNumber(input, text, occurrence)!;
    await tab(page, '2 input').click();
    await slowFromStart(page);
    const live = visibleCode(page).locator('[data-live="blinkDelay"]');
    await freezeUntilRunning(page, at('delay(blinkDelay);'));

    await commandLine(page).fill('1500');
    await commandLine(page).press('Enter');
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› 1500']);
    expect(await markXs(page, 'sent')).toHaveLength(1);
    expect(await markXs(page, 'applied')).toHaveLength(0);
    await expect(trace(page).locator('[data-trace-sent]')).toHaveCSS('fill', 'rgb(226, 164, 0)');

    // The board runs out both delays first: the line waits in the queue.
    await runUntilLine(page, at('if (input.ready()) {'));
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');
    await expect(live).toHaveText('1000');
    expect(await markXs(page, 'applied')).toHaveLength(0);

    await runUntilLine(page, at('String line = input.take();'));
    await page.clock.runFor(500);
    await expect(runningRow(page)).toHaveAttribute('data-line', String(at('if (isDigit(line[0])) {')));
    expect(await markXs(page, 'applied')).toHaveLength(1);
    await expect(trace(page).locator('[data-trace-applied]')).toHaveCSS('fill', 'rgb(46, 158, 107)');
    await expect(watchValue(page, 'wait')).toHaveText('1000 ms');

    await runUntilLine(page, at('output.print("delay ");'));
    await expect(watchValue(page, 'wait')).toHaveText('1500 ms');
    await expect(watchValue(page, 'wait')).toHaveAttribute('data-changed');
    await expect(live).toHaveText('1500');
    const [sent] = await markXs(page, 'sent');
    const [applied] = await markXs(page, 'applied');
    const width = (await trace(page).boundingBox())!.width;
    // Sent part way through the first 1000 ms delay, read after it, the second delay and four slow lines.
    expect(applied - sent).toBeGreaterThan((width * 1000) / TRACE_WINDOW_MS);
  });

  test('reaches the command line, Send, the chips and the slider by keyboard, each showing the focus', async ({ page }) => {
    await tab(page, '4 commands').click();
    await commandLine(page).focus();
    await expect(bench(page).locator('.cmd')).toHaveCSS('box-shadow', /rgb\(59, 130, 196\)/);
    for (const control of [sendButton(page), chip(page, 'pause'), chip(page, 'run'), delaySlider(page)]) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      await expect(control).toHaveCSS('outline-color', 'rgb(59, 130, 196)');
      await expect(control).toHaveCSS('outline-style', 'solid');
      // Only the focused control shows a ring, not the command line's row around it.
      await expect(bench(page).locator('.cmd')).toHaveCSS('box-shadow', 'none');
    }
  });

  test('keeps the board in view beside the code while the code scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await tab(page, '4 commands').click();
    // Line 45 at the foot of the window: the sketch's last lines still lie below it, so the board has room to stick.
    await visibleCode(page)
      .locator('[data-line="45"]')
      .evaluate((row) => row.scrollIntoView({ block: 'end' }));
    const viewport = page.viewportSize()!;
    const inView = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    };
    await inView(visibleCode(page).locator('[data-line="45"]'));
    await inView(bench(page).locator('[data-picture]'));
    await inView(serial(page));
    // The board's own place in the page lies above the window: it is in view only because it sticks to the top.
    expect(Math.abs((await bench(page).locator('.board').boundingBox())!.y)).toBeLessThan(1);
    expect((await bench(page).locator('.panes').boundingBox())!.y).toBeLessThan(-100);
  });

  test('lets the board scroll with the page in a wide window too short to hold it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await expect(bench(page).locator('.board')).toHaveCSS('position', 'static');
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(bench(page).locator('.board')).toHaveCSS('position', 'sticky');
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

test('a single-sketch project keeps its Try it example and has no workbench', async ({ page }) => {
  await page.goto('/robomania/projects/omnidirectional/');

  await expect(page.getByText('Try it: drag both sticks', { exact: true })).toBeVisible();
  await expect(bench(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'sketches/omnidirectional' })).toHaveAttribute(
    'href',
    'https://github.com/lmarqs/robomania/tree/main/sketches/omnidirectional',
  );
});

test('links the folder that holds every step from a project in steps', async ({ page }) => {
  for (const project of ['blink', 'servo']) {
    await page.goto(`/robomania/projects/${project}/`);
    await expect(page.getByRole('link', { name: `sketches/${project}`, exact: true })).toHaveAttribute(
      'href',
      `https://github.com/lmarqs/robomania/tree/main/sketches/${project}`,
    );
  }
});
