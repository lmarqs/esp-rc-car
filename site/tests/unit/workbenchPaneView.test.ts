import { describe, expect, it } from 'vitest';
import { linkView, paneMotion, paneView } from '../../src/components/workbench/paneView';
import { boardModel } from '../../src/lib/board/models';
import type { SessionState } from '../../src/lib/flash/session';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';
import { initialPane, reducePane, type PaneEvent, type PaneProject, type PaneState } from '../../src/lib/workbench/pane';
import { blinkWorkbench, servoWorkbench } from '../../src/lib/workbench/projects';
import { createSimulation, type Snapshot } from '../../src/lib/workbench/simulation';
import { readStepSource } from '../../src/lib/workbench/readSource';
import { emptyTrace, traceShape } from '../../src/lib/workbench/trace';
import { fakeClock } from './fakeClock';

const blink = { ...blinkWorkbench, ids: ['simple', 'input', 'timer', 'commands'] } as unknown as PaneProject<BlinkBoard>;
const SIMPLE = 0;
const INPUT = 1;
const idle: SessionState = { kind: 'idle' };
const running: SessionState = { kind: 'running', chip: 'ESP32', output: [] };
const source = readStepSource(blink.steps[INPUT].sketch);

/** The pane after `events`, opened on the input step. */
function pane(...events: PaneEvent[]): PaneState<BlinkBoard> {
  return [{ kind: 'tab', index: INPUT } as PaneEvent, ...events].reduce(
    (state, event) => reducePane(blink, state, event),
    initialPane(blink, idle),
  );
}

const line = (text: string, at = 0): PaneEvent => ({ kind: 'line', text, at });
const myBoard: PaneEvent = { kind: 'choose', chosen: 'board' };
const connected: PaneEvent = { kind: 'session', state: running };
const live = [myBoard, connected, line('sketch blink/input'), line('delay 700', 10)];

/** The simulator's run of the step at `index` after `ms` of the fake clock. */
function simulated(ms = 0, index = INPUT) {
  const clock = fakeClock();
  const simulation = createSimulation(blink.board, { has: () => true, reduceMotion: () => false, changed: () => {}, clock });
  simulation.open(blink.steps[index]);
  clock.advance(ms);
  return { simulation, snapshot: simulation.snapshot() as Snapshot<unknown, BlinkBoard> };
}

describe('paneView', () => {
  it('shows the simulator while it has the pane: its board, its output, its line and the delay in the source', () => {
    const { snapshot } = simulated(3000);
    const shown = paneView(blink, pane(), snapshot, source);
    expect(shown.board).toBe(snapshot.board);
    expect(shown.picture.flags).toEqual({ on: snapshot.board.ledOn });
    expect(shown.serial.map((row) => row.text.trim())).toContain('sketch blink/input');
    expect(shown.arrow).toBeGreaterThan(0);
    expect(shown.live).toEqual({ blinkDelay: '1000' });
    expect(shown.controls).toMatchObject({ canContinue: true, canSlow: true });
  });

  it('shows the board the pane follows: its lines, the delay it reported, no problem', () => {
    const { snapshot } = simulated();
    const followed = pane(...live);
    const shown = paneView(blink, followed, snapshot, source);
    expect(shown.board).toBe(followed.followed?.board);
    expect(shown.serial.map((row) => row.text.trim())).toContain('delay 700');
    expect(shown.live).toEqual({ blinkDelay: '700' });
    expect(shown.problem).toBeUndefined();
    expect(shown.controls).toMatchObject({ canSlow: false });
  });

  it('says what the board did not get while it follows the board, and nothing once the simulator has the pane', () => {
    const { snapshot } = simulated();
    const sent = reducePane(blink, pane(...live), { kind: 'sent', text: '500', at: 20 });
    const refused = reducePane(blink, sent, { kind: 'refused', id: 1, pane: sent.following, text: '500' });
    expect(paneView(blink, refused, snapshot, source).problem).toContain('The board did not get 500');
    const simulator = reducePane(blink, refused, { kind: 'choose', chosen: 'simulator' });
    expect(paneView(blink, simulator, snapshot, source).problem).toBeUndefined();
  });

  it('has no problem and no live value for a step that runs and has none', () => {
    const { snapshot } = simulated(0, SIMPLE);
    const first = reducePane(blink, pane(), { kind: 'tab', index: SIMPLE });
    const shown = paneView(blink, first, snapshot, source);
    expect(shown.problem).toBeUndefined();
    expect(shown.live).toEqual({});
  });

  it('shows nothing of the simulator while My board waits, the watch rows unknown, with the toolbar it has live', () => {
    const { snapshot } = simulated(3000);
    const shown = paneView(blink, pane(myBoard), snapshot, source);
    const rows = paneView(blink, pane(), snapshot, source).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(shown.rows).toEqual(rows.map((row) => ({ ...row, value: '…' })));
    expect(shown.serial).toEqual([]);
    expect(shown.arrow).toBeUndefined();
    expect(shown.live).toEqual({ blinkDelay: '…' });
    expect(shown.problem).toBeUndefined();
    expect(shown.controls).toEqual(paneView(blink, pane(...live), snapshot, source).controls);
  });

  it("draws a board the page knows nothing of while My board waits, not the paused simulator's", () => {
    const servo = { ...servoWorkbench, ids: ['sweep', 'angle', 'commands', 'speed'] } as unknown as PaneProject<unknown>;
    const clock = fakeClock();
    const simulation = createSimulation(servo.board, { has: () => true, reduceMotion: () => false, changed: () => {}, clock });
    simulation.open(servo.steps[0]);
    clock.advance(2500);
    const snapshot = simulation.snapshot() as Snapshot<unknown, unknown>;
    const waiting = reducePane(servo, initialPane(servo, idle), myBoard);
    expect(servo.board.picture('servo/sweep', snapshot.board).label).toMatch(/its horn at \d+°$/);

    expect(paneView(servo, waiting, snapshot, '').picture).toEqual({
      flags: { known: false, aiming: false },
      values: { angle: 90, target: 90 },
      label: 'A servo on GPIO 13, its angle not known yet',
    });
  });
});

describe('paneMotion', () => {
  it('keeps moving while the simulator runs a waiting line, and rests once it is paused', () => {
    const { simulation, snapshot } = simulated(2500, SIMPLE);
    expect(paneMotion(blink, pane(), snapshot, 0, 300, false)).toMatchObject({ clock: { waiting: true }, moving: true });
    simulation.toggle();
    const paused = simulation.snapshot() as Snapshot<unknown, BlinkBoard>;
    expect(paneMotion(blink, pane(), paused, 0, 300, false).moving).toBe(false);
  });

  it('keeps moving while the pane follows a board, drawing the trace from its lines', () => {
    const { snapshot } = simulated();
    const motion = paneMotion(blink, pane(...live), snapshot, 1000, 300, false);
    expect(motion.moving).toBe(true);
    expect(motion.trace.grid).not.toBe('');
  });

  it('rests with an empty clock and trace while My board waits', () => {
    const { snapshot } = simulated(2500);
    expect(paneMotion(blink, pane(myBoard), snapshot, 1000, 300, false)).toEqual({
      clock: { waiting: false, fill: 0 },
      trace: traceShape(emptyTrace(undefined), 1000, 300),
      moving: false,
    });
  });

  it('fills the clock at once under reduced motion', () => {
    const { snapshot } = simulated(2500, SIMPLE);
    expect(paneMotion(blink, pane(), snapshot, 0, 300, true).clock).toEqual({ waiting: true, fill: 1 });
  });
});

describe('linkView', () => {
  it('shows the simulator with no board: tagged Simulated, a dot off, no mark on the rail', () => {
    expect(linkView(blink, pane())).toEqual({
      kind: 'simulated',
      tag: { word: 'Simulated', title: 'Running in the browser' },
      chosen: 'simulator',
      mode: 'simulator',
      reachable: true,
      dot: 'off',
      dotTitle: 'My board: not connected',
      onBoard: undefined,
    });
  });

  it('has no My board half in a browser that cannot reach a board', () => {
    const unsupported = pane({ kind: 'session', state: { kind: 'unsupported' } });
    expect(linkView(blink, unsupported)).toMatchObject({ reachable: false, mode: 'simulator', tag: { word: 'Simulated' } });
  });

  it('says under My board that no board is connected', () => {
    const shown = linkView(blink, pane(myBoard));
    expect(shown).toMatchObject({ chosen: 'board', mode: 'waiting' });
    expect(shown.tag).toEqual({ word: 'My board', title: 'Not connected' });
  });

  it('marks the step the board runs once the pane follows the board', () => {
    expect(linkView(blink, pane(...live))).toMatchObject({
      kind: 'live',
      tag: { word: 'Live' },
      mode: 'live',
      dot: 'on',
      onBoard: blink.steps[INPUT].key,
    });
  });

  it('says the board runs this step while the visitor chose the simulator', () => {
    const shown = linkView(blink, reducePane(blink, pane(...live), { kind: 'choose', chosen: 'simulator' }));
    expect(shown).toMatchObject({ kind: 'live', mode: 'simulator' });
    expect(shown.tag.title).toContain('My board');
  });

  it('stays live while the session refuses a flash of the step the board runs', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32'] } };
    expect(linkView(blink, pane(...live, { kind: 'session', state: refused }))).toMatchObject({
      mode: 'live',
      tag: { word: 'Live' },
    });
  });

  it('waits under My board while the session flashes, naming the work on the tag and the dot', () => {
    const flashing: SessionState = { kind: 'flashing', chip: 'ESP32', pct: 40 };
    expect(linkView(blink, pane(...live, { kind: 'session', state: flashing }))).toMatchObject({
      mode: 'waiting',
      dot: 'busy',
      dotTitle: 'My board: flashing…',
      tag: { word: 'My board', title: 'Flashing…' },
    });
  });

  it("asks to press reset on the picked board's adapter while it has not named its sketch", () => {
    const shown = linkView(blink, pane(myBoard, connected), boardModel('esp01s'));
    expect(shown.tag).toEqual({ word: 'My board', title: 'Waiting for it to name its sketch: press reset on its adapter' });
  });
});
