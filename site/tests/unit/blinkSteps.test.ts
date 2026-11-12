import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStepSource } from '../../src/lib/workbench/readSource';
import { createRunner, type Runner, type RunnerOptions } from '../../src/lib/workbench/simulator';
import { lineNumber } from '../../src/lib/workbench/source';
import {
  answersBlinkLine,
  blinkCommands,
  blinkInput,
  blinkSimple,
  blinkSteps,
  blinkTimer,
  LED_PIN,
  parseBlinkLine,
  type BlinkStep,
} from '../../src/lib/workbench/steps/blink';

const IF_AVAILABLE = 'if (Serial.available()) {';
const WHILE_AVAILABLE = 'while (Serial.available()) {';
const TIMER_GUARD = 'if (millis() - lastToggle >= blinkDelay) {';
const COMMANDS_GUARD = 'if (!paused && millis() - lastToggle >= blinkDelay) {';

interface Printed {
  readonly at: number;
  readonly text: string;
}

/** A runner with a record of every printed line and the simulated time it was printed at. */
function start(step: BlinkStep, options?: RunnerOptions) {
  const runner = createRunner(step.program, options);
  const printed: Printed[] = [];
  runner.subscribe((view, effects) => {
    for (const effect of effects) if (effect.kind === 'print') printed.push({ at: view.millis, text: effect.text });
  });
  return { runner, printed };
}

const afterSetup = (printed: readonly Printed[]) => printed.slice(2).map(({ at, text }) => `${at} ${text}`);

/** What the board printed in answer to `text`, the sketch having started with nothing else queued. */
function replyTo(step: BlinkStep, stopLine: string, text: string): string[] {
  const { runner, printed } = start(step);
  runner.send(text);
  for (let i = 0; i < 500 && !(runner.view().line === stopLine && runner.view().queued.length === 0); i++) {
    runner.step();
  }
  expect(runner.view().line).toBe(stopLine);
  return printed.slice(2).map((line) => line.text);
}

function stepUntil(runner: Runner<unknown>, line: string, maxSteps = 500): void {
  for (let i = 0; i < maxSteps && runner.view().line !== line; i++) runner.step();
  expect(runner.view().line).toBe(line);
}

describe('line references', () => {
  /** Every line of `source` an operation of `step` names while it runs `inputs`, as `text#occurrence`. */
  function visitedLines(step: BlinkStep, inputs: readonly string[], steps = 200): Map<string, number | undefined> {
    const runner = createRunner(step.program);
    inputs.forEach((text) => runner.send(text));
    const seen = new Map<string, { text: string; occurrence: number }>();
    for (let i = 0; i < steps; i++) {
      const { line, occurrence } = runner.view();
      if (line !== undefined) seen.set(`${line}#${occurrence}`, { text: line, occurrence });
      runner.step();
    }
    const source = readStepSource(step.sketch);
    return new Map([...seen].map(([key, { text, occurrence }]) => [key, lineNumber(source, text, occurrence)]));
  }

  const scenarios: [BlinkStep, string[]][] = [
    [blinkSimple, []],
    [blinkInput, ['300', 'abc']],
    [blinkTimer, ['100', 'abc', '', '300']],
    [blinkCommands, ['delay 100', 'pause', 'run', 'delay abc', '', 'foo', 'delay 300']],
  ];

  it.each(scenarios)('$key: every named line is in the real .ino', (step, inputs) => {
    const missing = [...visitedLines(step, inputs)].filter(([, number]) => number === undefined).map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it.each(scenarios)('$key: every statement of the .ino is named, but the ones taking one character', (step, inputs) => {
    const source = readStepSource(step.sketch);
    const named = new Set(
      [...visitedLines(step, inputs).values()].filter((number): number is number => number !== undefined),
    );
    const lines = source.split('\n');
    const setupAt = lines.findIndex((line) => line.trim() === 'void setup() {');
    const unnamed = lines
      .map((text, index) => ({ text: text.trim(), number: index + 1 }))
      .filter(({ text, number }) => number > setupAt + 1 && text !== '' && !/^\}?$|^void \w+\(\) \{$/.test(text))
      .filter(({ number }) => !named.has(number))
      .map(({ text }) => text);
    const perCharacter = step === blinkTimer || step === blinkCommands ? ['line += c;', 'continue;'] : [];
    expect(unnamed).toEqual(perCharacter);
  });

  it('names both delays of a sketch that has two with the same text', () => {
    const inputLines = [...visitedLines(blinkInput, ['300']).keys()];
    expect(inputLines).toContain('delay(blinkDelay);#1');
    expect(inputLines).toContain('delay(blinkDelay);#2');
    const simpleLines = [...visitedLines(blinkSimple, []).keys()];
    expect(simpleLines).toContain('delay(1000);#1');
    expect(simpleLines).toContain('delay(1000);#2');
  });

  it('fails to resolve a line that the .ino no longer has', () => {
    const source = readStepSource(blinkInput.sketch);
    const dropSecondDelay = source.replace(/(delay\(blinkDelay\);\n)([\s\S]*?)delay\(blinkDelay\);\n/, '$1$2');
    const renamed = source.replace('led.write(LOW);', 'led.write(0);');
    const visited = visitedLines(blinkInput, ['300']);

    const unresolvedIn = (mutated: string) =>
      [...visited.keys()].filter((key) => {
        const [text, occurrence] = key.split('#');
        return lineNumber(mutated, text, Number(occurrence)) === undefined;
      });

    expect(unresolvedIn(source)).toEqual([]);
    expect(unresolvedIn(dropSecondDelay)).toEqual(['delay(blinkDelay);#2']);
    expect(unresolvedIn(renamed)).toEqual(['led.write(LOW);#1']);
  });
});

describe('the four steps', () => {
  it('lists the steps in order with the sketch each one simulates', () => {
    expect(blinkSteps.map((step) => [step.key, step.sketch])).toEqual([
      ['blink/simple', 'sketches/blink/simple'],
      ['blink/input', 'sketches/blink/input'],
      ['blink/timer', 'sketches/blink/timer'],
      ['blink/commands', 'sketches/blink/commands'],
    ]);
  });

  it('offers no shortcut on simple, a delay slider on input and timer, chips and a slider on commands', () => {
    expect(blinkSimple.shortcuts).toEqual([]);
    for (const step of [blinkInput, blinkTimer]) {
      expect(step.shortcuts).toHaveLength(1);
      const [slider] = step.shortcuts;
      expect(slider).toMatchObject({ kind: 'slider', min: 100, max: 2000, initial: 1000 });
      expect(slider.kind === 'slider' && slider.command(1500)).toBe('1500');
    }
    const [pause, run, slider] = blinkCommands.shortcuts;
    expect(pause).toEqual({ kind: 'chip', text: 'pause' });
    expect(run).toEqual({ kind: 'chip', text: 'run' });
    expect(slider).toMatchObject({ kind: 'slider', min: 100, max: 2000 });
    expect(slider.kind === 'slider' && slider.command(1500)).toBe('delay 1500');
  });

  it.each(blinkSteps)('$key has a hint of one or two sentences', (step) => {
    expect(step.hint.match(/[.!?](\s|$)/g)?.length).toBeLessThanOrEqual(2);
    expect(step.hint.endsWith('.')).toBe(true);
  });

  it.each(blinkSteps)('$key prints a blank line, then its name, as setup() does', (step) => {
    const { runner, printed } = start(step);
    stepUntil(runner, step === blinkSimple ? 'Serial.println("HIGH");' : (step === blinkInput ? IF_AVAILABLE : WHILE_AVAILABLE));
    expect(printed.map((line) => line.text)).toEqual(['', `sketch ${step.key}`]);
    expect(step.parse(printed[0].text)).toBeUndefined();
    expect(step.parse(printed[1].text)).toEqual({ kind: 'sketch', key: step.key });
  });
});

describe('parseBlinkLine', () => {
  it('turns each board line into an event', () => {
    expect(parseBlinkLine('HIGH')).toEqual({ kind: 'high' });
    expect(parseBlinkLine('LOW')).toEqual({ kind: 'low' });
    expect(parseBlinkLine('delay 300')).toEqual({ kind: 'delay', ms: 300 });
    expect(parseBlinkLine('paused')).toEqual({ kind: 'paused' });
    expect(parseBlinkLine('running')).toEqual({ kind: 'running' });
    expect(parseBlinkLine('sketch blink/timer')).toEqual({ kind: 'sketch', key: 'blink/timer' });
  });

  it('gives no event for a blank line, an unknown reply or a near miss', () => {
    for (const line of ['', '? pause', 'delay', 'delay abc', 'delay 3x', 'high', 'HIGH ']) {
      expect(parseBlinkLine(line)).toBeUndefined();
    }
  });
});

describe('blink/simple', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('prints HIGH and LOW every second', () => {
    const { runner, printed } = start(blinkSimple);
    runner.run();
    vi.advanceTimersByTime(4000);
    expect(afterSetup(printed)).toEqual(['0 HIGH', '1000 LOW', '2000 HIGH', '3000 LOW', '4000 HIGH']);
    expect(runner.view().state.ledOn).toBe(true);
    runner.dispose();
  });

  it('runs the lines of loop() in the order of the sketch', () => {
    const { runner } = start(blinkSimple);
    stepUntil(runner, 'Serial.println("HIGH");');
    const lines: (string | undefined)[] = [];
    for (let i = 0; i < 7; i++) {
      lines.push(runner.view().line);
      runner.step();
    }
    expect(lines).toEqual([
      'Serial.println("HIGH");',
      'led.write(HIGH);',
      'delay(1000);',
      'Serial.println("LOW");',
      'led.write(LOW);',
      'delay(1000);',
      'Serial.println("HIGH");',
    ]);
  });
});

describe('the sketches that read one number per pass or per drain', () => {
  const numberCases: [string, string[]][] = [
    ['300', ['delay 300']],
    ['1500x', ['delay 1500']],
    ['12x', ['delay 100']],
    ['50', ['delay 100']],
    ['0', ['delay 100']],
    ['100', ['delay 100']],
    ['2000', ['delay 2000']],
    ['5000', ['delay 2000']],
    ['99999999999999999999', ['delay 2000']],
    ['3 00', ['delay 100']],
    [' 300 ', ['delay 300']],
    ['', []],
    ['   ', []],
    ['abc', []],
    ['-5', []],
    ['+5', []],
    ['x300', []],
    ['pause', []],
  ];

  describe.each([
    [blinkInput, 'Serial.println("HIGH");'],
    [blinkTimer, TIMER_GUARD],
  ] as const)('$key', (step, stopLine) => {
    it.each(numberCases)('answers %j with %j', (text, expected) => {
      expect(replyTo(step, stopLine, text)).toEqual(expected);
    });
  });

  describe('blink/commands', () => {
    const commandCases: [string, string[]][] = [
      ['pause', ['paused']],
      ['run', ['running']],
      ['  pause  ', ['paused']],
      ['delay 300', ['delay 300']],
      ['delay 300x', ['delay 300']],
      ['delay 50', ['delay 100']],
      ['delay 9999', ['delay 2000']],
      ['delay abc', ['? delay abc']],
      ['delay', ['? delay']],
      ['delay -5', ['? delay -5']],
      ['delay  300', ['? delay  300']],
      ['300', ['? 300']],
      ['Pause', ['? Pause']],
      ['foo', ['? foo']],
      ['', []],
      ['   ', []],
    ];

    it.each(commandCases)('answers %j with %j', (text, expected) => {
      expect(replyTo(blinkCommands, COMMANDS_GUARD, text)).toEqual(expected);
    });
  });
});

describe('blink/input', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('reads a sent number only when the arrow returns to the Serial.available() line', () => {
    const { runner } = start(blinkInput);
    stepUntil(runner, 'delay(blinkDelay);');
    runner.send('300');
    const executed: (string | undefined)[] = [];
    const reads: number[] = [];
    runner.subscribe((_view, effects) => effects.forEach((effect) => effect.kind === 'read' && reads.push(effect.line.id)));
    while (reads.length === 0) {
      executed.push(runner.view().line);
      runner.step();
    }
    expect(executed).toEqual([
      'delay(blinkDelay);',
      'Serial.println("LOW");',
      'led.write(LOW);',
      'delay(blinkDelay);',
      IF_AVAILABLE,
      "String line = Serial.readStringUntil('\\n');",
    ]);
    expect(runner.view().state.blinkDelay).toBe(1000);
    stepUntil(runner, 'Serial.println("HIGH");');
    expect(runner.view().state.blinkDelay).toBe(300);
  });

  it('applies a number sent during a delay after both delays, then blinks at the new rate', () => {
    const { runner, printed } = start(blinkInput);
    runner.run();
    vi.advanceTimersByTime(100);
    runner.send('300');
    vi.advanceTimersByTime(3100);
    expect(afterSetup(printed)).toEqual([
      '0 HIGH',
      '1000 LOW',
      '2000 delay 300',
      '2000 HIGH',
      '2300 LOW',
      '2600 HIGH',
      '2900 LOW',
      '3200 HIGH',
    ]);
    runner.dispose();
  });

  it('reads one line per pass, so a second line waits for the next pass', () => {
    const { runner, printed } = start(blinkInput);
    runner.run();
    vi.advanceTimersByTime(100);
    runner.send('200');
    runner.send('500');
    expect(runner.view().queued.map((line) => line.text)).toEqual(['200', '500']);
    vi.advanceTimersByTime(3300);
    expect(afterSetup(printed)).toEqual([
      '0 HIGH',
      '1000 LOW',
      '2000 delay 200',
      '2000 HIGH',
      '2200 LOW',
      '2400 delay 500',
      '2400 HIGH',
      '2900 LOW',
      '3400 HIGH',
    ]);
    runner.dispose();
  });

  it('spends a pass on a line that is not a number and says nothing', () => {
    const { runner, printed } = start(blinkInput);
    runner.send('abc');
    runner.send('300');
    runner.run();
    vi.advanceTimersByTime(100);
    expect(runner.view().queued.map((line) => line.text)).toEqual(['300']);
    vi.advanceTimersByTime(2300);
    expect(afterSetup(printed)).toEqual(['0 HIGH', '1000 LOW', '2000 delay 300', '2000 HIGH', '2300 LOW']);
    runner.dispose();
  });
});

describe('blink/timer', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('prints the first HIGH after the delay, not at the start, then toggles every delay', () => {
    const { runner, printed } = start(blinkTimer);
    runner.run();
    vi.advanceTimersByTime(999);
    expect(afterSetup(printed)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(afterSetup(printed)).toEqual(['1000 HIGH']);
    expect(runner.view().state.ledOn).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(afterSetup(printed)).toEqual(['1000 HIGH', '2000 LOW']);
    runner.dispose();
  });

  it('applies a new delay to the interval in progress', () => {
    const { runner, printed } = start(blinkTimer);
    runner.run();
    vi.advanceTimersByTime(310);
    runner.send('200');
    vi.advanceTimersByTime(415);
    expect(afterSetup(printed)).toEqual(['325 delay 200', '325 HIGH', '525 LOW', '725 HIGH']);
    runner.dispose();
  });

  it('drains every queued line in one pass', () => {
    const { runner, printed } = start(blinkTimer);
    runner.run();
    vi.advanceTimersByTime(10);
    runner.send('300');
    runner.send('x');
    runner.send('400');
    vi.advanceTimersByTime(390);
    expect(afterSetup(printed)).toEqual(['25 delay 300', '25 delay 400', '400 HIGH']);
    expect(runner.view().queued).toEqual([]);
    runner.dispose();
  });
});

describe('blink/commands', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('pauses the blinking and keeps the LED, then runs without restarting the interval', () => {
    const { runner, printed } = start(blinkCommands);
    runner.run();
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(10);
    runner.send('pause');
    vi.advanceTimersByTime(4000);
    expect(afterSetup(printed)).toEqual(['1000 HIGH', '1025 paused']);
    expect(runner.view().state).toMatchObject({ ledOn: true, paused: true });

    runner.send('run');
    vi.advanceTimersByTime(1100);
    expect(afterSetup(printed)).toEqual(['1000 HIGH', '1025 paused', '5025 running', '5025 LOW', '6025 HIGH']);
    runner.dispose();
  });

  it('answers a line it does not know, a bare number and a bad delay with ? and the line', () => {
    const { runner, printed } = start(blinkCommands);
    runner.run();
    for (const text of ['300', 'delay abc', 'delay', 'foo']) runner.send(text);
    vi.advanceTimersByTime(50);
    expect(printed.slice(2).map((line) => line.text)).toEqual(['? 300', '? delay abc', '? delay', '? foo']);
    expect(runner.view().state.blinkDelay).toBe(1000);
    runner.dispose();
  });
});

describe('the cost of a pass through loop()', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it.each([
    [blinkTimer, TIMER_GUARD],
    [blinkCommands, COMMANDS_GUARD],
  ] as const)('$key: 250 ms while stepping', (step, guard) => {
    const { runner } = start(step);
    stepUntil(runner, WHILE_AVAILABLE);
    expect(runner.view()).toMatchObject({ millis: 0, pace: 'step' });
    runner.step();
    expect(runner.view()).toMatchObject({ line: guard, millis: 250 });
    runner.step();
    stepUntil(runner, guard);
    expect(runner.view().millis).toBe(500);
  });

  it.each([
    [blinkTimer, TIMER_GUARD],
    [blinkCommands, COMMANDS_GUARD],
  ] as const)('$key: 25 ms at full speed', (step) => {
    const { runner } = start(step);
    runner.run();
    vi.advanceTimersByTime(0);
    expect(runner.view()).toMatchObject({ line: WHILE_AVAILABLE, duration: 25, pace: 'run' });
    vi.advanceTimersByTime(24);
    expect(runner.view()).toMatchObject({ line: WHILE_AVAILABLE, millis: 0 });
    vi.advanceTimersByTime(1);
    // The check of the clock costs no time, so it ran in the same turn and the next pass has begun.
    expect(runner.view()).toMatchObject({ line: WHILE_AVAILABLE, millis: 25 });
    runner.dispose();
  });

  it.each([
    [blinkTimer, TIMER_GUARD],
    [blinkCommands, COMMANDS_GUARD],
  ] as const)('$key: 250 ms of simulated time while slow, with each line lasting 500 ms', (step, guard) => {
    const { runner } = start(step, { slow: true });
    runner.run();
    vi.advanceTimersByTime(2000);
    expect(runner.view()).toMatchObject({ line: WHILE_AVAILABLE, millis: 0, pace: 'slow', duration: 500 });
    vi.advanceTimersByTime(500);
    expect(runner.view()).toMatchObject({ line: guard, millis: 250 });
    runner.dispose();
  });

  it('charges the pass once, not again for each line drained in it', () => {
    const { runner } = start(blinkCommands);
    runner.send('a');
    runner.send('b');
    runner.send('c');
    stepUntil(runner, COMMANDS_GUARD);
    expect(runner.view().millis).toBe(250);
  });

  it('prices a pass from the pace when it runs, so Step costs 250 even in a run started at full speed', () => {
    const { runner } = start(blinkTimer);
    runner.run();
    vi.advanceTimersByTime(0);
    runner.step();
    expect(runner.view().millis).toBe(250);
    runner.dispose();
  });
});

describe('the LED pin', () => {
  /** Steps `step` until it has run `lines` lines, and gives each line that wrote the pin with what it wrote. */
  function pinWrites(step: BlinkStep, lines: number): string[] {
    const runner = createRunner(step.program);
    const writes: string[] = [];
    let ran = '';
    runner.subscribe((_view, effects) => {
      for (const effect of effects) if (effect.kind === 'write') writes.push(`${ran} ${effect.pin} ${effect.high}`);
    });
    for (let i = 0; i < lines; i++) {
      ran = runner.view().line ?? '';
      runner.step();
    }
    runner.dispose();
    return writes;
  }

  // One pass: setup's four lines, then simple's six lines of loop() and input's seven.
  it.each([
    [blinkSimple, 10],
    [blinkInput, 11],
  ])('%#: changes at the led.write line, not at the print before it', (step, lines) => {
    expect(pinWrites(step, lines)).toEqual([`led.write(HIGH); ${LED_PIN} true`, `led.write(LOW); ${LED_PIN} false`]);
  });

  it.each([blinkTimer, blinkCommands])('$key: changes at led.write(ledOn), after the print', (step) => {
    const runner = createRunner(step.program);
    const order: string[] = [];
    runner.subscribe((view, effects) => {
      for (const effect of effects) order.push(effect.kind === 'write' ? `write ${effect.high}` : effect.kind);
    });
    runner.run();
    stepUntil(runner, 'led.write(ledOn);');
    expect(order.slice(-1)).toEqual(['print']);
    runner.step();
    expect(order.slice(-2)).toEqual(['print', 'write true']);
    runner.dispose();
  });
});

describe('the live value', () => {
  it('shows blinkDelay on the steps that declare it, and nothing on simple', () => {
    expect(blinkSimple.live).toBeUndefined();
    for (const step of [blinkInput, blinkTimer, blinkCommands]) {
      expect(step.live?.name).toBe('blinkDelay');
      expect(readStepSource(step.sketch)).toMatch(/^int blinkDelay = 1000;$/m);
      expect(step.live?.value({ ...step.program.init(), blinkDelay: 300 })).toBe('300');
    }
  });
});

describe('the line a real board is on', () => {
  /** The source line a step's arrow sits on after the board printed `line`, as a line number of its `.ino`. */
  function placed(step: BlinkStep, line: string): number | undefined {
    const event = step.parse(line);
    const ref = event === undefined ? undefined : step.liveLine?.(event);
    if (ref === undefined) return undefined;
    const source = readStepSource(step.sketch);
    return typeof ref === 'string' ? lineNumber(source, ref) : lineNumber(source, ref.text, ref.occurrence);
  }

  /** The number of the `occurrence`-th line of `step`'s `.ino` whose trimmed text is `text`. */
  const numberOf = (step: BlinkStep, text: string, occurrence = 1) =>
    lineNumber(readStepSource(step.sketch), text, occurrence);

  it.each([
    [blinkSimple, 'delay(1000);'],
    [blinkInput, 'delay(blinkDelay);'],
  ])('$key: HIGH puts the arrow on the first delay after led.write(HIGH), LOW on the second', (step, wait) => {
    const high = placed(step, 'HIGH');
    const low = placed(step, 'LOW');
    expect(high).toBe(numberOf(step, wait, 1));
    expect(low).toBe(numberOf(step, wait, 2));
    expect(high).toBe(numberOf(step, 'led.write(HIGH);')! + 1);
    expect(low).toBe(numberOf(step, 'led.write(LOW);')! + 1);
  });

  it('places the arrow nowhere for a line other than HIGH or LOW', () => {
    for (const line of ['delay 500', 'sketch blink/input', '']) expect(placed(blinkInput, line)).toBeUndefined();
  });

  it('places no arrow on timer and commands, whose printed lines do not tell where the board is', () => {
    expect(blinkTimer.liveLine).toBeUndefined();
    expect(blinkCommands.liveLine).toBeUndefined();
  });
});

describe('the lines that answer a sent line', () => {
  it('are the new interval, paused, running and the echo of an unknown command', () => {
    expect(['delay 500', 'paused', 'running', '? foo'].map(answersBlinkLine)).toEqual([true, true, true, true]);
  });

  it('are not the LED lines, the sketch line, a blank line or a garbled reply', () => {
    expect(['HIGH', 'LOW', 'sketch blink/input', '', 'delay', '?foo'].map(answersBlinkLine)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('are none on simple, which reads no input', () => {
    expect(blinkSimple.answers).toBeUndefined();
    expect([blinkInput, blinkTimer, blinkCommands].map((step) => step.answers)).toEqual([
      answersBlinkLine,
      answersBlinkLine,
      answersBlinkLine,
    ]);
  });
});
