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

test.describe('a project whose sketch has settings', () => {
  test('asks for them between Connect and Flash, filled with the defaults', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');

    await expect(card(page).getByRole('listitem')).toHaveText(['Connect', 'Settings', 'Flash', 'Running']);
    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await expect(card(page).locator('[data-message]')).toHaveText('Found ESP32. Check the settings, then flash the board.');
    await expect(card(page).locator('[aria-current="step"]')).toHaveText('Settings');
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
    expect(await fakeFlasher.calls()).toEqual(['connect']);
  });

  test('Use the defaults flashes, then sends nothing the board already holds', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS }, lines: ['ready'] });
    await page.goto('/robomania/projects/balance-beam/');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await field(page, 'Hotspot name').fill('changed, then put back');

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
    await expect(card(page).getByLabel('Board output, 115200 baud')).toHaveText('ready');
    expect(await fakeFlasher.calls()).toEqual([...FLASHED, 'send cfg get']);
  });

  test('sends a default the board holds another value for, then restarts it', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_ssid: 'old-name', throttle_max: '0.09' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();

    await card(page).getByRole('button', { name: 'Use the defaults' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await field(page, 'Throttle min').fill('0.08');
    await field(page, 'Throttle mid').fill('0.085');
    await field(page, 'Throttle max').fill('0.09');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await card(page).getByRole('button', { name: 'Use the defaults' }).click();
    await expect(card(page).getByRole('button')).toHaveText(['Change settings', 'Flash again', 'Disconnect']);

    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await expect(card(page).locator('[data-message]')).toHaveText(
      'Your board is running Balance beam. Change its settings, then send them.',
    );
    await expect(field(page, 'Hotspot name')).toHaveValue('balance-beam');
    await field(page, 'Hotspot name').fill('beam-2');
    await field(page, 'Hotspot password').fill('a-new-secret');
    await card(page).getByRole('button', { name: 'Send these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg get',
      'send cfg set ap_ssid beam-2',
      'send cfg set ap_password a-new-secret',
      'send cfg restart',
    ]);
  });

  test('Change settings that edits only the hotspot name sends no password', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: { ...DEFAULTS, ap_password: 'set' } } });
    await page.goto('/robomania/projects/balance-beam/');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();
    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await field(page, 'Hotspot name').fill('beam-2');
    await card(page).getByRole('button', { name: 'Send these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toEqual([
      ...FLASHED,
      'send cfg get',
      'send cfg get',
      'send cfg set ap_ssid beam-2',
      'send cfg restart',
    ]);
  });

  test('Cancel closes the reopened form and sends nothing', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await card(page).getByRole('button', { name: 'Use the defaults' }).click();
    await card(page).getByRole('button', { name: 'Change settings' }).click();

    await card(page).getByRole('button', { name: 'Cancel' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
    await expect(field(page, 'Hotspot name')).toBeHidden();
    expect(await fakeFlasher.calls()).toEqual([...FLASHED, 'send cfg get']);
  });

  test('masks a password until its toggle shows it', async ({ page, fakeFlasher }) => {
    await fakeFlasher.install({ board: { values: DEFAULTS } });
    await page.goto('/robomania/projects/balance-beam/');
    await card(page).getByRole('button', { name: 'Connect board' }).click();
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
    await card(page).getByRole('button', { name: 'Connect board' }).click();
    await field(page, 'Hotspot password').fill('a-new-secret');

    await card(page).getByRole('button', { name: 'Flash with these settings' }).click();

    await expect(card(page).locator('[data-message]')).toContainText('Done. Your board is running Balance beam.');
    expect(await fakeFlasher.calls()).toContain('send cfg set ap_password a-new-secret');
    expect(page.url()).not.toContain('a-new-secret');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('a-new-secret');
  });
});
