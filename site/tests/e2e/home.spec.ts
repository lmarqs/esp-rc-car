import { expect, test, type Page } from '@playwright/test';

test('the home page links to Robomania', async ({ page }) => {
  await page.goto('/robomania/');

  await expect(page.getByRole('link', { name: 'Robomania', exact: true })).toBeVisible();
});

test.describe('the home gamepad', () => {
  const carX = async (page: Page) =>
    Number((await page.locator('#car').getAttribute('transform'))!.match(/translate\(([-\d.]+)/)![1]);

  test('is the one controller: its stick drives the car and no separate joystick remains', async ({ page }) => {
    await page.goto('/robomania/');
    const stick = page.getByRole('application', { name: /Joystick/ });
    await expect(stick).toHaveCount(1);

    const knob = (await page.locator('#knob').boundingBox())!;
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(knob.x + knob.width / 2 + 40, knob.y + knob.height / 2, { steps: 4 });

    await expect.poll(() => carX(page)).toBeGreaterThan(50);
    await page.mouse.up();
  });

  test('drives from the keyboard once the stick has focus', async ({ page }) => {
    await page.goto('/robomania/');
    await page.getByRole('application', { name: /Joystick/ }).focus();
    await page.keyboard.down('ArrowLeft');

    await expect.poll(() => carX(page)).toBeLessThan(-50);
    await page.keyboard.up('ArrowLeft');
  });

  test('switches the LED from its labelled button and says which state it is in', async ({ page }) => {
    await page.goto('/robomania/');
    const light = page.getByRole('button', { name: /^LED: blinking/ });
    await expect(light).toHaveAttribute('aria-pressed', 'true');

    await light.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: /^LED: off/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#led')).toHaveClass(/off/);
  });

  test('jumps from its jump button', async ({ page }) => {
    await page.goto('/robomania/');
    await page.getByRole('button', { name: 'Jump' }).click();

    await expect
      .poll(async () => Number((await page.locator('#car').getAttribute('transform'))!.match(/translate\([-\d.]+ ([-\d.]+)/)![1]))
      .toBeLessThan(-10);
  });
});
