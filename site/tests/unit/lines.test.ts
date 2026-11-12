import { describe, expect, it } from 'vitest';
import { createLineSplitter, keepLast, OUTPUT_LINES } from '../../src/lib/flash/lines';

describe('createLineSplitter', () => {
  it('returns each line a piece completes, without its break', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('HIGH\nLOW\n')).toEqual(['HIGH', 'LOW']);
  });

  it('holds a partial line until its break arrives', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('HI')).toEqual([]);
    expect(splitter.push('GH')).toEqual([]);
    expect(splitter.push('\nLO')).toEqual(['HIGH']);
    expect(splitter.push('W\n')).toEqual(['LOW']);
  });

  it('breaks lines on \\r\\n and on \\r', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('one\r\ntwo\rthree\r\n')).toEqual(['one', 'two', 'three']);
  });

  it('reads a \\r\\n split between two pieces as one break', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('one\r')).toEqual([]);
    expect(splitter.push('\ntwo\r\n')).toEqual(['one', 'two']);
  });

  it('reads a \\r at the end of a piece as a break once other text follows it', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('one\r')).toEqual([]);
    expect(splitter.push('two\n')).toEqual(['one', 'two']);
  });

  it('drops blank lines', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('\nAP up\n\n\r\nlamp blink\n')).toEqual(['AP up', 'lamp blink']);
  });

  it('keeps blank lines when asked to', () => {
    const splitter = createLineSplitter({ keepBlank: true });

    expect(splitter.push('\nAP up\n\n\r\nlamp blink\n')).toEqual(['', 'AP up', '', '', 'lamp blink']);
  });

  it('drops a line with a replacement character even when keeping blank lines', () => {
    const splitter = createLineSplitter({ keepBlank: true });

    expect(splitter.push('\uFFFDx\n\nLOW\n')).toEqual(['', 'LOW']);
  });

  it('drops a line with a replacement character, which is the boot log read at the wrong speed', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('\uFFFD\uFFFDx\uFFFD\nHIGH\nLO\uFFFDW\nLOW\n')).toEqual(['HIGH', 'LOW']);
  });

  it('drops a garbled line that is cut for its length', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('\uFFFD'.repeat(201))).toEqual([]);
    expect(splitter.push('after\n')).toEqual(['after']);
  });

  it('cuts a line that never ends', () => {
    const splitter = createLineSplitter();

    expect(splitter.push('x'.repeat(200))).toEqual([]);
    expect(splitter.push('y')).toEqual(['x'.repeat(200) + 'y']);
    expect(splitter.push('after\n')).toEqual(['after']);
  });
});

describe('keepLast', () => {
  it('keeps every line while there are no more than the limit', () => {
    expect(keepLast(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it(`keeps the last ${OUTPUT_LINES} lines`, () => {
    const lines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);

    expect(keepLast(lines.slice(0, 4), lines.slice(4))).toEqual(lines.slice(-6));
  });

  it('does not change the lines it was given', () => {
    const lines = ['a'];

    keepLast(lines, ['b']);

    expect(lines).toEqual(['a']);
  });
});
