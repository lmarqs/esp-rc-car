import { describe, expect, it } from 'vitest';
import { linkView, paneMotion, paneView } from '../../src/components/workbench/paneView';
import type { SessionState } from '../../src/lib/flash/session';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';
import { initialPane, reducePane, type PaneEvent, type PaneProject, type PaneState } from '../../src/lib/workbench/pane';
import { blinkWorkbench } from '../../src/lib/workbench/projects';
import { createSimulation, type Snapshot } from '../../src/lib/workbench/simulation';
import { readStepSource } from '../../src/lib/workbench/readSource';
import { fakeClock } from './fakeClock';

const blink = blinkWorkbench as unknown as PaneProject<BlinkBoard>;
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
const live = [{ kind: 'session', state: running } as PaneEvent, line('sketch blink/input'), line('delay 700', 10)];

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
    expect(shown.live).toBe('1000');
    expect(shown.controls).toMatchObject({ canContinue: true, canSlow: true });
  });

  it('shows the board the pane follows: its lines, the delay it reported, no problem', () => {
    const { snapshot } = simulated();
    const followed = pane(...live);
    const shown = paneView(blink, followed, snapshot, source);
    expect(shown.board).toBe(followed.followed?.board);
    expect(shown.serial.map((row) => row.text.trim())).toContain('delay 700');
    expect(shown.live).toBe('700');
    expect(shown.problem).toBeUndefined();
    expect(shown.controls).toMatchObject({ canSlow: false });
  });

  it('says what the board did not get while it follows the board, and nothing once the simulator has the pane', () => {
    const { snapshot } = simulated();
    const sent = reducePane(blink, pane(...live), { kind: 'sent', text: '500', at: 20 });
    const refused = reducePane(blink, sent, { kind: 'refused', id: 1, pane: sent.following, text: '500' });
    expect(paneView(blink, refused, snapshot, source).problem).toContain('The board did not get 500');
    const detached = reducePane(blink, refused, { kind: 'detach' });
    expect(paneView(blink, detached, snapshot, source).problem).toBeUndefined();
  });

  it('has no problem and no live value for a step that runs and has none', () => {
    const { snapshot } = simulated(0, SIMPLE);
    const first = reducePane(blink, pane(), { kind: 'tab', index: SIMPLE });
    const shown = paneView(blink, first, snapshot, source);
    expect(shown.problem).toBeUndefined();
    expect(shown.live).toBeUndefined();
  });
});

describe('paneMotion', () => {
  it('keeps moving while the simulator runs a waiting line, and rests once it is paused', () => {
    const { simulation, snapshot } = simulated(3000, SIMPLE);
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

  it('fills the clock at once under reduced motion', () => {
    const { snapshot } = simulated(3000, SIMPLE);
    expect(paneMotion(blink, pane(), snapshot, 0, 300, true).clock).toEqual({ waiting: true, fill: 1 });
  });
});

describe('linkView', () => {
  it('shows the simulator with no board: a Connect button, no mark on the rail, no message', () => {
    const shown = linkView(blink, pane());
    expect(shown).toMatchObject({ kind: 'simulated', word: 'Simulated', live: false, flashAgain: false, onBoard: undefined });
    expect(shown.action).toMatchObject({ event: 'connect', disabled: false });
    expect(shown.message).toBeUndefined();
  });

  it('marks the step the board runs and offers Flash again once the pane follows the board', () => {
    const shown = linkView(blink, pane(...live));
    expect(shown).toMatchObject({ kind: 'live', word: 'Live', live: true, flashAgain: true, onBoard: blink.steps[INPUT].key });
  });

  it('says the pane shows the simulator while the board runs the step but the visitor detached it', () => {
    const shown = linkView(blink, reducePane(blink, pane(...live), { kind: 'detach' }));
    expect(shown).toMatchObject({ kind: 'live', live: false, flashAgain: false });
    expect(shown.title).toContain('simulator');
  });

  it('shows the message and the percentage while the session flashes, and holds Flash again back', () => {
    const flashing: SessionState = { kind: 'flashing', chip: 'ESP32', pct: 40 };
    const shown = linkView(blink, pane({ kind: 'session', state: flashing }));
    expect(shown.message).toMatchObject({ notice: false, progress: 40 });
    expect(shown.action?.disabled).toBe(true);
  });
});
