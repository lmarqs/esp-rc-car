import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readStepSource } from '../../src/lib/workbench/readSource';
import { lineNumber, newLines, sketchSourcePath } from '../../src/lib/workbench/source';

const BLINK = ['simple', 'input', 'timer', 'commands'];
const SERVO = ['sweep', 'angle', 'commands', 'speed'];

function ladder(project: string, ids: string[]): string[] {
  return ids.map((id) => readStepSource(`sketches/${project}/${id}`));
}

describe('sketchSourcePath', () => {
  it('names the .ino after the sketch folder', () => {
    expect(sketchSourcePath('sketches/blink/simple')).toBe('sketches/blink/simple/simple.ino');
  });

  it('ignores a trailing slash', () => {
    expect(sketchSourcePath('sketches/servo/sweep/')).toBe('sketches/servo/sweep/sweep.ino');
  });
});

describe('newLines', () => {
  it('reports nothing for the first step', () => {
    expect(newLines(undefined, 'a\nb\n')).toEqual([]);
  });

  it('reports nothing for an unchanged file', () => {
    expect(newLines('a\nb\nc\n', 'a\nb\nc\n')).toEqual([]);
  });

  it('reports added lines by their 1-based number in the current file', () => {
    expect(newLines('a\nc\n', 'a\nb\nc\nd\n')).toEqual([2, 4]);
  });

  it('counts a changed line as new', () => {
    expect(newLines('a\nb\nc\n', 'a\nB\nc\n')).toEqual([2]);
  });

  it('reports nothing for lines only removed', () => {
    expect(newLines('a\nb\nc\n', 'a\nc\n')).toEqual([]);
  });

  it('keeps the longest shared run in order and reports the line moved against it', () => {
    expect(newLines('a\nb\nc\nd\n', 'a\nc\nd\nb\n')).toEqual([4]);
  });

  it('reports every line of a file that shares none', () => {
    expect(newLines('a\nb\n', 'x\ny\nz\n')).toEqual([1, 2, 3]);
  });

  it('reports a repeated line only as often as it was added', () => {
    expect(newLines('}\n', '}\n}\n')).toEqual([2]);
  });

  it('is the same for a file with and without a final newline, and for CRLF', () => {
    expect(newLines('a\nb', 'a\nb\nc')).toEqual([3]);
    expect(newLines('a\r\nb\r\n', 'a\r\nb\r\nc\r\n')).toEqual([3]);
  });

  it('reports every line when the previous file is empty', () => {
    expect(newLines('', 'a\nb\n')).toEqual([1, 2]);
  });
});

describe('readStepSource', () => {
  it('returns the sketch file as it is on disk', () => {
    const onDisk = readFileSync(new URL('../../../sketches/blink/simple/simple.ino', import.meta.url), 'utf8');

    expect(readStepSource('sketches/blink/simple')).toBe(onDisk);
  });

  it('throws for a sketch with no .ino', () => {
    expect(() => readStepSource('sketches/blink/missing')).toThrow(/sketches\/blink\/missing\/missing\.ino/);
  });
});

describe('the real ladders', () => {
  it('reports lines of input.ino that simple.ino does not have', () => {
    const [simple, input] = ladder('blink', BLINK);
    const inputLines = input.split('\n');
    const simpleLines = simple.split('\n');

    const added = newLines(simple, input);

    expect(added.length).toBeGreaterThan(0);
    for (const number of added) {
      expect(number).toBeGreaterThanOrEqual(1);
      expect(number).toBeLessThanOrEqual(inputLines.length);
      expect(inputLines[number - 1]).not.toBe(simpleLines[number - 1]);
    }
  });

  it.each([
    ['blink', BLINK],
    ['servo', SERVO],
  ])('every step of %s after the first adds lines that are in that step', (project, ids) => {
    const sources = ladder(project, ids);

    sources.slice(1).forEach((source, index) => {
      const added = newLines(sources[index], source);
      const lines = source.split('\n');

      expect(added.length).toBeGreaterThan(0);
      for (const number of added) {
        expect(lines[number - 1]).toBeDefined();
      }
    });
  });
});

describe('lineNumber', () => {
  const source = 'void loop() {\n  delay(1);\n  delay(1);\n}\n';

  it('finds a line by its trimmed text', () => {
    expect(lineNumber(source, 'void loop() {')).toBe(1);
    expect(lineNumber(source, 'delay(1);')).toBe(2);
  });

  it('counts the occurrence of a repeated line from 1', () => {
    expect(lineNumber(source, 'delay(1);', 1)).toBe(2);
    expect(lineNumber(source, 'delay(1);', 2)).toBe(3);
  });

  it('gives undefined for a line the file does not have or has fewer times', () => {
    expect(lineNumber(source, 'delay(2);')).toBeUndefined();
    expect(lineNumber(source, 'delay(1);', 3)).toBeUndefined();
  });
});
