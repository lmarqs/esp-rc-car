import { blinkBoard, type BlinkBoard } from './blinkBoard';
import type { BoardModel } from './board';
import type { StepDefinition } from './step';
import { servoBoard, type ServoBoard } from './servoBoard';
import { blinkSteps, LED_PIN, type BlinkEvent, type BlinkState } from './steps/blink';
import { SERVO_PIN, servoSteps, type ServoEvent, type ServoState } from './steps/servo';

/** A project the workbench can show: its steps, in the order of the project's ladder, and its board. */
export interface WorkbenchProject<S, E, B> {
  readonly steps: readonly StepDefinition<S, E>[];
  readonly board: BoardModel<E, B, S>;
  /** The picture the board pane draws: an LED, or a servo's horn. */
  readonly picture: 'led' | 'servo';
  /**
   * What the trace draws: `caption`, short, above it, such as `GPIO 2`, and `name` for a screen reader, such as `The
   * level of GPIO 2`; the page adds the window.
   */
  readonly trace: { readonly caption: string; readonly name: string };
}

export const blinkWorkbench: WorkbenchProject<BlinkState, BlinkEvent, BlinkBoard> = {
  steps: blinkSteps,
  board: blinkBoard,
  picture: 'led',
  trace: { caption: `GPIO ${LED_PIN}`, name: `The level of GPIO ${LED_PIN}` },
};

export const servoWorkbench: WorkbenchProject<ServoState, ServoEvent, ServoBoard> = {
  steps: servoSteps,
  board: servoBoard,
  picture: 'servo',
  trace: { caption: `GPIO ${SERVO_PIN} angle, 0–180°`, name: `The servo angle on GPIO ${SERVO_PIN}` },
};

// Each project has its own state, line meaning and board, which only that project's steps and board use together.
type AnyWorkbenchProject = WorkbenchProject<any, any, any>;

/** The projects with step definitions, by their page's id. */
const projects: Readonly<Record<string, AnyWorkbenchProject>> = { blink: blinkWorkbench, servo: servoWorkbench };

/** The workbench of the project whose page is `id`; `undefined` for a project with no step definitions. */
export function workbenchFor(id: string): AnyWorkbenchProject | undefined {
  return Object.hasOwn(projects, id) ? projects[id] : undefined;
}

/**
 * The step definitions of `project` in the order of the rail, which lists the steps by their sketch folders, such as
 * `sketches/blink/simple`. Throws for a sketch that no step definition runs.
 */
export function railOf<S, E, B>(project: WorkbenchProject<S, E, B>, sketches: readonly string[]): StepDefinition<S, E>[] {
  return sketches.map((sketch) => {
    const step = project.steps.find((candidate) => candidate.sketch === sketch);
    if (step === undefined) throw new Error(`No step definition of the workbench runs ${sketch}.`);
    return step;
  });
}
