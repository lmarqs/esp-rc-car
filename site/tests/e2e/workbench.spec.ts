import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { lineNumber, newLines } from '../../src/lib/workbench/source';
import { blinkSteps } from '../../src/lib/workbench/steps/blink';

const BLINK = '/robomania/projects/blink/';
const source = (sketch: string) => readFileSync(new URL(`../../../${sketch}/${sketch.split('/').at(-1)}.ino`, import.meta.url), 'utf8');

const bench = (page: Page) => page.getByRole('region', { name: 'Workbench' });
const tab = (page: Page, name: string) => bench(page).getByRole('tab', { name });
const visibleCode = (page: Page) => bench(page).locator('[data-code]:visible');
const watchNames = (page: Page) => bench(page).locator('.watch div:visible dt');
const watchValue = (page: Page, name: string) => bench(page).locator(`[data-watch-row="${name}"] dd`);
const serial = (page: Page) => bench(page).getByRole('log', { name: 'Serial output' });

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

    await page.clock.runFor(1000);
    await expect(serial(page)).toContainText('HIGH');
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
  });
});

test('a project with steps but no step definitions keeps its Try it example', async ({ page }) => {
  await page.goto('/robomania/projects/servo/');

  await expect(page.getByText('Try it', { exact: true })).toBeVisible();
  await expect(bench(page)).toHaveCount(0);
});
