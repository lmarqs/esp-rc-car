import { describe, expect, it } from 'vitest';
import {
  changedRows,
  clockFace,
  codeRows,
  debuggerControls,
  dotTitle,
  liveClockFace,
  notSent,
  toolbar,
  paneTag,
  crumbs,
  fileName,
  serialRows,
  SERIAL_LINES,
  followedSliderValue,
  followSlider,
} from '../../src/components/workbench/view';
import type { SessionState } from '../../src/lib/flash/session';
import { boardModel } from '../../src/lib/board/models';

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

describe('codeRows live values', () => {
  const source = [
    'DigitalOutPin led(2);',
    'int blinkDelay = 1000;',
    'bool ledOn = false;',
    'unsigned long lastToggle = 0;',
    'int target = blinkDelay;',
    '',
    'void loop() {',
    '  blinkDelay = constrain(x, 100, 2000);',
    '  ledOn = !ledOn;',
    '}',
    '',
  ].join('\n');
  const marked = (names: readonly string[]) =>
    codeRows(source, [], names).flatMap((row) =>
      row.live === undefined ? [] : [[row.number, row.live.name, row.tokens[row.live.at].text]],
    );

  it('marks the number or boolean each variable is declared with at the top of the file, and nothing else', () => {
    expect(marked(['blinkDelay', 'ledOn', 'lastToggle'])).toEqual([
      [2, 'blinkDelay', '1000'],
      [3, 'ledOn', 'false'],
      [4, 'lastToggle', '0'],
    ]);
  });

  it('marks nothing for a variable declared from another variable, or one the file does not declare', () => {
    expect(marked([])).toEqual([]);
    expect(marked(['target', 'wait'])).toEqual([]);
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

describe('serialRows', () => {
  it('keeps the newest lines and marks a line the visitor sent', () => {
    const output = Array.from({ length: SERIAL_LINES + 2 }, (_, index) => ({ text: `line ${index}` }));
    const rows = serialRows([...output, { text: 'pause', sent: 1 }]);
    expect(rows).toHaveLength(SERIAL_LINES);
    expect(rows[0]).toEqual({ text: 'line 3\n', sent: false });
    expect(rows.at(-1)).toEqual({ text: '› pause', sent: true });
  });

  it('reads as the output when joined, a blank line included', () => {
    const rows = serialRows([{ text: '' }, { text: 'sketch blink/input' }, { text: '1500', sent: 2 }]);
    expect(rows.map((row) => row.text).join('')).toBe('\nsketch blink/input\n› 1500');
  });

  it('is empty before the board prints', () => {
    expect(serialRows([])).toEqual([]);
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

describe('paneTag', () => {
  const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };

  it('reads Simulated in the simulator, and says so when the board runs this step', () => {
    expect(paneTag('simulator', { kind: 'simulated' }, { kind: 'idle' })).toEqual({
      word: 'Simulated',
      title: 'Running in the browser',
    });
    expect(paneTag('simulator', { kind: 'step', key: 'blink/simple', id: 'simple' }, running)).toEqual({
      word: 'Simulated',
      title: 'Running in the browser',
    });
    expect(paneTag('simulator', { kind: 'live' }, running)).toEqual({
      word: 'Simulated',
      title: 'Running in the browser; your board runs this step under My board',
    });
  });

  it('reads Live, drawn from what the board prints, while the pane follows the board', () => {
    expect(paneTag('live', { kind: 'live' }, running)).toEqual({
      word: 'Live',
      title: 'Drawn from what your board prints',
    });
  });

  it('reads My board and what the board runs while it waits', () => {
    expect(paneTag('waiting', { kind: 'simulated' }, { kind: 'idle' })).toEqual({ word: 'My board', title: 'Not connected' });
    expect(paneTag('waiting', { kind: 'connected' }, running)).toEqual({
      word: 'My board',
      title: 'Waiting for it to name its sketch',
    });
    expect(paneTag('waiting', { kind: 'step', key: 'blink/commands', id: 'commands' }, running)).toEqual({
      word: 'My board',
      title: 'Runs commands',
    });
    expect(paneTag('waiting', { kind: 'sketch', key: 'servo/sweep' }, running)).toEqual({
      word: 'My board',
      title: 'Runs servo/sweep',
    });
  });

  it('asks to press reset on the adapter of a board that has not named its sketch', () => {
    expect(paneTag('waiting', { kind: 'connected' }, running, boardModel('esp01s'))).toEqual({
      word: 'My board',
      title: 'Waiting for it to name its sketch: press reset on its adapter',
    });
    expect(paneTag('waiting', { kind: 'connected' }, running, boardModel('esp32'))).toEqual({
      word: 'My board',
      title: 'Waiting for it to name its sketch',
    });
  });

  it('names what the session works on while it connects, flashes or sets the board up, as the dock does', () => {
    expect(paneTag('waiting', { kind: 'simulated' }, { kind: 'connecting' })).toEqual({
      word: 'My board',
      title: 'Connecting…',
    });
    expect(paneTag('waiting', { kind: 'simulated' }, { kind: 'flashing', chip: 'ESP32', pct: 40 })).toEqual({
      word: 'My board',
      title: 'Flashing…',
    });
    expect(paneTag('waiting', { kind: 'simulated' }, { kind: 'reading', chip: 'ESP32' })).toEqual({
      word: 'My board',
      title: 'Setting up…',
    });
    expect(paneTag('waiting', { kind: 'simulated' }, { kind: 'noPort' })).toEqual({ word: 'My board', title: 'Not connected' });
  });
});

describe('dotTitle', () => {
  it('names what the session does while it works, else whether it reads a board', () => {
    expect(dotTitle({ kind: 'connecting' })).toBe('My board: connecting…');
    expect(dotTitle({ kind: 'flashing', chip: 'ESP32', pct: 40 })).toBe('My board: flashing…');
    expect(dotTitle({ kind: 'settings', chip: 'ESP32', opened: {} })).toBe('My board: setting up…');
    expect(dotTitle({ kind: 'running', chip: 'ESP32', output: [] })).toBe('My board: connected');
    expect(dotTitle({ kind: 'running', chip: 'ESP32', output: [], lost: true })).toBe('My board: not connected');
    expect(dotTitle({ kind: 'idle' })).toBe('My board: not connected');
  });
});

describe('toolbar', () => {
  it('is the simulator’s run, with Restart and Slow, in the simulator', () => {
    expect(toolbar('simulator', 'paused', undefined, true)).toEqual({
      ...debuggerControls('paused'),
      canRestart: true,
      canSlow: true,
      slow: true,
    });
    expect(toolbar('simulator', 'running', undefined, false).slow).toBe(false);
  });

  it('offers Pause, Step and Restart live, with Slow off and disabled, whatever the simulator was doing', () => {
    expect(toolbar('live', 'paused', undefined, true)).toEqual({
      paused: false,
      label: 'Pause',
      canContinue: true,
      canStep: true,
      canRestart: true,
      canSlow: false,
      slow: false,
    });
  });

  it('offers what it offers live while My board waits', () => {
    expect(toolbar('waiting', 'paused', undefined, true)).toEqual(toolbar('live', 'paused', undefined, true));
  });
});

describe('liveClockFace', () => {
  it('fills over the wait from the arrival of the line that put the board in delay(), then stays full', () => {
    expect(liveClockFace(1000, 500, 1000, false)).toEqual({ waiting: true, fill: 0 });
    expect(liveClockFace(1000, 500, 1250, false)).toEqual({ waiting: true, fill: 0.5 });
    expect(liveClockFace(1000, 500, 1900, false)).toEqual({ waiting: true, fill: 1 });
  });

  it('shows full and still under reduced motion', () => {
    expect(liveClockFace(1000, 500, 1100, true)).toEqual({ waiting: true, fill: 1 });
  });

  it('stays empty while the wait or the line the board waits in is unknown', () => {
    expect(liveClockFace(1000, undefined, 1250, false)).toEqual({ waiting: false, fill: 0 });
    expect(liveClockFace(undefined, 500, 1250, false)).toEqual({ waiting: false, fill: 0 });
  });
});

describe('notSent', () => {
  it('names the line the board did not get and says what to do', () => {
    expect(notSent('500')).toBe('The board did not get 500. Check that it is still plugged in, then send it again.');
  });
});

describe('followedSliderValue', () => {
  const slider = { follows: 'speed', min: 1, max: 360 };

  it('is the board variable when it is a number in the slider range', () => {
    expect(followedSliderValue(slider, '10')).toBe(10);
    expect(followedSliderValue(slider, '360')).toBe(360);
  });

  it('is nothing while the variable is unknown, out of range, or for a slider that follows nothing', () => {
    expect(followedSliderValue(slider, undefined)).toBeUndefined();
    expect(followedSliderValue(slider, '0')).toBeUndefined();
    expect(followedSliderValue(slider, 'x')).toBeUndefined();
    expect(followedSliderValue({ min: 1, max: 360 }, '10')).toBeUndefined();
  });
});

describe('followSlider', () => {
  it('moves the slider only when the board value changes from the one it last saw', () => {
    expect(followSlider(undefined, 90, false)).toEqual({ remembered: 90, move: 90 });
    // The visitor released 180; the board still reads 90 until the sketch takes the line.
    expect(followSlider(90, 90, false)).toEqual({ remembered: 90 });
    expect(followSlider(90, 180, false)).toEqual({ remembered: 180, move: 180 });
    expect(followSlider(180, 30, false)).toEqual({ remembered: 30, move: 30 });
  });

  it('notes a change without moving a held slider, and changes nothing while the value is unknown', () => {
    expect(followSlider(90, 91, true)).toEqual({ remembered: 91 });
    expect(followSlider(91, 91, false)).toEqual({ remembered: 91 });
    expect(followSlider(90, undefined, false)).toEqual({ remembered: 90 });
  });
});
