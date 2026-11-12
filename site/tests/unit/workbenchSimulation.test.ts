import { describe, expect, it, vi } from 'vitest';
import { blinkWorkbench } from '../../src/lib/workbench/projects';
import { createSimulation, OPENING, type Simulation } from '../../src/lib/workbench/simulation';
import type { BlinkBoard } from '../../src/lib/workbench/blinkBoard';
import type { BlinkState } from '../../src/lib/workbench/steps/blink';
import { fakeClock } from './fakeClock';

const [SIMPLE, INPUT] = blinkWorkbench.steps;

function opened(over: { has?: () => boolean } = {}) {
  const clock = fakeClock();
  const changed = vi.fn();
  const simulation: Simulation<BlinkState, BlinkBoard> = createSimulation(blinkWorkbench.board, {
    has: over.has ?? (() => true),
    reduceMotion: () => false,
    changed,
    clock,
  });
  simulation.open(SIMPLE);
  return { simulation, clock, changed };
}

describe('the simulation', () => {
  it('opens running in slow mode, with the LED off', () => {
    expect(OPENING).toEqual({ slow: true, running: true });
    const { simulation } = opened();
    expect(simulation.view).toMatchObject({ status: 'running', slow: true, line: 'output.begin("blink/simple");' });
    expect(simulation.board.ledOn).toBe(false);
  });

  it('runs the program on the simulated board: the LED lights once led.write(HIGH) has run', () => {
    const { simulation, clock, changed } = opened();
    clock.advance(3000);
    expect(simulation.board.ledOn).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('leaves the board and the view alone while the pane follows a real board', () => {
    let has = true;
    const { simulation, clock } = opened({ has: () => has });
    has = false;
    const before = simulation.view;
    clock.advance(3000);
    expect(simulation.view).toBe(before);
    expect(simulation.board.ledOn).toBe(false);
  });

  it('keeps what the visitor chose across a restart: paused stays paused, running runs again', () => {
    const { simulation } = opened();
    simulation.toggle();
    simulation.restart();
    expect(simulation.view?.status).toBe('paused');
    simulation.toggle();
    simulation.restart();
    expect(simulation.view?.status).toBe('running');
  });

  it('starts a restart on a fresh board and trace', () => {
    const { simulation, clock } = opened();
    clock.advance(3000);
    simulation.restart();
    expect(simulation.board).toEqual(blinkWorkbench.board.initial());
    expect(simulation.trace.edges).toEqual([]);
  });

  it('runs again on a restart after want(true), whatever it did before', () => {
    const { simulation } = opened();
    simulation.step();
    simulation.want(true);
    simulation.restart();
    expect(simulation.view?.status).toBe('running');
  });

  it('wants the sketch running again when another step opens, even after a pause', () => {
    const { simulation } = opened();
    simulation.toggle();
    simulation.open(INPUT);
    expect(simulation.view).toMatchObject({ status: 'running' });
  });

  it('holds the run in place without forgetting that the visitor wants it running', () => {
    const { simulation } = opened();
    simulation.hold();
    expect(simulation.view?.status).toBe('paused');
    simulation.restart();
    expect(simulation.view?.status).toBe('running');
  });

  it('keeps slow mode across steps once the visitor turned it off', () => {
    const { simulation } = opened();
    simulation.toggleSlow();
    simulation.open(INPUT);
    expect(simulation.slow).toBe(false);
    expect(simulation.view).toMatchObject({ slow: false });
  });
});
