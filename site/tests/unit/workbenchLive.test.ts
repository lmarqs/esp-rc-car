import { describe, expect, it } from 'vitest';
import { blinkBoard, measuredInterval } from '../../src/lib/workbench/blinkBoard';
import { follow, receive, send, type Followed } from '../../src/lib/workbench/live';
import {
  blinkCommands,
  blinkInput,
  blinkSimple,
  blinkTimer,
  LED_PIN,
  type BlinkStep,
} from '../../src/lib/workbench/steps/blink';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';

type Event = readonly ['print', string, number] | readonly ['send', string, number];

/** The pane of a board running `step` after `events`: lines it printed and lines the visitor sent, with their times. */
function after(step: BlinkStep, events: readonly Event[]): Followed<BlinkBoard> {
  return events.reduce(
    (followed, [kind, text, at]) =>
      kind === 'print'
        ? receive(followed, step, blinkBoard, LED_PIN, text, at)
        : send(followed, step, LED_PIN, text, at),
    follow(blinkBoard),
  );
}

const marks = (followed: Followed<unknown>) => followed.trace.marks.map(({ kind, id, at }) => [kind, id, at]);

describe('follow', () => {
  it('starts from the board before it printed anything, with no output, marks or arrow', () => {
    const followed = follow(blinkBoard);
    expect(followed.board).toEqual(blinkBoard.initial());
    expect(followed.output).toEqual([]);
    expect(followed.trace).toEqual({ start: false, edges: [], marks: [] });
    expect(followed.arrow).toBeUndefined();
  });
});

describe('receive', () => {
  it('lights the LED from HIGH and LOW, and the trace changes level at each line’s arrival', () => {
    const followed = after(blinkInput, [
      ['print', 'HIGH', 1000],
      ['print', 'LOW', 1600],
    ]);
    expect(followed.board.ledOn).toBe(false);
    expect(followed.trace.edges).toEqual([
      { at: 1000, high: true },
      { at: 1600, high: false },
    ]);
  });

  it('times measured from the arrival of the last two LED lines', () => {
    const followed = after(blinkInput, [
      ['print', 'HIGH', 1000],
      ['print', 'LOW', 1503],
      ['print', 'HIGH', 2010],
    ]);
    expect(measuredInterval(followed.board)).toBe(507);
  });

  it('keeps every line in the output, in order, as the board printed it', () => {
    const followed = after(blinkInput, [
      ['print', '', 0],
      ['print', 'sketch blink/input', 1],
      ['print', 'HIGH', 2],
    ]);
    expect(followed.output).toEqual([{ text: '' }, { text: 'sketch blink/input' }, { text: 'HIGH' }]);
  });

  it('keeps a bounded output', () => {
    const lines: Event[] = Array.from({ length: 200 }, (_, at) => ['print', `line ${at}`, at]);
    const followed = after(blinkInput, lines);
    expect(followed.output.length).toBeLessThan(200);
    expect(followed.output.at(-1)).toEqual({ text: 'line 199' });
  });

  it('puts the arrow where the step places the line, and leaves it there for a line that places nothing', () => {
    expect(after(blinkInput, [['print', 'HIGH', 0]]).arrow).toBe('delay(blinkDelay);');
    expect(after(blinkInput, [['print', 'LOW', 0]]).arrow).toEqual({ text: 'delay(blinkDelay);', occurrence: 2 });
    expect(
      after(blinkInput, [
        ['print', 'LOW', 0],
        ['print', 'delay 500', 1],
      ]).arrow,
    ).toEqual({ text: 'delay(blinkDelay);', occurrence: 2 });
  });

  it('puts no arrow on a step whose lines do not tell where the board is', () => {
    expect(after(blinkCommands, [['print', 'HIGH', 0]]).arrow).toBeUndefined();
  });
});

describe('send and the answer that marks it applied', () => {
  it('shows a sent line as sent in the output and marks it on the trace when it leaves', () => {
    const followed = after(blinkInput, [['send', '500', 300]]);
    expect(followed.output).toEqual([{ text: '500', sent: 1 }]);
    expect(marks(followed)).toEqual([['sent', 1, 300]]);
  });

  it('marks the sent line applied when the board’s next answer arrives, and not on the lines before it', () => {
    const followed = after(blinkInput, [
      ['send', '500', 300],
      ['print', 'LOW', 500],
      ['print', 'HIGH', 1500],
      ['print', 'delay 500', 2500],
    ]);
    expect(marks(followed)).toEqual([
      ['sent', 1, 300],
      ['applied', 1, 2500],
    ]);
    expect(followed.board.wait).toBe(500);
    expect(followed.unanswered).toEqual([]);
  });

  it('answers the sent lines oldest first, one answer each', () => {
    const followed = after(blinkCommands, [
      ['send', 'pause', 100],
      ['send', 'foo', 110],
      ['print', 'paused', 200],
    ]);
    expect(marks(followed)).toEqual([
      ['sent', 1, 100],
      ['sent', 2, 110],
      ['applied', 1, 200],
    ]);
    expect(followed.unanswered).toEqual([{ id: 2, text: 'foo' }]);
    const answered = receive(followed, blinkCommands, blinkBoard, LED_PIN, '? foo', 210);
    expect(marks(answered).at(-1)).toEqual(['applied', 2, 210]);
  });

  it('waits for no answer to a line the sketch ignores, so the next answer marks the line it answers', () => {
    for (const step of [blinkInput, blinkTimer]) {
      const followed = after(step, [
        ['send', 'abc', 100],
        ['send', '500', 200],
        ['print', 'delay 500', 300],
      ]);
      expect(marks(followed)).toEqual([
        ['sent', 1, 100],
        ['sent', 2, 200],
        ['applied', 2, 300],
      ]);
      expect(followed.unanswered).toEqual([]);
    }
  });

  it('waits for an answer to every command that is not blank', () => {
    const followed = after(blinkCommands, [
      ['send', '  ', 100],
      ['send', 'delay abc', 110],
      ['print', '? delay abc', 200],
    ]);
    expect(marks(followed)).toEqual([
      ['sent', 1, 100],
      ['sent', 2, 110],
      ['applied', 2, 200],
    ]);
  });

  it('marks nothing applied for an answer no sent line waits for', () => {
    expect(marks(after(blinkInput, [['print', 'delay 500', 0]]))).toEqual([]);
  });

  it('never marks a line applied on simple, which reads no input', () => {
    const followed = after(blinkSimple, [
      ['send', '500', 0],
      ['print', 'delay 500', 10],
      ['print', '? 500', 20],
    ]);
    expect(marks(followed)).toEqual([['sent', 1, 0]]);
    expect(followed.unanswered).toEqual([]);
  });

  it('gives each sent line its own id', () => {
    const followed = after(blinkInput, [
      ['send', '500', 0],
      ['send', '500', 1],
    ]);
    expect(followed.output).toEqual([
      { text: '500', sent: 1 },
      { text: '500', sent: 2 },
    ]);
  });
});
