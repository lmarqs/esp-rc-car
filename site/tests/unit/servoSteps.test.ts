import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStepSource } from '../../src/lib/workbench/readSource';
import { createRunner, type Runner } from '../../src/lib/workbench/simulator';
import { lineNumber } from '../../src/lib/workbench/source';
import {
  angleReply,
  commandsReply,
  isNumber,
  parseServoLine,
  SERVO_PIN,
  servoAngle,
  servoCommands,
  servoSpeed,
  servoSteps,
  servoSweep,
  speedReply,
  type ServoState,
  type ServoStep,
} from '../../src/lib/workbench/steps/servo';

interface Printed {
  readonly at: number;
  readonly text: string;
}

/** A runner at full speed with a record of every printed line, the simulated time it was printed at, and every turn. */
function start(step: ServoStep) {
  const runner = createRunner(step.program);
  const printed: Printed[] = [];
  const turns: string[] = [];
  runner.subscribe((view, effects) => {
    for (const effect of effects) {
      if (effect.kind === 'print') printed.push({ at: view.millis, text: effect.text });
      if (effect.kind === 'turn') turns.push(`${effect.pin} ${effect.degrees}`);
    }
  });
  return { runner, printed, turns };
}

/** The lines printed after setup's blank line and name, as `<ms> <text>`. */
const afterName = (printed: readonly Printed[]) => printed.slice(2).map(({ at, text }) => `${at} ${text}`);
const texts = (printed: readonly Printed[]) => printed.slice(2).map(({ text }) => text);

function stepUntil(runner: Runner<ServoState>, line: string, maxSteps = 500): void {
  for (let i = 0; i < maxSteps && runner.view().line !== line; i++) runner.step();
  expect(runner.view().line).toBe(line);
}

/** The first line of `loop()` each step comes back to between passes. */
const LOOP_START: Record<string, string> = {
  'servo/sweep': 'for (int angle = 0; angle <= 180; angle += 1) {',
  'servo/angle': 'if (Serial.available()) {',
  'servo/commands': 'while (Serial.available()) {',
  'servo/speed': 'while (Serial.available()) {',
};

/** What `step` printed after setup in answer to each of `inputs`, sent one at a time, stepping line by line. */
function repliesTo(step: ServoStep, inputs: readonly string[]): string[] {
  const { runner, printed } = start(step);
  stepUntil(runner, LOOP_START[step.key]);
  const replies: string[] = [];
  for (const input of inputs) {
    const before = printed.length;
    runner.send(input);
    for (let i = 0; i < 100 && runner.view().queued.length > 0; i++) runner.step();
    stepUntil(runner, LOOP_START[step.key]);
    replies.push(...printed.slice(before).map((line) => line.text));
  }
  runner.dispose();
  return replies;
}

describe('line references', () => {
  /** Every line of `source` an operation of `step` names while it runs `inputs`, as `text#occurrence`. */
  function visitedLines(step: ServoStep, inputs: readonly string[], steps = 3000): Map<string, number | undefined> {
    vi.useFakeTimers();
    const runner = createRunner(step.program);
    const seen = new Map<string, { text: string; occurrence: number }>();
    const note = () => {
      const { line, occurrence } = runner.view();
      if (line !== undefined) seen.set(`${line}#${occurrence}`, { text: line, occurrence });
    };
    runner.subscribe(note);
    note();
    runner.run();
    // At full speed, so the sweeps reach both ends; each line goes out on its own pass.
    runner.setSlow(false);
    for (const text of inputs) {
      vi.advanceTimersByTime(400);
      runner.send(text);
    }
    vi.advanceTimersByTime(steps);
    runner.dispose();
    vi.useRealTimers();
    const source = readStepSource(step.sketch);
    return new Map([...seen].map(([key, { text, occurrence }]) => [key, lineNumber(source, text, occurrence)]));
  }

  const scenarios: [ServoStep, string[]][] = [
    [servoSweep, []],
    [servoAngle, ['120', 'abc', '', '181']],
    // From 179 the sweep turns at 180 and, 2.7 s on, at 0, while the commands between stop nothing.
    [servoCommands, ['angle 179', 'sweep', 'sweep', 'angle 999', 'angle', 'foo', '', '  ', 'angle 1', 'stop']],
    // At 360 °/s the sweep turns at each end within the 400 ms between two lines.
    [servoSpeed, ['speed 360', 'angle 178', 'sweep', 'sweep', 'stop', 'speed 0', 'angle 999', 'foo', '']],
  ];

  it.each(scenarios)('$key: every named line is in the real .ino', (step, inputs) => {
    const missing = [...visitedLines(step, inputs)].filter(([, number]) => number === undefined).map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it.each(scenarios)(
    '$key: every statement from setup() on is named, but those taking one character and the bare } else {',
    (step, inputs) => {
      const source = readStepSource(step.sketch);
      const named = new Set(
        [...visitedLines(step, inputs, 6000).values()].filter((number): number is number => number !== undefined),
      );
      const lines = source.split('\n');
      const setupAt = lines.findIndex((line) => line.trim() === 'void setup() {');
      const unnamed = lines
        .map((text, index) => ({ text: text.trim(), number: index + 1 }))
        .filter(({ text, number }) => number > setupAt + 1 && text !== '' && !/^\}?$|^void \w+\(\) \{$/.test(text))
        .filter(({ number }) => !named.has(number))
        .map(({ text }) => text);
      const unnamedIn: Record<string, string[]> = {
        'servo/commands': ['line += c;', 'continue;', '} else {'],
        'servo/speed': ['line += c;', 'continue;', '} else {', '} else {'],
      };
      expect(unnamed).toEqual(unnamedIn[step.key] ?? []);
    },
  );

  it('names the body of writeAngle(), where the servo turns', () => {
    for (const [step, write] of [
      [servoAngle, 'servo.write(degrees);'],
      [servoCommands, 'servo.write(angle);'],
      [servoSpeed, 'servo.write(angle);'],
    ] as const) {
      expect([...visitedLines(step, []).keys()]).toContain(`${write}#1`);
    }
  });

  it('names both copies of the lines sweep holds twice', () => {
    const lines = [...visitedLines(servoSweep, [], 6000).keys()];
    for (const text of ['servo.write(angle);', 'Serial.println(angle);', 'delay(15);']) {
      expect(lines).toContain(`${text}#1`);
      expect(lines).toContain(`${text}#2`);
    }
  });

  it('fails to resolve a line that the .ino no longer has', () => {
    const source = readStepSource(servoSweep.sketch);
    const dropSecondDelay = source.replace(/(delay\(15\);\n)([\s\S]*?)delay\(15\);\n/, '$1$2');
    const renamed = source.replace('servo.write(angle);', 'servo.write(angle + 0);');
    const visited = visitedLines(servoSweep, [], 6000);

    const unresolvedIn = (mutated: string) =>
      [...visited.keys()].filter((key) => {
        const [text, occurrence] = key.split('#');
        return lineNumber(mutated, text, Number(occurrence)) === undefined;
      });

    expect(unresolvedIn(source)).toEqual([]);
    expect(unresolvedIn(dropSecondDelay)).toEqual(['delay(15);#2']);
    expect(unresolvedIn(renamed)).toEqual(['servo.write(angle);#2']);
  });
});

describe('the four steps', () => {
  it('lists the steps in order with the sketch each one simulates', () => {
    expect(servoSteps.map((step) => [step.key, step.sketch])).toEqual([
      ['servo/sweep', 'sketches/servo/sweep'],
      ['servo/angle', 'sketches/servo/angle'],
      ['servo/commands', 'sketches/servo/commands'],
      ['servo/speed', 'sketches/servo/speed'],
    ]);
  });

  it('offers no shortcut on sweep, an angle slider from angle on, sweep and stop chips and a speed slider', () => {
    expect(servoSweep.shortcuts).toEqual([]);

    const [bare] = servoAngle.shortcuts;
    expect(servoAngle.shortcuts).toHaveLength(1);
    expect(bare).toMatchObject({ kind: 'slider', label: 'angle', min: 0, max: 180, step: 1, initial: 90 });
    expect(bare.kind === 'slider' && bare.command(120)).toBe('120');

    for (const step of [servoCommands, servoSpeed]) {
      const [sweep, stop, angle] = step.shortcuts;
      expect(sweep).toEqual({ kind: 'chip', text: 'sweep' });
      expect(stop).toEqual({ kind: 'chip', text: 'stop' });
      expect(angle).toMatchObject({ kind: 'slider', label: 'angle', min: 0, max: 180 });
      expect(angle.kind === 'slider' && angle.command(45)).toBe('angle 45');
    }
    expect(servoCommands.shortcuts).toHaveLength(3);

    const speed = servoSpeed.shortcuts[3];
    expect(servoSpeed.shortcuts).toHaveLength(4);
    expect(speed).toMatchObject({ kind: 'slider', label: 'speed', min: 1, max: 360, step: 1, initial: 60 });
    expect(speed.kind === 'slider' && speed.command(10)).toBe('speed 10');
  });

  it('points each slider at the board variable it shows: the angle, the target on speed, and the speed', () => {
    const follows = (step: ServoStep) => step.shortcuts.map((shortcut) => (shortcut.kind === 'slider' ? shortcut.follows : 'chip'));
    expect(follows(servoAngle)).toEqual(['angle']);
    expect(follows(servoCommands)).toEqual(['chip', 'chip', 'angle']);
    expect(follows(servoSpeed)).toEqual(['chip', 'chip', 'target', 'speed']);
  });

  it.each(servoSteps)('$key has a hint of one or two sentences', (step) => {
    expect(step.hint.match(/[.!?](\s|$)/g)?.length).toBeLessThanOrEqual(2);
    expect(step.hint.endsWith('.')).toBe(true);
  });

  it.each(servoSteps)('$key prints a blank line, then its name, as setup() does', (step) => {
    const { runner, printed } = start(step);
    stepUntil(runner, 'servo.begin();');
    runner.step();
    expect(printed.map((line) => line.text)).toEqual(['', `sketch ${step.key}`]);
    expect(step.parse(printed[0].text)).toBeUndefined();
    expect(step.parse(printed[1].text)).toEqual({ kind: 'sketch', key: step.key });
  });

  it.each([servoAngle, servoCommands, servoSpeed])('$key writes 90 to the servo and prints it at the end of setup()', (step) => {
    const { runner, printed, turns } = start(step);
    stepUntil(runner, LOOP_START[step.key]);
    expect(texts(printed)).toEqual(['angle 90']);
    expect(turns).toEqual([`${SERVO_PIN} 90`]);
  });

  it('sweep writes nothing in setup(): the servo has no angle until the first loop writes 0', () => {
    const { runner, printed, turns } = start(servoSweep);
    stepUntil(runner, LOOP_START['servo/sweep']);
    expect(texts(printed)).toEqual([]);
    expect(turns).toEqual([]);
  });

  it('shows the live variable the sketch declares: angle on commands, speed on speed, none before', () => {
    expect(servoSweep.live).toBeUndefined();
    expect(servoAngle.live).toBeUndefined();
    expect(servoCommands.live?.name).toBe('angle');
    expect(servoCommands.live?.value({ ...servoCommands.program.init(), angle: 45 })).toBe('45');
    expect(servoSpeed.live?.name).toBe('speed');
    expect(servoSpeed.live?.value({ ...servoSpeed.program.init(), speed: 10 })).toBe('10');
  });

  it('places no arrow on a real board: no printed line pins one source line', () => {
    for (const step of servoSteps) expect(step.liveLine).toBeUndefined();
  });
});

describe('parseServoLine', () => {
  it('turns each board line into an event', () => {
    expect(parseServoLine('sketch servo/speed')).toEqual({ kind: 'sketch', key: 'servo/speed' });
    expect(parseServoLine('angle 120')).toEqual({ kind: 'angle', degrees: 120 });
    expect(parseServoLine('target 95')).toEqual({ kind: 'target', degrees: 95 });
    expect(parseServoLine('speed 10')).toEqual({ kind: 'speed', degreesPerSecond: 10 });
    expect(parseServoLine('sweeping')).toEqual({ kind: 'sweeping' });
    expect(parseServoLine('stopped')).toEqual({ kind: 'stopped' });
    expect(parseServoLine('error angle must be 0-180')).toEqual({ kind: 'error', message: 'angle must be 0-180' });
    expect(parseServoLine('error unknown command')).toEqual({ kind: 'error', message: 'unknown command' });
  });

  it('gives no event for a blank line or a near miss', () => {
    for (const line of ['', 'angle', 'angle x', 'angle -5', 'Angle 5', 'target', 'error', 'sweeping ', 'HIGH']) {
      expect(parseServoLine(line)).toBeUndefined();
    }
  });
});

describe('isNumber', () => {
  it('takes one to three digits from low to high, as the sketches check them', () => {
    expect(isNumber('0', 0, 180)).toBe(true);
    expect(isNumber('180', 0, 180)).toBe(true);
    expect(isNumber('007', 0, 180)).toBe(true);
    for (const text of ['', '181', '1000', '0180', '-5', '+5', '9x', ' 9', '4.5']) expect(isNumber(text, 0, 180)).toBe(false);
    expect(isNumber('0', 1, 360)).toBe(false);
    expect(isNumber('360', 1, 360)).toBe(true);
  });
});

describe('servo/sweep', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('writes 0 to 180, then 179 down to 1, one degree every 15 ms, and turns without printing an end twice', () => {
    const { runner, printed, turns } = start(servoSweep);
    runner.run();
    const cycle = 360 * 15;
    vi.advanceTimersByTime(cycle + 15);
    const up = Array.from({ length: 181 }, (_, angle) => angle);
    const down = Array.from({ length: 179 }, (_, i) => 179 - i);
    const expected = [...up, ...down, 0, 1].map((angle, index) => `${index * 15} angle ${angle}`);
    expect(afterName(printed)).toEqual(expected);
    expect(turns).toEqual([...up, ...down, 0, 1].map((angle) => `${SERVO_PIN} ${angle}`));
    runner.dispose();
  });

  it('turns the servo at servo.write(), before it prints the angle', () => {
    const { runner, printed, turns } = start(servoSweep);
    stepUntil(runner, 'servo.write(angle);');
    expect(turns).toEqual([]);
    runner.step();
    expect(turns).toEqual([`${SERVO_PIN} 0`]);
    expect(texts(printed)).toEqual([]);
    stepUntil(runner, 'delay(15);');
    expect(texts(printed)).toEqual(['angle 0']);
  });
});

describe('servo/angle', () => {
  it('turns to a number from 0 to 180 and answers anything else that is not blank with an error', () => {
    expect(repliesTo(servoAngle, ['120', ' 45 ', '007', '0', '180', '181', 'abc', '1000', '-5', '9x', '', '   '])).toEqual([
      'angle 120',
      'angle 45',
      'angle 7',
      'angle 0',
      'angle 180',
      'error angle must be 0-180',
      'error angle must be 0-180',
      'error angle must be 0-180',
      'error angle must be 0-180',
      'error angle must be 0-180',
    ]);
  });

  it('leaves the servo alone on an error', () => {
    const { runner, turns } = start(servoAngle);
    stepUntil(runner, LOOP_START['servo/angle']);
    runner.send('abc');
    runner.send('200');
    for (let i = 0; i < 30; i++) runner.step();
    expect(turns).toEqual([`${SERVO_PIN} 90`]);
  });

  it('turns the servo at servo.write(degrees), before it prints the angle', () => {
    const { runner, printed, turns } = start(servoAngle);
    stepUntil(runner, LOOP_START['servo/angle']);
    runner.send('30');
    stepUntil(runner, 'servo.write(degrees);');
    expect(turns).toEqual([`${SERVO_PIN} 90`]);
    runner.step();
    expect(turns).toEqual([`${SERVO_PIN} 90`, `${SERVO_PIN} 30`]);
    expect(texts(printed)).toEqual(['angle 90']);
  });
});

describe('servo/commands', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('answers each command as the sketch does', () => {
    vi.useRealTimers();
    expect(repliesTo(servoCommands, ['angle 45', 'angle 181', 'angle', 'angle x', 'stop', 'foo', '', 'Sweep'])).toEqual([
      'angle 45',
      'error angle must be 0-180',
      'error unknown command',
      'error angle must be 0-180',
      'stopped',
      'error unknown command',
      'error unknown command',
    ]);
  });

  /** A run at full speed: `actions` are a time on the simulated clock and a line to send then. */
  function run(step: ServoStep, actions: readonly [number, string][], until: number) {
    const { runner, printed } = start(step);
    runner.run();
    for (const [at, text] of actions) {
      vi.advanceTimersByTime(at - runner.view().millis);
      runner.send(text);
    }
    vi.advanceTimersByTime(until - runner.view().millis);
    runner.dispose();
    return printed;
  }

  it('sweeps up from the angle it holds, one degree every 15 ms, at once on the sweep command', () => {
    const printed = run(servoCommands, [[1000, 'sweep']], 1100);
    const lines = afterName(printed);
    expect(lines[0]).toBe('0 angle 90');
    const at = printed.find((line) => line.text === 'sweeping')!.at;
    expect(lines.slice(1)).toEqual([
      `${at} sweeping`,
      `${at} angle 91`,
      `${at + 15} angle 92`,
      `${at + 30} angle 93`,
      `${at + 45} angle 94`,
      `${at + 60} angle 95`,
      `${at + 75} angle 96`,
    ]);
  });

  it('turns at 180 and at 0 without printing an end twice', () => {
    const printed = run(servoCommands, [[100, 'angle 178'], [500, 'sweep']], 500 + 15 * 185);
    const angles = texts(printed).filter((text) => text.startsWith('angle '));
    expect(angles.slice(0, 2)).toEqual(['angle 90', 'angle 178']);
    expect(angles.slice(2, 8)).toEqual(['angle 179', 'angle 180', 'angle 179', 'angle 178', 'angle 177', 'angle 176']);
    const downTo = run(servoCommands, [[100, 'angle 180'], [500, 'sweep']], 525 + 15 * 181);
    expect(texts(downTo).filter((text) => text.startsWith('angle ')).slice(-4)).toEqual([
      'angle 1',
      'angle 0',
      'angle 1',
      'angle 2',
    ]);
  });

  it('answers sweep while sweeping with sweeping alone, and keeps the step timer when a command arrives', () => {
    const printed = run(servoCommands, [[1000, 'sweep'], [1040, 'sweep']], 1100);
    const at = printed.find((line) => line.text === 'sweeping')!.at;
    const lines = afterName(printed).slice(1);
    expect(lines.filter((line) => line.endsWith('sweeping'))).toHaveLength(2);
    // Every step stays on the 15 ms grid of the first, whenever the second sweep arrived.
    for (const line of lines.filter((each) => each.includes(' angle '))) {
      expect((Number(line.split(' ')[0]) - at) % 15).toBe(0);
    }
  });

  it('stops on stop and holds the angle, and an angle command stops a sweep too', () => {
    const stopped = run(servoCommands, [[1000, 'sweep'], [1100, 'stop']], 2000);
    const last = texts(stopped).at(-1);
    expect(last).toBe('stopped');
    const turned = run(servoCommands, [[1000, 'sweep'], [1100, 'angle 10']], 2000);
    expect(texts(turned).at(-1)).toBe('angle 10');
  });
});

describe('servo/speed', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function run(actions: readonly [number, string][], until: number) {
    const { runner, printed } = start(servoSpeed);
    runner.run();
    for (const [at, text] of actions) {
      vi.advanceTimersByTime(at - runner.view().millis);
      runner.send(text);
    }
    vi.advanceTimersByTime(until - runner.view().millis);
    const state = runner.view().state;
    runner.dispose();
    return { printed, state };
  }

  it('answers each command as the sketch does', () => {
    vi.useRealTimers();
    expect(
      repliesTo(servoSpeed, ['speed 10', 'speed 0', 'speed 361', 'speed', 'speed x', 'angle 181', 'stop', 'bar']),
    ).toEqual([
      'speed 10',
      'error speed must be 1-360',
      'error speed must be 1-360',
      'error unknown command',
      'error speed must be 1-360',
      'error angle must be 0-180',
      'stopped',
      'error unknown command',
    ]);
  });

  it('at speed 10, moves from 90 to a target of 95 one degree every 100 ms, then goes quiet', () => {
    const { printed, state } = run(
      [
        [1000, 'speed 10'],
        [1000, 'angle 95'],
      ],
      3000,
    );
    const at = printed.find((line) => line.text === 'speed 10')!.at;
    expect(afterName(printed)).toEqual([
      '0 angle 90',
      `${at} speed 10`,
      `${at} target 95`,
      `${at} angle 91`,
      `${at + 100} angle 92`,
      `${at + 200} angle 93`,
      `${at + 300} angle 94`,
      `${at + 400} angle 95`,
    ]);
    expect(state).toMatchObject({ angle: 95, target: 95, speed: 10, sweeping: false });
  });

  it('moves every 1000 / speed ms in integer division: 2 ms at 360, 16 ms at the 60 it starts with', () => {
    const fast = run([[1000, 'speed 360'], [1000, 'angle 93']], 2000).printed;
    const at = fast.find((line) => line.text === 'target 93')!.at;
    expect(afterName(fast).slice(-3)).toEqual([`${at} angle 91`, `${at + 2} angle 92`, `${at + 4} angle 93`]);
    const usual = run([[1000, 'angle 88']], 2000).printed;
    const from = usual.find((line) => line.text === 'target 88')!.at;
    expect(afterName(usual).slice(-2)).toEqual([`${from} angle 89`, `${from + 16} angle 88`]);
  });

  it('sweeps at the set speed toward 180, then turns toward 0, and stop makes the estimate the target', () => {
    const { printed } = run([[1000, 'speed 360'], [1000, 'angle 178'], [1300, 'sweep']], 1400);
    const angles = texts(printed).filter((text) => text.startsWith('angle '));
    const end = angles.indexOf('angle 180');
    expect(angles.slice(end - 2, end + 3)).toEqual(['angle 178', 'angle 179', 'angle 180', 'angle 179', 'angle 178']);
    expect(angles.filter((angle) => angle === 'angle 180')).toHaveLength(1);

    const { printed: stopped, state } = run([[1000, 'sweep'], [1500, 'stop']], 3000);
    expect(texts(stopped).at(-1)).toBe('stopped');
    expect(state.target).toBe(state.angle);
    expect(state.sweeping).toBe(false);
  });

  it('turns a sweep from 180 toward 0', () => {
    const { printed } = run([[1000, 'speed 360'], [1000, 'angle 180'], [1500, 'sweep']], 1560);
    const lines = texts(printed);
    const from = lines.indexOf('sweeping');
    expect(lines.slice(from - 1, from + 3)).toEqual(['angle 180', 'sweeping', 'angle 179', 'angle 178']);
  });

  it('keeps the angle it is at when an error arrives', () => {
    const { printed, state } = run([[1000, 'speed 0'], [1100, 'angle 200']], 1500);
    expect(texts(printed)).toEqual(['angle 90', 'error speed must be 1-360', 'error angle must be 0-180']);
    expect(state).toMatchObject({ angle: 90, target: 90, speed: 60 });
  });
});

describe('the cost of a pass through loop()', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('is the idle time while nothing moves: 250 ms when stepping, 25 ms at full speed', () => {
    const { runner } = start(servoCommands);
    stepUntil(runner, 'while (Serial.available()) {');
    expect(runner.view().cost).toBe(250);
    runner.setSlow(false);
    runner.run();
    expect(runner.view().cost).toBe(25);
    runner.dispose();
  });

  it('is the idle time at most while a slow move waits, and the rest of the wait as the move falls due', () => {
    const { runner } = start(servoSpeed);
    stepUntil(runner, 'while (Serial.available()) {');
    runner.send('speed 1');
    runner.send('angle 92');
    stepUntil(runner, 'Serial.println(angle);');
    stepUntil(runner, 'while (Serial.available()) {');
    expect(runner.view().cost).toBe(250);
    const moved = runner.view().millis;
    for (let pass = 0; pass < 4; pass++) {
      expect(runner.view().cost).toBe(Math.min(250, moved + 1000 - runner.view().millis));
      runner.step();
      stepUntil(runner, 'while (Serial.available()) {');
    }
    expect(runner.view().millis).toBe(moved + 1000);
  });

  /** A run at full speed of `step`: `actions` are a time on the simulated clock and a line to send then. */
  function run(step: ServoStep, actions: readonly [number, string][], until: number) {
    const { runner, printed } = start(step);
    runner.run();
    for (const [at, text] of actions) {
      vi.advanceTimersByTime(at - runner.view().millis);
      runner.send(text);
    }
    vi.advanceTimersByTime(until - runner.view().millis);
    runner.dispose();
    return printed;
  }

  it('reads a line sent while a slow move waits within 25 ms at full speed, and still moves every 1000 / speed ms', () => {
    const printed = run(servoSpeed, [[1000, 'speed 1'], [1000, 'angle 0'], [2100, 'stop']], 4000);
    const at = (text: string) => printed.find((line) => line.text === text)!.at;
    const start = at('target 0');
    expect(afterName(printed).slice(1, 6)).toEqual([
      `${start} speed 1`,
      `${start} target 0`,
      `${start} angle 89`,
      `${start + 1000} angle 88`,
      expect.stringMatching(/ stopped$/),
    ]);
    expect(at('stopped') - 2100).toBeGreaterThanOrEqual(0);
    expect(at('stopped') - 2100).toBeLessThanOrEqual(25);
    expect(texts(printed).at(-1)).toBe('stopped');
  });

  it('reads a line sent mid-sweep on commands within 25 ms, and keeps every step on the 15 ms grid', () => {
    const printed = run(servoCommands, [[1000, 'sweep'], [1007, 'angle 120']], 1100);
    const swept = printed.find((line) => line.text === 'sweeping')!.at;
    const steps = printed.filter((line) => line.text.startsWith('angle ') && line.at >= swept && line.text !== 'angle 120');
    for (const step of steps) expect((step.at - swept) % 15).toBe(0);
    expect(printed.find((line) => line.text === 'angle 120')!.at - 1007).toBeLessThanOrEqual(25);
  });
});

describe('the lines that answer a sent line', () => {
  it('are exactly the line the sketch prints for it', () => {
    expect(servoAngle.answers?.('angle 120', '120')).toBe(true);
    expect(servoAngle.answers?.('angle 121', '120')).toBe(false);
    expect(servoAngle.answers?.('error angle must be 0-180', 'abc')).toBe(true);
    expect(servoCommands.answers?.('angle 45', 'angle 45')).toBe(true);
    expect(servoCommands.answers?.('angle 46', 'angle 45')).toBe(false);
    expect(servoCommands.answers?.('sweeping', 'sweep')).toBe(true);
    expect(servoCommands.answers?.('stopped', 'sweep')).toBe(false);
    expect(servoSpeed.answers?.('target 95', 'angle 95')).toBe(true);
    expect(servoSpeed.answers?.('angle 95', 'angle 95')).toBe(false);
    expect(servoSpeed.answers?.('speed 10', 'speed 10')).toBe(true);
    expect(servoSpeed.answers?.('error speed must be 1-360', 'speed 0')).toBe(true);
  });

  it('are expected for every line that is not blank, and none on sweep', () => {
    for (const step of [servoAngle, servoCommands, servoSpeed]) {
      expect(step.expectsAnswer?.('anything')).toBe(true);
      expect(step.expectsAnswer?.('   ')).toBe(false);
    }
    expect(servoSweep.answers).toBeUndefined();
    expect(servoSweep.expectsAnswer).toBeUndefined();
  });

  // None of these starts a move, which would print more between two replies.
  it.each([
    [servoAngle, angleReply, ['90', '181', ' 7 ', '055', '0180', 'angle 45', 'x', '', '\t']],
    [servoCommands, commandsReply, ['angle 45', ' angle 7 ', 'angle 0180', 'angle', 'stop', 'x', '90', '']],
    [servoSpeed, speedReply, ['angle 90', 'angle 0180', 'angle', 'speed 360', 'speed 361', 'speed 007', 'stop', 'x', '']],
  ] as const)('are what the simulated sketch prints, for %#', (step, reply, inputs) => {
    expect(repliesTo(step, inputs)).toEqual(inputs.map(reply).filter((line) => line !== undefined));
  });
});
