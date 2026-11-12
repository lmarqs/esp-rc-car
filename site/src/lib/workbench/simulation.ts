import type { BoardModel } from './board';
import { createRunner, type RealClock, type Runner, type RunnerView } from './simulator';
import type { StepDefinition } from './step';
import { emptyTrace, recordEffects, recordLevel, traceTime, type Trace } from './trace';

/** How a step's simulator starts when the page opens it or the visitor picks its tab. */
export const OPENING = { slow: true, running: true } as const;

export interface SimulationOptions {
  /** Whether the simulator has the board pane; while it does not, what the runner does is not the pane's to show. */
  has(): boolean;
  /** Whether the visitor's system asks for reduced motion, which the trace's present follows. */
  reduceMotion(): boolean;
  /** Called after the view, the simulated board or the trace changed. */
  changed(): void;
  /** Default: the browser's clock. */
  clock?: RealClock;
}

/**
 * The simulated board of the step on screen: its runner, the board model and trace that follow the lines it runs, and
 * whether the visitor wants it running. It starts as {@link OPENING} says, and its listener is in place before the first
 * line runs, so it hears every effect.
 */
export interface Simulation<S, B> {
  /** The run as of the last change the pane showed; undefined until a step is opened. */
  readonly view: RunnerView<S> | undefined;
  /** The simulated board, as the lines run so far left it. */
  readonly board: B;
  readonly trace: Trace;
  /** Whether slow mode is on, as the visitor last chose; a step opened later starts with it. */
  readonly slow: boolean;
  /** How much of the line about to run has elapsed in real time, from 0 to 1. */
  progress(): number;
  /** Shows `step` with a fresh run, started as {@link OPENING} says. */
  open(step: StepDefinition<S, unknown>): void;
  /** Starts the run again at the sketch's first line on a fresh board, running if the visitor wants it running. */
  restart(): void;
  /** Stops in place while the pane follows the real board; the visitor's wish to run is kept. */
  hold(): void;
  /** Pauses a running sketch, or runs a paused one, and keeps what the visitor chose. */
  toggle(): void;
  /** Runs one line, and the sketch then waits for the visitor. */
  step(): void;
  /** Sets what the next restart does, when the visitor's press hands the pane over from the board first. */
  want(running: boolean): void;
  toggleSlow(): void;
  /** Queues `text` for the program's serial input. */
  send(text: string): void;
}

/** The simulation of a project whose board follows `board`, starting with no step open. */
export function createSimulation<S, B>(board: BoardModel<unknown, B, S>, options: SimulationOptions): Simulation<S, B> {
  let runner: Runner<S> | undefined;
  let view: RunnerView<S> | undefined;
  let simulated = board.initial();
  let trace: Trace = emptyTrace(undefined);
  let slow: boolean = OPENING.slow;
  let wantsRunning: boolean = OPENING.running;

  function reset() {
    simulated = board.initial();
    trace = emptyTrace(board.level(simulated));
  }

  return {
    get view() {
      return view;
    },
    get board() {
      return simulated;
    },
    get trace() {
      return trace;
    },
    get slow() {
      return slow;
    },
    progress: () => runner?.progress() ?? 0,
    open(step) {
      runner?.dispose();
      reset();
      wantsRunning = OPENING.running;
      const opened = createRunner(step.program, { slow, clock: options.clock });
      runner = opened;
      opened.subscribe((next, effects) => {
        if (!options.has()) return;
        simulated = board.simulate(simulated, next.state, effects, next.millis);
        // A line is sent between two lines of the program, part way through the one under way.
        const sentAt = traceTime(next, opened.progress(), options.reduceMotion());
        trace = recordLevel(recordEffects(trace, effects, next.millis, sentAt), board.level(simulated), next.millis);
        view = next;
        options.changed();
      });
      if (OPENING.running) opened.run();
      view = opened.view();
    },
    restart() {
      reset();
      runner?.restart();
      // The runner keeps running or paused, and comes back paused from an end or an error.
      if (wantsRunning) runner?.run();
    },
    hold: () => runner?.pause(),
    toggle() {
      if (runner?.view().status === 'running') {
        wantsRunning = false;
        runner.pause();
      } else {
        wantsRunning = true;
        runner?.run();
      }
    },
    step() {
      wantsRunning = false;
      runner?.step();
    },
    want(running) {
      wantsRunning = running;
    },
    toggleSlow() {
      slow = !slow;
      runner?.setSlow(slow);
    },
    send: (text) => void runner?.send(text),
  };
}
