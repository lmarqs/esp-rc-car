import { expect, test } from './fake-serial';

test.describe('requestPort', () => {
  test('resolves with a port by default', async ({ page, fakeSerial }) => {
    await fakeSerial.install();
    await page.goto('/robomania/');

    const resolved = await page.evaluate(async () => (await navigator.serial.requestPort()) !== null);

    expect(resolved).toBe(true);
  });

  test('rejects with NotFoundError when set to', async ({ page, fakeSerial }) => {
    await fakeSerial.install({ requestPortRejects: true });
    await page.goto('/robomania/');

    const error = await page.evaluate(async () => {
      try {
        await navigator.serial.requestPort();
        return null;
      } catch (e) {
        return (e as DOMException).name;
      }
    });

    expect(error).toBe('NotFoundError');
  });
});

test.describe('open', () => {
  test('rejects with InvalidStateError when the port is busy', async ({ page, fakeSerial }) => {
    await fakeSerial.install({ openRejects: true });
    await page.goto('/robomania/');

    const error = await page.evaluate(async () => {
      const port = await navigator.serial.requestPort();
      try {
        await port.open({ baudRate: 115200 });
        return null;
      } catch (e) {
        return (e as DOMException).name;
      }
    });

    expect(error).toBe('InvalidStateError');
  });

  test('prints the configured lines after open', async ({ page, fakeSerial }) => {
    await fakeSerial.install({ lines: ['ready', 'rst:0x1'] });
    await page.goto('/robomania/');

    const text = await page.evaluate(async () => {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      const reader = port.readable!.getReader();
      const decoder = new TextDecoder();
      let received = '';
      while (!received.endsWith('rst:0x1\n')) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
      return received;
    });

    expect(text).toBe('ready\nrst:0x1\n');
  });
});

test('exposes the bytes the page wrote', async ({ page, fakeSerial }) => {
  await fakeSerial.install();
  await page.goto('/robomania/');

  await page.evaluate(async () => {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    const writer = port.writable!.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([255]));
    writer.releaseLock();
  });

  expect(await fakeSerial.written()).toEqual([[1, 2, 3], [255]]);
});
