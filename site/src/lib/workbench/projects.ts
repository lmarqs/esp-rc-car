import { blinkBoard, type BlinkBoard } from './blinkBoard';
import type { BoardModel } from './board';
import { createRunner, type Effect, type RealClock, type Runner, type RunnerView } from './simulator';
import type { StepDefinition } from './step';
import { blinkSteps, type BlinkEvent, type BlinkState } from './steps/blink';

/** A project the workbench can show: its steps, in the order of the project's ladder, and its board. */
export interface WorkbenchProject<S, E, B> {
  readonly steps: readonly StepDefinition<S, E>[];
  readonly board: BoardModel<E, B, S>;
}

export const blinkWorkbench: WorkbenchProject<BlinkState, BlinkEvent, BlinkBoard> = {
  steps: blinkSteps,
  board: blinkBoard,
};

// Each project has its own state, line meaning and board, which only that project's steps and board use together.
type AnyWorkbenchProject = WorkbenchProject<any, any, any>;

/** The projects with step definitions, by their page's id. */
const projects: Readonly<Record<string, AnyWorkbenchProject>> = { blink: blinkWorkbench };

/** The workbench of the project whose page is `id`; `undefined` for a project with no step definitions. */
export function workbenchFor(id: string): AnyWorkbenchProject | undefined {
  return Object.hasOwn(projects, id) ? projects[id] : undefined;
}

/** How a step's simulator starts when the page opens it or the visitor picks its tab. */
export const OPENING = { slow: true, running: true } as const;

export interface OpenOptions {
  /** Default: the browser's clock. */
  clock?: RealClock;
  /** Run slowly, as the visitor last chose; default {@link OPENING}'s choice. */
  slow?: boolean;
}

/**
 * A runner for `step` that calls `listener` after every change, started as {@link OPENING} says. The listener is in
 * place before the first line runs, so it hears every effect.
 */
export function openRunner<S, E>(
  step: StepDefinition<S, E>,
  listener: (view: RunnerView<S>, effects: readonly Effect[]) => void,
  { clock, slow = OPENING.slow }: OpenOptions = {},
): Runner<S> {
  const runner = createRunner(step.program, { slow, clock });
  runner.subscribe(listener);
  if (OPENING.running) runner.run();
  return runner;
}
