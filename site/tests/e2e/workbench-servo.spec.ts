import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { lineNumber } from '../../src/lib/workbench/source';
import { HIGH_Y, LOW_Y } from '../../src/lib/workbench/trace';
import { HOLD_MS } from '../../src/lib/workbench/typist';
import { expect, test } from './fake-flasher';

const SERVO = '/robomania/projects/servo/';
const SHOTS = '/tmp/claude-1000/-home-lmarqs-Work-esp-rc-car/697aebf4-0991-46d4-9ca2-a30fc1d03b54/scratchpad/shots/task-17/';
const source = (step: string) =>
  readFileSync(new URL(`../../../sketches/servo/${step}/${step}.ino`, import.meta.url), 'utf8');

const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
const picture = (page: Page) => bench(page).locator('[data-picture]');
const watchValue = (page: Page, name: string) => bench(page).locator(`[data-watch-row="${name}"] dd`);
const watchNames = (page: Page) => bench(page).locator('.watch div:visible dt');
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });
const sentLines = (page: Page) => serial(page).locator('[data-sent]');
const toolbar = (page: Page) => bench(page).getByRole('toolbar', { name: 'Debugger' });
const button = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true });
const commandLine = (page: Page) => bench(page).getByRole('textbox', { name: 'Line to send to the board' });
const shortcutRow = (page: Page) => bench(page).locator('[data-shortcuts]:visible');
const shortcuts = (page: Page) => bench(page).locator('[data-shortcuts]:visible [data-shortcut]');
const chip = (page: Page, text: string) => shortcutRow(page).getByRole('button', { name: text, exact: true });
const slider = (page: Page, name: string) => shortcutRow(page).getByRole('slider', { name });
const runningRow = (page: Page) => bench(page).locator('[data-code]:visible [data-running]');
const status = (page: Page) => bench(page).locator('[data-board-word]');
const boardButton = (page: Page) => bench(page).locator('[data-board-action]');
const cell = (page: Page) => bench(page).locator('[data-board-cell]');
const trace = (page: Page) => bench(page).getByRole('img', { name: /^The servo angle on GPIO 13/ });
const tracePath = (page: Page, part: 'sent' | 'applied' | 'level') =>
  trace(page).locator(`[data-trace-${part}]`).getAttribute('d').then((d) => d ?? '');
/** The height the trace draws the angle at on its right edge. */
const levelNow = async (page: Page) =>
  Number([...(await tracePath(page, 'level')).matchAll(/(?:M[\d.]+ |V)([\d.]+)/g)].at(-1)?.[1]);
/** The angle the horn is turned to, and the target's outline. */
const horn = (page: Page, value: 'angle' | 'target' = 'angle') =>
  picture(page).evaluate((element, name) => (element as SVGElement).style.getPropertyValue(`--${name}`), value);
const freeze = async (page: Page) => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
const nextFrame = (page: Page) => page.clock.runFor(20);

/** Turns Slow off, so the simulator runs at the board's pace. */
async function fullSpeed(page: Page) {
  await button(page, 'Slow').click();
  await expect(button(page, 'Slow')).toHaveAttribute('aria-pressed', 'false');
}

async function send(page: Page, text: string) {
  await commandLine(page).fill(text);
  await commandLine(page).press('Enter');
}

/** Steps until the arrow is on `line`, waiting for the arrow to move after each Step. */
async function stepUntil(page: Page, line: number) {
  for (let i = 0; i < 40; i++) {
    const at = await runningRow(page).getAttribute('data-line');
    if (at === String(line)) break;
    await button(page, 'Step').click();
    await expect(runningRow(page)).not.toHaveAttribute('data-line', at!);
  }
  await expect(runningRow(page)).toHaveAttribute('data-line', String(line));
}

test.describe('the Servo workbench', () => {
  test('replaces the Try it example and the flash card with the four steps', async ({ page }) => {
    await page.goto(SERVO);
    await expect(bench(page).getByRole('tab')).toHaveText([
      /^1 sweep/,
      /^2 angle/,
      /^3 commands/,
      /^4 speed/,
    ]);
    await expect(page.getByText('Try it', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Put it on your board' })).toHaveCount(0);
    await expect(picture(page)).toHaveClass(/\bservo\b/);
  });

  test('turns the horn on the servo.write line when stepping, not before', async ({ page }) => {
    const sweep = source('sweep');
    await page.goto(SERVO);
    await button(page, 'Pause').click();
    await button(page, 'Restart').click();
    await expect(picture(page)).not.toHaveClass(/\bknown\b/);
    await expect(watchValue(page, 'angle')).toHaveText('…');
    await expect(picture(page)).toHaveAttribute('aria-label', 'A servo on GPIO 13, its angle not known yet');

    await stepUntil(page, lineNumber(sweep, 'servo.write(angle);')!);
    await expect(picture(page)).not.toHaveClass(/\bknown\b/);
    await button(page, 'Step').click();
    await expect(runningRow(page)).toHaveAttribute('data-line', String(lineNumber(sweep, 'Serial.print("angle ");')));
    await expect(picture(page)).toHaveClass(/\bknown\b/);
    expect(await horn(page)).toBe('0');
    await expect(watchValue(page, 'angle')).toHaveText('0°');
    await expect(picture(page)).toHaveAttribute('aria-label', 'A servo on GPIO 13, its horn at 0°');
    // The angle prints two lines later.
    await expect(serial(page)).toHaveText('sketch servo/sweep');
    await stepUntil(page, lineNumber(sweep, 'delay(15);')!);
    await expect(serial(page)).toHaveText('sketch servo/sweep\nangle 0');

    await stepUntil(page, lineNumber(sweep, 'servo.write(angle);')!);
    expect(await horn(page)).toBe('0');
    await button(page, 'Step').click();
    expect(await horn(page)).toBe('1');
  });

  test('answers a bad angle with an error in the serial output and leaves the horn where it is', async ({ page }) => {
    await page.goto(SERVO);
    await tab(page, '2 angle').click();
    await fullSpeed(page);
    await expect(serial(page)).toContainText('angle 90');
    expect(await horn(page)).toBe('90');

    await send(page, 'abc');
    await expect(serial(page)).toHaveText(/› abc\nerror angle must be 0-180$/);
    expect(await horn(page)).toBe('90');
    await expect(watchValue(page, 'angle')).toHaveText('90°');

    await send(page, '181');
    await expect(serial(page)).toHaveText(/› 181\nerror angle must be 0-180$/);
    expect(await horn(page)).toBe('90');

    await send(page, '120');
    await expect(serial(page)).toHaveText(/› 120\nangle 120$/);
    expect(await horn(page)).toBe('120');
    await expect(watchValue(page, 'angle')).toHaveText('120°');
  });

  test('plots the angle over the last 10 s: nothing before the first write, then its height from 0° to 180°', async ({
    page,
  }) => {
    await page.goto(SERVO);
    await expect(bench(page).locator('.scope figcaption')).toHaveText(
      /GPIO 13 angle, 0–180°, last 10 s\s*you sent\s*board applied/,
    );
    await tab(page, '2 angle').click();
    await button(page, 'Pause').click();
    await button(page, 'Restart').click();
    await expect(trace(page).locator('[data-trace-level]')).toHaveAttribute('d', '');

    await fullSpeed(page);
    await button(page, 'Continue').click();
    await expect(serial(page)).toContainText('angle 90');
    await expect.poll(() => levelNow(page)).toBe((HIGH_Y + LOW_Y) / 2);
    await send(page, '180');
    await expect(serial(page)).toContainText('angle 180');
    await expect.poll(() => levelNow(page)).toBe(HIGH_Y);
    await send(page, '0');
    await expect.poll(() => levelNow(page)).toBe(LOW_Y);
    expect(await tracePath(page, 'sent')).not.toBe('');
    expect(await tracePath(page, 'applied')).not.toBe('');
  });

  test('shows the watch rows each step holds', async ({ page }) => {
    await page.goto(SERVO);
    await expect(watchNames(page)).toHaveText(['angle']);
    await tab(page, '2 angle').click();
    await expect(watchNames(page)).toHaveText(['angle']);
    await tab(page, '3 commands').click();
    await expect(watchNames(page)).toHaveText(['angle', 'sweeping', 'millis()']);
    await tab(page, '4 speed').click();
    await expect(watchNames(page)).toHaveText(['angle', 'target', 'speed', 'sweeping', 'millis()']);
    await expect(watchValue(page, 'speed')).toHaveText('60 °/s');
  });

  test('offers no shortcut on sweep', async ({ page }) => {
    await page.goto(SERVO);
    await expect(shortcuts(page)).toHaveCount(0);
    await expect(commandLine(page)).toHaveAttribute('placeholder', 'this step reads no input');
  });

  test('on angle, the angle slider sends a bare number on release', async ({ page }) => {
    await page.goto(SERVO);
    await tab(page, '2 angle').click();
    await expect(shortcuts(page)).toHaveCount(1);
    await fullSpeed(page);
    await freeze(page);
    await slider(page, 'angle in degrees').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(commandLine(page)).toHaveValue('93');
    await expect(sentLines(page)).toHaveCount(0);
    await page.clock.runFor(HOLD_MS);
    await nextFrame(page);
    await expect(sentLines(page)).toHaveText(['› 93']);
    await page.clock.runFor(200);
    await expect(serial(page)).toContainText('angle 93');
    expect(await horn(page)).toBe('93');
  });

  for (const [name, number] of [
    ['commands', 3],
    ['speed', 4],
  ] as const) {
    test(`on ${name}, the sweep and stop chips and the angle slider type the commands they send`, async ({ page }) => {
      await page.goto(SERVO);
      await tab(page, `${number} ${name}`).click();
      await fullSpeed(page);
      await expect(chip(page, 'sweep')).toBeVisible();
      await expect(chip(page, 'stop')).toBeVisible();

      await chip(page, 'sweep').click();
      // The chip types its word before it sends it; the sweep's angle lines then fill the terminal.
      await expect(commandLine(page)).toHaveValue('sweep');
      await expect(watchValue(page, 'sweeping')).toHaveText('true');
      await chip(page, 'stop').click();
      await expect(commandLine(page)).toHaveValue('stop');
      await expect(serial(page)).toHaveText(/› stop\n(angle \d+\n)?stopped$/);
      await expect(watchValue(page, 'sweeping')).toHaveText('false');

      await slider(page, 'angle in degrees').fill('45');
      await expect(commandLine(page)).toHaveValue('angle 45');
      await expect(watchValue(page, name === 'speed' ? 'target' : 'angle')).toHaveText('45°');
    });
  }

  test('on speed, the speed slider sends speed <n>, and a bad speed gets an error', async ({ page }) => {
    await page.goto(SERVO);
    await tab(page, '4 speed').click();
    await fullSpeed(page);
    await expect(shortcuts(page)).toHaveCount(4);
    await slider(page, 'speed in degrees a second').fill('10');
    await expect(sentLines(page).last()).toHaveText('› speed 10');
    await expect(serial(page)).toHaveText(/speed 10$/);
    await expect(watchValue(page, 'speed')).toHaveText('10 °/s');
    await expect(bench(page).locator('[data-code]:visible [data-live]')).toHaveText('10');

    await send(page, 'speed 0');
    await expect(serial(page)).toHaveText(/error speed must be 1-360$/);
    await expect(watchValue(page, 'speed')).toHaveText('10 °/s');
  });

  test('on speed, shows the target as a dashed horn and the estimate as the solid one while it moves', async ({ page }) => {
    await page.goto(SERVO);
    await tab(page, '4 speed').click();
    await fullSpeed(page);
    await expect(serial(page)).toContainText('angle 90');
    await expect(picture(page)).toHaveClass(/\baiming\b/);
    await send(page, 'speed 20');
    await send(page, 'angle 150');
    await expect(serial(page)).toContainText('target 150');
    await expect(watchValue(page, 'target')).toHaveText('150°');
    expect(await horn(page, 'target')).toBe('150');
    await expect(serial(page)).toContainText('angle 95');
    const estimate = Number(await horn(page));
    expect(estimate).toBeGreaterThan(90);
    expect(estimate).toBeLessThan(150);
    await expect(picture(page)).toHaveAttribute('aria-label', /^A servo on GPIO 13: estimated at \d+°, target 150°$/);
    await expect(picture(page).locator('.aim path')).toHaveCSS('stroke-dasharray', '4px, 3px');
    await bench(page).screenshot({ path: `${SHOTS}servo-speed-moving.png` });
  });

  test('on commands, sweeps from the angle it holds until stop', async ({ page }) => {
    await page.goto(SERVO);
    await tab(page, '3 commands').click();
    await fullSpeed(page);
    await send(page, 'sweep');
    await expect(serial(page)).toContainText('angle 100');
    await expect(watchValue(page, 'sweeping')).toHaveText('true');
    await bench(page).screenshot({ path: `${SHOTS}servo-commands-sweeping.png` });
    await send(page, 'stop');
    await expect(serial(page)).toContainText('stopped');
    const held = await horn(page);
    await page.waitForTimeout(200);
    expect(await horn(page)).toBe(held);
  });

  for (const [state, lines, word] of [
    ['Live', ['sketch servo/sweep'], 'Live'],
    ['Runs step 4', ['sketch servo/speed'], 'Runs step 4'],
    ['Other sketch', ['sketch blink/simple'], 'Other sketch'],
  ] as const) {
    test(`keeps every tab, the Board cell and the button where Simulated has them: ${state}`, async ({
      page,
      fakeFlasher,
    }) => {
      const boxes = async () => ({
        tabs: await Promise.all((await bench(page).getByRole('tab').all()).map((each) => each.boundingBox())),
        cell: await cell(page).boundingBox(),
        button: await boardButton(page).boundingBox(),
      });
      await fakeFlasher.install({ lines: [...lines] });
      await page.goto(SERVO);
      await expect(status(page)).toHaveText('Simulated');
      const simulated = await boxes();
      await boardButton(page).click();
      await expect(status(page)).toHaveText(word);
      expect(await boxes()).toEqual(simulated);
    });
  }

  test('stacks the panes at 400 px with no sideways scroll on any step', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto(SERVO);
    for (const name of ['1 sweep', '2 angle', '3 commands', '4 speed']) {
      await tab(page, name).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBe(400);
      const placeholder = commandLine(page);
      expect(await placeholder.evaluate((input) => (input as HTMLInputElement).scrollWidth <= (input as HTMLInputElement).clientWidth)).toBe(true);
    }
  });
});

test.describe('the Servo workbench, live', () => {
  test('follows a board that runs angle: the horn, the watch, the trace and the serial output', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['', 'sketch servo/angle', 'angle 120'] });
    await page.goto(SERVO);
    await tab(page, '2 angle').click();
    await boardButton(page).click();

    await expect(status(page)).toHaveText('Live');
    await expect(serial(page)).toHaveText('sketch servo/angle\nangle 120');
    expect(await horn(page)).toBe('120');
    await expect(watchValue(page, 'angle')).toHaveText('120°');
    await expect.poll(() => levelNow(page)).toBe(Number((LOW_Y - (120 / 180) * (LOW_Y - HIGH_Y)).toFixed(1)));
    // No printed line pins the board to one source line.
    await expect(runningRow(page)).toHaveCount(0);

    await send(page, 'abc');
    await expect.poll(() => fakeFlasher.calls()).toContain('send abc');
    await fakeFlasher.print('error angle must be 0-180');
    await expect(serial(page)).toHaveText(/› abc\nerror angle must be 0-180$/);
    expect(await horn(page)).toBe('120');
    await expect.poll(() => tracePath(page, 'applied')).not.toBe('');

    await send(page, '45');
    await expect.poll(() => fakeFlasher.calls()).toContain('send 45');
    await fakeFlasher.print('angle 45');
    await expect(watchValue(page, 'angle')).toHaveText('45°');
    expect(await horn(page)).toBe('45');
    await expect(bench(page).locator('[data-hint]:visible')).toContainText('Send a number from 0 to 180');
  });

  test('works out the sweep on speed from the board’s lines, and an unknown target shows as …', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ lines: ['sketch servo/speed', 'angle 90'] });
    await page.goto(SERVO);
    await tab(page, '4 speed').click();
    await boardButton(page).click();
    await expect(status(page)).toHaveText('Live');
    await expect(watchValue(page, 'target')).toHaveText('90°');

    await fakeFlasher.print('sweeping', 'angle 91');
    await expect(watchValue(page, 'sweeping')).toHaveText('true');
    await expect(watchValue(page, 'target')).toHaveText('180°');
    await fakeFlasher.print('angle 180');
    await expect(watchValue(page, 'target')).toHaveText('0°');
    await fakeFlasher.print('stopped');
    await expect(watchValue(page, 'target')).toHaveText('180°');
    await expect(watchValue(page, 'sweeping')).toHaveText('false');
  });
});
