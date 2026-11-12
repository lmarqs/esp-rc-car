import { describe, expect, it } from 'vitest';
import { changedRows, clockFace, codeRows, debuggerControls, crumbs, fileName, serialText, shortcutNames, SERIAL_LINES } from '../../src/components/workbench/view';
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

  it('marks the lines that call delay(), not a print or a comment that names it', () => {
    const rows = codeRows('  delay(blinkDelay);\n  Serial.print("delay ");\n// Blink with delay()\nint blinkDelay = 1;\n', []);
    expect(rows.map((row) => row.waits)).toEqual([true, false, false, false]);
  });
});

describe('codeRows live value', () => {
  const source = 'DigitalOutPin led(2);\nint blinkDelay = 1000;\n\nvoid loop() {\n  blinkDelay = constrain(x, 100, 2000);\n}\n';

  it('marks the number the variable is declared with at the top of the file, and nothing else', () => {
    const rows = codeRows(source, [], 'blinkDelay');
    expect(rows.flatMap((row) => (row.live === undefined ? [] : [[row.number, row.tokens[row.live].text]]))).toEqual([
      [2, '1000'],
    ]);
  });

  it('marks nothing without a live variable or when the file does not declare it', () => {
    expect(codeRows(source, []).some((row) => row.live !== undefined)).toBe(false);
    expect(codeRows(source, [], 'wait').some((row) => row.live !== undefined)).toBe(false);
  });
});

describe('clockFace', () => {
  it('is empty and idle on a line that does not wait', () => {
    expect(clockFace({ status: 'running', wait: false }, 0, false)).toEqual({ waiting: false, fill: 0 });
  });

  it('fills with the share of the wait spent while running', () => {
    expect(clockFace({ status: 'running', wait: true }, 0.4, false)).toEqual({ waiting: true, fill: 0.4 });
  });

  it('shows full, without moving, while waiting under reduced motion', () => {
    expect(clockFace({ status: 'running', wait: true }, 0.4, true)).toEqual({ waiting: true, fill: 1 });
  });

  it('keeps the share spent when paused on a waiting line', () => {
    expect(clockFace({ status: 'paused', wait: true }, 0.4, true)).toEqual({ waiting: false, fill: 0.4 });
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

describe('debuggerControls', () => {
  it('offers Pause while running and Continue while paused, with Step in both', () => {
    expect(debuggerControls('running')).toEqual({ paused: false, label: 'Pause', canContinue: true, canStep: true });
    expect(debuggerControls('paused')).toEqual({ paused: true, label: 'Continue', canContinue: true, canStep: true });
  });

  it('disables Continue and Step after an error and says what happened and to restart', () => {
    expect(debuggerControls('error', new Error('line.toInt() overflowed.'))).toEqual({
      paused: true,
      label: 'Continue',
      canContinue: false,
      canStep: false,
      problem: 'The simulator stopped: line.toInt() overflowed. Restart to try again.',
    });
    expect(debuggerControls('error', undefined).problem).toBe(
      'The simulator stopped: something went wrong. Restart to try again.',
    );
  });

  it('disables Continue and Step once the sketch ended and says to restart', () => {
    expect(debuggerControls('ended')).toMatchObject({ canContinue: false, canStep: false, problem: /Restart/ });
  });
});

describe('changedRows', () => {
  const rows = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => ({ name, value }));

  it('names the rows whose value changed, but not the steady ones', () => {
    const before = rows({ LED: 'LOW', wait: '1000 ms', 'millis()': '0' });
    const after = rows({ LED: 'HIGH', wait: '1000 ms', 'millis()': '250' });
    expect(changedRows(before, after, ['millis()'])).toEqual(['LED']);
  });

  it('names nothing after a reset, when there is no previous panel', () => {
    expect(changedRows(undefined, rows({ LED: 'HIGH' }), [])).toEqual([]);
  });
});
