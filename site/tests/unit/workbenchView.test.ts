import { describe, expect, it } from 'vitest';
import { codeRows, crumbs, fileName, serialText, shortcutNames, SERIAL_LINES } from '../../src/components/workbench/view';
import { blinkCommands, blinkSimple } from '../../src/lib/workbench/steps/blink';

describe('codeRows', () => {
  it('numbers each line from 1, marks the new ones and colours the text', () => {
    const rows = codeRows('int a = 1;\n\nvoid loop() {}\n', [2, 3]);
    expect(rows.map((row) => [row.number, row.isNew])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ]);
    expect(rows[0].tokens[0]).toEqual({ text: 'int', kind: 'keyword' });
    expect(rows[1].tokens).toEqual([]);
  });
});

describe('crumbs and fileName', () => {
  it('name the path of the step .ino and its file', () => {
    expect(crumbs('sketches/blink/input')).toEqual(['sketches', 'blink', 'input', 'input.ino']);
    expect(fileName('sketches/blink/input')).toBe('input.ino');
  });
});

describe('serialText', () => {
  it('keeps the newest lines and marks a line the visitor sent', () => {
    const output = Array.from({ length: SERIAL_LINES + 2 }, (_, index) => ({ text: `line ${index}` }));
    const text = serialText([...output, { text: 'pause', sent: 1 }]);
    expect(text.split('\n')).toHaveLength(SERIAL_LINES);
    expect(text.split('\n').at(-1)).toBe('› pause');
    expect(text.split('\n')[0]).toBe('line 3');
  });

  it('is empty before the board prints', () => {
    expect(serialText([])).toBe('');
  });
});

describe('shortcutNames', () => {
  it('lists what each chip sends and each slider sets', () => {
    expect(shortcutNames(blinkCommands.shortcuts)).toBe('pause run delay');
    expect(shortcutNames(blinkSimple.shortcuts)).toBe('');
  });
});
