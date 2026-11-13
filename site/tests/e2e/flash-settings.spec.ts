import { dock, dockAction, dockMessage, plugIn } from './dock';
import { expect, test } from './fake-flasher';

const card = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Put it on your board' });
const field = (page: import('@playwright/test').Page, label: string) => card(page).getByLabel(label, { exact: true });

/** What a balance-beam that holds no settings lists for `cfg get`: each default, the password unset. */
const DEFAULTS = {
  ap_ssid: 'balance-beam',
  ap_password: 'unset',
  angle_offset_deg: '0',
  throttle_min: '0',
  throttle_mid: '0',
  throttle_max: '0',
  tilt_limit_deg: '45',
};
const FLASHED = ['connect', 'load', 'write', 'reset', 'monitor 115200'];
const KEEPS = 'Values the board already stores stay unless you change them here.';

test.describe('a project whose sketch has settings', () => {
  test('asks for them once the dock connects, before it flashes, filled with the defaults', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');

    await expect(card(page).locator('[data-message]')).toHaveText('Connect and flash it from the board bar below.');
    await expect(field(page, 'Hotspot name')).toBeHidden();
    await expect(dockAction(page)).toHaveAccessibleName('Flash Balance beam');
    await dockAction(page).click();

    await expect(card(page).locator('[data-message]')).toHaveText('Found ESP32. Check the settings, then flash the board.');
    await expect(field(page, 'Hotspot name')).toHaveValue('balance-beam');
    await expect(field(page, 'Hotspot password')).toHaveValue('');
    await expect(field(page, 'Hotspot password')).toHaveAccessibleDescription(
      "Whoever joins the hotspot can arm the motors. Leave it empty to keep the board's password (default: thebalancebot).",
    );
    await expect(field(page, 'Hotspot password')).toHaveAttribute('type', 'password');
    await expect(field(page, 'Throttle mid')).toHaveValue('0');
    await expect(field(page, 'Tilt limit (degrees)')).toHaveValue('45');
    await expect(card(page).getByRole('button', { name: 'Flash with these settings' })).toBeVisible();
    await expect(card(page).getByRole('button', { name: 'Use the defaults' })).toBeVisible();
    await expect(card(page).locator('[data-form-help]')).toHaveText(KEEPS);
    // The card's form is the action while it waits, so the dock offers none.
    await expect(dockAction(page)).toHaveCount(0);
    expect(await fakeFlasher.calls()).toEqual(['connect']);
  });

  test('asks for them first when the dock flashes the sketch over another one the board runs', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/learn/');
    await dock(page).getByRole('button', { name: 'Connect board' }).click();
    await expect(dock(page)).toContainText('is running a sketch');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await page.getByRole('main').getByRole('link', { name: /Balance beam/ }).click();
    await expect(dockAction(page)).toHaveAccessibleName('Flash Balance beam');

    await dockAction(page).click();

    await expect(card(page).locator('[data-message]')).toHaveText('Found ESP32. Check the settings, then flash the board.');
    await expect(field(page, 'Hotspot password')).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'monitor 115200', 'disconnect', 'connect']);

    await field(page, 'Tilt limit (degrees)').fill('30');
    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect((await fakeFlasher.calls()).slice(4)).toEqual([
      'load', 'write', 'reset', 'monitor 115200',
      'send cfg get',
      'send cfg set tilt_limit_deg 30',
      'send cfg restart',
    ]);
  });

  test('asks for the port once when Try again flashes it after a flash failed on another page', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ lines: ['sketch blink/simple'], failFirst: { write: 'NetworkError' }, board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/blink/');
    await plugIn(page);
    // A flash from the running board, which writes on the port it holds, and drops.
    await dockAction(page).click();
    await expect(dockMessage(page)).toContainText('The connection dropped');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click();
    await page.getByRole('main').getByRole('link', { name: /Balance beam/ }).click();
    await expect(dockAction(page)).toHaveAccessibleName('Try again');
    const before = (await fakeFlasher.calls()).length;

    await dockAction(page).click();

    await expect(field(page, 'Hotspot password')).toBeVisible();
    expect((await fakeFlasher.calls()).slice(before)).toEqual(['connect']);
  });

  test('keeps what the board stores in each field the visitor left as it opened', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_ssid: 'old-name', throttle_max: '0.09' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Tilt limit (degrees)').fill('30');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg set tilt_limit_deg 30',
      'send cfg restart',
    ]);
  });

  test('Use the defaults flashes, then sends nothing the board already holds', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS }, lines: ['ready'] });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Hotspot name').fill('changed, then put back');

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    await expect(dock(page).getByRole('button', { name: 'Serial' })).toHaveAccessibleDescription('ready');
    expect(await fakeFlasher.calls()).toEqual([...FLASHED, 'send cfg get']);
  });

  test('Use the defaults sends a default the board holds another value for, then restarts it', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_ssid: 'old-name', throttle_max: '0.09' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg set ap_ssid balance-beam',
      'send cfg set throttle_max 0',
      'send cfg restart',
    ]);
  });

  test('Use the defaults puts the default password back over one the board stores', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_password: 'set' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg set ap_password thebalancebot',
      'send cfg restart',
    ]);
  });

  test('sends the changed values, keeping the throttle band ordered', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Throttle min').fill('0.08');
    await field(page, 'Throttle mid').fill('0.085');
    await field(page, 'Throttle max').fill('0.09');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg set throttle_max 0.09',
      'send cfg set throttle_mid 0.085',
      'send cfg set throttle_min 0.08',
      'send cfg restart',
    ]);
  });

  test('names the field at fault before it flashes anything', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Hotspot password').fill('short');
    await field(page, 'Throttle min').fill('0.1');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('.notice')).toHaveText('Check Hotspot password: Use 8 to 63 characters.');
    await expect(field(page, 'Hotspot password')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'Hotspot password')).toBeFocused();
    await expect(field(page, 'Hotspot password')).toHaveAccessibleDescription(
      /^Use 8 to 63 characters\./,
    );
    await expect(field(page, 'Throttle mid')).toHaveAccessibleDescription(/^Use at least the Throttle min\./);
    expect(await fakeFlasher.calls()).toEqual(['connect']);
  });

  test('shows a value the board refuses beside its field, keeps the form and does not restart the board', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS, refuse: { tilt_limit_deg: 'armed' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Hotspot name').fill('beam-2');
    await field(page, 'Tilt limit (degrees)').fill('30');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('.notice')).toHaveText(
      'Check Tilt limit (degrees): The board is armed. Disarm it, then send the settings again.',
    );
    await expect(field(page, 'Tilt limit (degrees)')).toHaveAccessibleDescription(/^The board is armed\./);
    await expect(field(page, 'Tilt limit (degrees)')).toHaveValue('30');
    await expect(card(page).getByRole('button', { name: 'Send these settings' })).toBeVisible();
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg set ap_ssid beam-2',
      'send cfg set tilt_limit_deg 30',
    ]);
  });

  test('Change settings reopens the form and sends the values without flashing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await card(page).getByRole('button', { name: 'Use the defaults' }).click();
    await expect(card(page).getByRole('button')).toHaveText(['Change settings']);

    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await expect(card(page).locator('[data-message]')).toHaveText(
      'Your board is running Balance beam. Change its settings, then send them.',
    );
    await expect(field(page, 'Hotspot name')).toHaveValue('balance-beam');
    await field(page, 'Hotspot name').fill('beam-2');
    await field(page, 'Hotspot password').fill('a-new-secret');
    await card(page).getByRole('button', { name: 'Send these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg get',
      'send cfg get',
      'send cfg set ap_ssid beam-2',
      'send cfg set ap_password a-new-secret',
      'send cfg restart',
    ]);
  });

  test('Change settings opens the form at the values the board stores', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_ssid: 'old-name', throttle_max: '0.09' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await expect(field(page, 'Hotspot name')).toHaveValue('old-name');
    await expect(field(page, 'Throttle max')).toHaveValue('0.09');
    await expect(field(page, 'Hotspot password')).toHaveValue('');
    await expect(card(page).locator('[data-form-help]')).toBeHidden();
    await field(page, 'Throttle mid').fill('0.085');
    await card(page).getByRole('button', { name: 'Send these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg get',
      'send cfg get',
      'send cfg set throttle_mid 0.085',
      'send cfg restart',
    ]);
  });

  test('Change settings that edits only the hotspot name sends no password', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_password: 'set' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();
    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await field(page, 'Hotspot name').fill('beam-2');
    await card(page).getByRole('button', { name: 'Send these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg get',
      'send cfg get',
      'send cfg set ap_ssid beam-2',
      'send cfg restart',
    ]);
  });

  test('Cancel closes the reopened form and sends nothing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await card(page).getByRole('button', { name: 'Use the defaults' }).click();
    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await card(page).getByRole('button', { name: 'Cancel' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    await expect(field(page, 'Hotspot name')).toBeHidden();
    expect(await fakeFlasher.calls()).toEqual([...FLASHED, 'send cfg get', 'send cfg get']);
  });

  test('Cancel before the flash lets the board go, and moves the focus to the status, since its button goes away', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();

    await card(page).getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');

    await expect(card(page).locator('[data-message]')).toHaveText('Connect and flash it from the board bar below.');
    await expect(card(page).locator('[data-message]')).toBeFocused();
    await expect(field(page, 'Hotspot name')).toBeHidden();
    await expect(dockAction(page)).toHaveAccessibleName('Flash Balance beam');
    expect(await fakeFlasher.calls()).toEqual(['connect', 'disconnect']);
  });

  test('points the dock at the card that holds the form, and lets the board go from another page', async ({
    page,
    fakeFlasher,
  }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await expect(field(page, 'Hotspot name')).toBeVisible();
    await expect(dockMessage(page)).toHaveText(
      'The Balance beam card on this page asks for the settings. Check them, then flash the board.',
    );
    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn' }).click();
    await expect(page).toHaveURL(/\/learn\/$/);

    await expect(dockMessage(page)).toHaveText(
      'Your board waits on the settings of Balance beam. Go back to its page to finish them, or press Disconnect.',
    );
    await expect(dock(page).getByRole('link', { name: 'Balance beam' })).toHaveAttribute(
      'href',
      '/robomania/projects/balance-beam/',
    );
    await dock(page).getByRole('button', { name: 'Disconnect' }).click();

    await expect(dock(page).getByRole('button', { name: 'Connect board' })).toBeVisible();
    await expect(dock(page)).toContainText('No board');
    await expect(dock(page).getByRole('button', { name: 'Disconnect' })).toBeHidden();
    expect(await fakeFlasher.calls()).toEqual(['connect', 'disconnect']);
  });

  test('masks a password until its toggle shows it', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    const toggle = card(page).getByRole('button', { name: 'Show Hotspot password' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page, 'Hotspot password')).toHaveAttribute('type', 'text');

    await toggle.click();

    await expect(field(page, 'Hotspot password')).toHaveAttribute('type', 'password');
  });

  test('keeps the values out of the browser storage and the address', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await dockAction(page).click();
    await field(page, 'Hotspot password').fill('a-new-secret');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toContain('send cfg set ap_password a-new-secret');
    expect(page.url()).not.toContain('a-new-secret');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('a-new-secret');
  });
});
