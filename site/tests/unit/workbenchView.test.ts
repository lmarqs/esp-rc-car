import { describe, expect, it } from 'vitest';
import {
  boardMessage,
  boardStatusText,
  changedRows,
  clockFace,
  codeRows,
  debuggerControls,
  otherStepKeys,
  liveClockFace,
  notSent,
  toolbar,
  crumbs,
  fileName,
  serialRows,
  SERIAL_LINES,
  followedSliderValue,
  followSlider,
} from '../../src/components/workbench/view';
import { viewFor } from '../../src/components/flash/view';
import type { SessionState } from '../../src/lib/flash/session';

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

describe('boardStatusText', () => {
  it('still reads Live while the simulator has the pane, and says so in the sentence', () => {
    expect(boardStatusText({ kind: 'live' }, true)).toEqual({
      word: 'Live',
      title: 'Live — the pane shows the simulator until Back to live',
    });
    expect(boardStatusText({ kind: 'simulated' }, true).title).toBe('Running in the browser');
  });

  it('reads Simulated, Connected, Live, Runs step <n> or Other sketch, with the full key in the sentence for the tooltip', () => {
    expect(boardStatusText({ kind: 'simulated' })).toEqual({ word: 'Simulated', title: 'Running in the browser' });
    expect(boardStatusText({ kind: 'connected' })).toEqual({
      word: 'Connected',
      title: 'Waiting for the board to name its sketch; flash a step to use it here',
    });
    expect(boardStatusText({ kind: 'live' })).toEqual({ word: 'Live', title: 'Your board runs this step' });
    expect(boardStatusText({ kind: 'step', key: 'blink/commands', number: 4 })).toEqual({
      word: 'Runs step 4',
      title: 'Your board runs blink/commands',
    });
    expect(boardStatusText({ kind: 'sketch', key: 'servo/sweep' })).toEqual({
      word: 'Other sketch',
      title: 'Your board runs servo/sweep',
    });
  });
});

describe('boardMessage', () => {
  const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };

  it('shows the picture while idle, while running and in a browser that cannot reach a board', () => {
    const states: SessionState[] = [{ kind: 'idle' }, running, { kind: 'unsupported' }];
    expect(states.map((state) => boardMessage(state, 'blink/input', true))).toEqual([undefined, undefined, undefined]);
  });

  it("says what the page does in the flash card's words, with the progress while flashing", () => {
    expect(boardMessage({ kind: 'connecting' }, 'blink/input', true)).toEqual({
      text: viewFor({ kind: 'connecting' }, { title: '' }).message,
      notice: false,
    });
    expect(boardMessage({ kind: 'flashing', chip: 'ESP32', pct: 40 }, 'blink/input', true)).toEqual({
      text: 'Found ESP32',
      notice: false,
      progress: 40,
    });
  });

  it("gives a failure to connect or a lost board the flash card's notice, naming the step for a missing image", () => {
    const failures: SessionState[] = [
      { kind: 'noPort' },
      { kind: 'portBusy' },
      { kind: 'noAnswer' },
      { kind: 'running', chip: 'ESP32', output: [], lost: true },
    ];
    for (const state of failures) {
      expect(boardMessage(state, 'blink/input', true)).toEqual({
        text: viewFor(state, { title: 'blink/input' }).message,
        notice: true,
      });
    }
    expect(boardMessage({ kind: 'noImage', chip: 'ESP8266', available: ['ESP32'] }, 'blink/input', true)?.text).toBe(
      'This board is an ESP8266. blink/input has images for: ESP32.',
    );
  });

  it('tells the visitor to connect again before flashing after a failed flash, as its button reads Connect', () => {
    expect(boardMessage({ kind: 'noDownload' }, 'blink/input', true)).toEqual({
      text: 'The image did not download. Check your internet connection. Connect again, then press Flash step.',
      notice: true,
    });
    expect(boardMessage({ kind: 'dropped', pct: 40 }, 'blink/input', true)).toEqual({
      text: 'The connection dropped at 40%. Nothing is broken. Plug the board back in. Connect again, then press Flash step.',
      notice: true,
    });
  });

  it('shows a refused flash until the page drops it', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/timer', available: ['ESP32'] } };
    expect(boardMessage(refused, 'blink/input', true)).toEqual({
      text: 'This board is an ESP32. blink/timer has images for: ESP32.',
      notice: true,
    });
    expect(boardMessage(refused, 'blink/input', false)).toBeUndefined();
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

  it('disables every button on a board that runs another sketch', () => {
    expect(toolbar('other', 'running', undefined, true)).toEqual({
      paused: false,
      label: 'Pause',
      canContinue: false,
      canStep: false,
      canRestart: false,
      canSlow: false,
      slow: false,
    });
  });
});

describe('otherStepKeys', () => {
  it('names the sketch the board runs and the step to flash, by their full keys', () => {
    expect(otherStepKeys({ kind: 'step', key: 'blink/simple', number: 1 }, 'blink/input')).toEqual({
      running: 'blink/simple',
      wanted: 'blink/input',
    });
    expect(otherStepKeys({ kind: 'sketch', key: 'servo/sweep' }, 'blink/input')).toEqual({
      running: 'servo/sweep',
      wanted: 'blink/input',
    });
  });

  it('names nothing while simulated or live', () => {
    expect(otherStepKeys({ kind: 'simulated' }, 'blink/input')).toBeUndefined();
    expect(otherStepKeys({ kind: 'live' }, 'blink/input')).toBeUndefined();
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
