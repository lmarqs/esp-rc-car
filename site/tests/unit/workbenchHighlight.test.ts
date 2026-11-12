import { describe, expect, it } from 'vitest';
import { highlightLine } from '../../src/lib/workbench/highlight';

describe('highlightLine', () => {
  it('colours a call, its string and its pin level', () => {
    expect(highlightLine('  Serial.println("HIGH");')).toEqual([
      { text: '  Serial.' },
      { text: 'println', kind: 'function' },
      { text: '(' },
      { text: '"HIGH"', kind: 'string' },
      { text: ');' },
    ]);
    expect(highlightLine('  led.write(HIGH);')).toEqual([
      { text: '  led.' },
      { text: 'write', kind: 'function' },
      { text: '(' },
      { text: 'HIGH', kind: 'number' },
      { text: ');' },
    ]);
  });

  it('colours keywords and types, numbers, and leaves a variable plain', () => {
    expect(highlightLine('int blinkDelay = 1000;')).toEqual([
      { text: 'int', kind: 'keyword' },
      { text: ' blinkDelay = ' },
      { text: '1000', kind: 'number' },
      { text: ';' },
    ]);
  });

  it('reads a control word before a parenthesis as a keyword, not a function', () => {
    expect(highlightLine('  if (Serial.available()) {')).toEqual([
      { text: '  ' },
      { text: 'if', kind: 'keyword' },
      { text: ' (Serial.' },
      { text: 'available', kind: 'function' },
      { text: '()) {' },
    ]);
  });

  it('keeps an escaped quote inside a character literal', () => {
    expect(highlightLine("    String line = Serial.readStringUntil('\\n');")).toContainEqual({
      text: "'\\n'",
      kind: 'string',
    });
  });

  it('colours a comment to the end of the line, and nothing inside it', () => {
    expect(highlightLine('  delay(10); // wait "here"')).toEqual([
      { text: '  ' },
      { text: 'delay', kind: 'function' },
      { text: '(' },
      { text: '10', kind: 'number' },
      { text: '); ' },
      { text: '// wait "here"', kind: 'comment' },
    ]);
  });

  it('splits a preprocessor line into its directive and its argument', () => {
    expect(highlightLine('#include <Arduino.h>')).toEqual([
      { text: '#include', kind: 'keyword' },
      { text: ' ' },
      { text: '<Arduino.h>', kind: 'string' },
    ]);
  });

  it('gives back the line when its runs are joined, and nothing for an empty line', () => {
    const line = '  if (!paused && millis() - lastToggle >= blinkDelay) {';
    expect(
      highlightLine(line)
        .map((token) => token.text)
        .join(''),
    ).toBe(line);
    expect(highlightLine('')).toEqual([]);
  });
});
