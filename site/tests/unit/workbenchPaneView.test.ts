import { describe, expect, it } from 'vitest';
import { linkView, paneMotion, paneView } from '../../src/components/workbench/paneView';
import { boardMessage } from '../../src/components/workbench/view';
import { boardModel } from '../../src/lib/board/models';
import type { SessionState } from '../../src/lib/flash/session';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';
import { initialPane, reducePane, type PaneEvent, type PaneProject, type PaneState } from '../../src/lib/workbench/pane';
import { blinkWorkbench } from '../../src/lib/workbench/projects';
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

  it('shows nothing of the simulator while My board waits, with the toolbar it has live', () => {
    const { snapshot } = simulated(3000);
    const shown = paneView(blink, pane(myBoard), snapshot, source);
    expect(shown.rows).toEqual([]);
    expect(shown.serial).toEqual([]);
    expect(shown.arrow).toBeUndefined();
    expect(shown.live).toEqual({ blinkDelay: '…' });
    expect(shown.problem).toBeUndefined();
    expect(shown.controls).toEqual(paneView(blink, pane(...live), snapshot, source).controls);
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
  it('shows the simulator with no board: tagged Simulated, a dot off, no mark on the rail, no message', () => {
    const shown = linkView(blink, pane());
    expect(shown).toMatchObject({
      kind: 'simulated',
      tag: { word: 'Simulated', title: 'Running in the browser' },
      chosen: 'simulator',
      mode: 'simulator',
      dot: 'off',
      flashAgain: false,
      onBoard: undefined,
    });
    expect(shown.action).toMatchObject({ event: 'connect', disabled: false });
    expect(shown.message).toBeUndefined();
  });

  it('says what to do under My board before a board is connected', () => {
    const shown = linkView(blink, pane(myBoard));
    expect(shown).toMatchObject({ chosen: 'board', mode: 'waiting' });
    expect(shown.tag).toEqual({ word: 'My board', title: 'Not connected' });
    expect(shown.message).toEqual({
      text: 'No board connected. Plug it in with a USB cable, then connect.',
      notice: false,
    });
    expect(shown.flashAgain).toBe(false);
  });

  it('marks the step the board runs and offers Flash again once the pane follows the board', () => {
    const shown = linkView(blink, pane(...live));
    expect(shown).toMatchObject({
      kind: 'live',
      tag: { word: 'Live' },
      mode: 'live',
      dot: 'on',
      flashAgain: true,
      onBoard: blink.steps[INPUT].key,
    });
    expect(shown.message).toBeUndefined();
  });

  it('says the board runs this step while the visitor chose the simulator, with no Flash again', () => {
    const shown = linkView(blink, reducePane(blink, pane(...live), { kind: 'choose', chosen: 'simulator' }));
    expect(shown).toMatchObject({ kind: 'live', mode: 'simulator', flashAgain: false });
    expect(shown.tag.title).toContain('My board');
    expect(shown.message).toBeUndefined();
  });

  it('shows a refused Flash again over the live board, which stays live, until another step is picked', () => {
    const refused: SessionState = { ...running, flashRefused: { key: 'blink/input', available: ['ESP32'] } };
    const pressed: PaneEvent = { kind: 'press', action: 'flash' };
    const shown = linkView(blink, pane(...live, pressed, { kind: 'session', state: refused }));
    expect(shown).toMatchObject({ mode: 'live', tag: { word: 'Live' } });
    expect(shown.message).toEqual(boardMessage(refused, 'blink/input', true));
    expect(shown.message?.notice).toBe(true);

    const other = pane(...live, { kind: 'session', state: refused }, { kind: 'tab', index: SIMPLE });
    expect(linkView(blink, other).message).toEqual({
      text: 'Your board runs input. Flash simple to see it here.',
      notice: false,
    });
  });

  it('shows the message and the percentage while the session flashes, and holds Flash again back', () => {
    const flashing: SessionState = { kind: 'flashing', chip: 'ESP32', pct: 40 };
    const shown = linkView(blink, pane(...live, { kind: 'session', state: flashing }));
    expect(shown).toMatchObject({ mode: 'waiting', dot: 'busy', flashAgain: false, tag: { word: 'My board' } });
    expect(shown.message).toMatchObject({ notice: false });
    expect(shown.scene).toMatchObject({ cable: 'packets', pct: 40 });
    expect(shown.action?.disabled).toBe(true);
  });

  it("draws the hint for the picked board's hands-on step when it does not answer", () => {
    const shown = linkView(blink, pane(myBoard, { kind: 'session', state: { kind: 'noAnswer' } }), boardModel('esp01s'));
    expect(shown.scene).toMatchObject({ broken: 'chip', hint: 'prog' });
  });

  it('shows no message in the simulator, whatever the session does', () => {
    const flashing: SessionState = { kind: 'flashing', chip: 'ESP32', pct: 40 };
    expect(linkView(blink, pane({ kind: 'session', state: flashing })).message).toBeUndefined();
  });
});
