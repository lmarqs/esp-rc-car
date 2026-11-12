import { describe, expect, it } from 'vitest';
import { follow, receive, send, type Followed } from '../../src/lib/workbench/live';
import { createRunner } from '../../src/lib/workbench/simulator';
import {
  applyServoEvent,
  followServo,
  initialServoBoard,
  servoAnswered,
  servoBoard,
  servoPicture,
  servoWatch,
  simulateServo,
  type ServoBoard,
} from '../../src/lib/workbench/servoBoard';
import {
  parseServoLine,
  SERVO_PIN,
  servoAngle,
  servoCommands,
  servoSpeed,
  servoSweep,
  type ServoStep,
} from '../../src/lib/workbench/steps/servo';

/** The board after a real board printed `lines`, from `board`. */
function printed(lines: readonly string[], board: ServoBoard = initialServoBoard()): ServoBoard {
  return lines.reduce((next, line) => {
    const event = parseServoLine(line);
    return event === undefined ? next : applyServoEvent(next, event);
  }, board);
}

type Event = readonly ['print', string, number] | readonly ['send', string, number];

/** The pane of a board running `step` after `events`: lines it printed and lines the visitor sent. */
function after(step: ServoStep, events: readonly Event[], known?: ServoBoard): Followed<ServoBoard> {
  return events.reduce(
    (followed, [kind, text, at]) =>
      kind === 'print' ? receive(followed, step, servoBoard, text, at) : send(followed, step, text, at),
    follow(servoBoard, step.key, known),
  );
}

describe('the board a real board tells', () => {
  it('starts with the angle unknown, since servo.begin() sends no pulse, and the values the sketches declare', () => {
    expect(initialServoBoard()).toEqual({ angle: undefined, target: 90, speed: 60, sweeping: false });
    expect(printed(['sketch servo/angle', 'angle 90'])).toMatchObject({ angle: 90 });
  });

  it('knows nothing the board may have changed when the page starts following it mid-run', () => {
    expect(followServo('servo/speed')).toEqual({ angle: undefined, target: undefined, speed: undefined, sweeping: undefined });
    expect(followServo('servo/commands')).toMatchObject({ angle: undefined, sweeping: undefined });
    expect(followServo('servo/angle')).toMatchObject({ angle: undefined, sweeping: false });
    const known = printed(['angle 45']);
    expect(followServo('servo/angle', known)).toBe(known);
  });

  it('turns the horn on each angle line and keeps it on an error', () => {
    expect(printed(['angle 120']).angle).toBe(120);
    expect(printed(['angle 120', 'error angle must be 0-180']).angle).toBe(120);
  });

  it('takes the target, the speed and the sweep from their lines; stop makes the estimate the target', () => {
    const board = printed(['angle 90', 'speed 10', 'target 95', 'angle 91']);
    expect(board).toEqual({ angle: 91, target: 95, speed: 10, sweeping: false });
    expect(printed(['stopped'], { ...board, sweeping: true })).toEqual({ ...board, sweeping: false, target: 91 });
  });

  it('works out a sweep’s target as the sketch does: the far end, turning at each end it reaches', () => {
    const sweeping = printed(['angle 90', 'sweeping']);
    expect(sweeping).toMatchObject({ sweeping: true, target: 180 });
    expect(printed(['angle 179', 'angle 180'], sweeping)).toMatchObject({ target: 0 });
    expect(printed(['angle 1', 'angle 0'], sweeping)).toMatchObject({ target: 180 });
    expect(printed(['angle 180', 'sweeping'])).toMatchObject({ target: 0 });
    // A second sweep changes nothing, as in the sketch.
    expect(printed(['angle 179', 'angle 180', 'sweeping'], sweeping)).toMatchObject({ target: 0 });
    // From a sweep the page did not see start, the end it heads for is unknown.
    expect(printed(['sweeping'], followServo('servo/speed'))).toMatchObject({ sweeping: true, target: undefined });
  });

  it('stops a sweep when the board answers an angle command, which commands answers like a sweep step', () => {
    const sweeping = printed(['angle 90', 'sweeping']);
    expect(servoAnswered(sweeping, 'angle 45').sweeping).toBe(false);
    expect(servoAnswered(sweeping, 'angle 999')).toBe(sweeping);
    expect(servoAnswered(sweeping, 'sweep')).toBe(sweeping);
  });

  it('starts again from the source on a sketch line', () => {
    expect(printed(['angle 3', 'speed 10', 'sketch servo/speed'])).toEqual(initialServoBoard());
  });
});

describe('live', () => {
  it('marks the sent angle applied on the exact reply, though a sweep prints angle lines before it', () => {
    const followed = after(
      servoCommands,
      [
        ['print', 'angle 90', 0],
        ['print', 'sweeping', 10],
        ['send', 'angle 45', 20],
        ['print', 'angle 91', 25],
        ['print', 'angle 45', 30],
      ],
      initialServoBoard(),
    );
    expect(followed.trace.marks.map(({ kind, at }) => [kind, at])).toEqual([
      ['sent', 20],
      ['applied', 30],
    ]);
    expect(followed.board).toMatchObject({ angle: 45, sweeping: false });
  });

  it('marks an error reply applied and leaves the horn where it was', () => {
    const followed = after(servoAngle, [
      ['print', 'angle 90', 0],
      ['send', 'abc', 10],
      ['print', 'error angle must be 0-180', 20],
    ]);
    expect(followed.trace.marks.map(({ kind }) => kind)).toEqual(['sent', 'applied']);
    expect(followed.board.angle).toBe(90);
  });

  it('draws the angle on the trace from the angle lines, as a share of 180°', () => {
    const followed = after(servoSweep, [
      ['print', 'angle 0', 0],
      ['print', 'angle 90', 15],
      ['print', 'angle 180', 30],
    ]);
    expect(followed.trace.start).toBeUndefined();
    expect(followed.trace.edges).toEqual([
      { at: 0, level: 0 },
      { at: 15, level: 0.5 },
      { at: 30, level: 1 },
    ]);
  });
});

describe('the simulated board', () => {
  it('turns the horn only at servo.write(), and takes the target, speed and sweep from the sketch', () => {
    const runner = createRunner(servoSpeed.program);
    let board = initialServoBoard();
    const seen: string[] = [];
    runner.subscribe((view, effects) => {
      const before = board.angle;
      board = simulateServo(board, view.state, effects);
      if (board.angle !== before) seen.push(`${before} -> ${board.angle}`);
    });
    for (let i = 0; i < 12 && runner.view().line !== 'servo.write(angle);'; i++) runner.step();
    expect(board.angle).toBeUndefined();
    runner.step();
    expect(board.angle).toBe(90);
    expect(seen).toEqual(['undefined -> 90']);
    runner.dispose();
  });

  it('ignores a turn of another pin', () => {
    const board = simulateServo(initialServoBoard(), servoSpeed.program.init(), [
      { kind: 'turn', pin: SERVO_PIN + 1, degrees: 10 },
    ]);
    expect(board.angle).toBeUndefined();
  });
});

describe('the watch', () => {
  const board: ServoBoard = { angle: 91, target: 95, speed: 10, sweeping: false };

  it('shows the angle on every step, the target and speed on speed, and the sweep and clock where it sweeps', () => {
    const rows = (step: string) => servoWatch(step, board, 1234).map(({ name, value }) => `${name} ${value}`);
    expect(rows('servo/sweep')).toEqual(['angle 91°']);
    expect(rows('servo/angle')).toEqual(['angle 91°']);
    expect(rows('servo/commands')).toEqual(['angle 91°', 'sweeping false', 'millis() 1234']);
    expect(rows('servo/speed')).toEqual(['angle 91°', 'target 95°', 'speed 10 °/s', 'sweeping false', 'millis() 1234']);
  });

  it('shows the clock in whole milliseconds, as millis() counts them', () => {
    expect(servoWatch('servo/speed', board, 1002.777).at(-1)).toEqual({ name: 'millis()', value: '1002' });
  });

  it('shows what it does not know as …', () => {
    const rows = servoWatch('servo/speed', followServo('servo/speed'), undefined).map(({ value }) => value);
    expect(rows).toEqual(['…', '…', '…', '…', '…']);
  });

  it('lists every row in the panel’s order and keeps the angle and clock from flashing', () => {
    expect(servoBoard.fields).toEqual(['angle', 'target', 'speed', 'sweeping', 'millis()']);
    expect(servoBoard.steady).toEqual(['angle', 'millis()']);
  });
});

describe('the picture, the trace and the live values', () => {
  it('turns the horn to the angle, and on speed shows the target too, both named for a screen reader', () => {
    const board: ServoBoard = { angle: 91, target: 95, speed: 10, sweeping: false };
    expect(servoPicture('servo/commands', board)).toEqual({
      flags: { known: true, aiming: false },
      values: { angle: 91, target: 95 },
      label: 'A servo on GPIO 13, its horn at 91°',
    });
    expect(servoPicture('servo/speed', board)).toEqual({
      flags: { known: true, aiming: true },
      values: { angle: 91, target: 95 },
      label: 'A servo on GPIO 13: estimated at 91°, target 95°',
    });
  });

  it('shows only the hub while the angle is unknown', () => {
    expect(servoPicture('servo/sweep', initialServoBoard())).toEqual({
      flags: { known: false, aiming: false },
      values: { angle: 90, target: 90 },
      label: 'A servo on GPIO 13, its angle not known yet',
    });
  });

  it('draws the angle on the trace as a share of 180°, and nothing while it is unknown', () => {
    expect(servoBoard.level({ ...initialServoBoard(), angle: 45 })).toBe(0.25);
    expect(servoBoard.level(initialServoBoard())).toBeUndefined();
  });

  it('gives the live value of angle, speed and sweeping from their lines, and waits 15 ms in sweep’s delay()', () => {
    const board = printed(['angle 45', 'speed 10']);
    expect(servoBoard.variable(board, 'angle')).toBe('45');
    expect(servoBoard.variable(board, 'speed')).toBe('10');
    expect(servoBoard.variable(initialServoBoard(), 'angle')).toBeUndefined();
    expect(servoBoard.variable(board, 'target')).toBe('90');
    expect(servoBoard.variable(board, 'sweeping')).toBe('false');
    expect(servoBoard.variable(printed(['sweeping']), 'sweeping')).toBe('true');
    expect(servoBoard.variable(board, 'lastMove')).toBeUndefined();
    expect(servoBoard.wait(board)).toBe(15);
  });
});
