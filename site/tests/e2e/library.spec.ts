import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const properties = readFileSync(new URL('../../../lib/library.properties', import.meta.url), 'utf8');
const version = properties.match(/^version=(\S+)\s*$/m)?.[1];

test.describe('the Library page download', () => {
  test('links the release zip of the version in lib/library.properties', async ({ page }) => {
    expect(version).toBeTruthy();
    await page.goto('/robomania/library/');

    const link = page.getByRole('link', { name: `Download robomania-${version}.zip` });
    await expect(link).toHaveAttribute(
      'href',
      `https://github.com/lmarqs/robomania/releases/download/lib-v${version}/robomania-${version}.zip`,
    );
  });

  test('says how to add the zip in the Arduino IDE and that the library is for ESP32 and ESP8266 boards', async ({ page }) => {
    await page.goto('/robomania/library/');

    const download = page.getByRole('region', { name: 'Download' });
    await expect(download).toContainText('In the Arduino IDE: Sketch > Include Library > Add .ZIP Library.');
    await expect(download).toContainText('for ESP32 and ESP8266 boards');
  });
});
