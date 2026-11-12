import type { LineRef, Sketch } from './simulator';

/** A button that types `text` into the command line, then sends it. The button shows the text it sends. */
export interface ChipShortcut {
  readonly kind: 'chip';
  readonly text: string;
}

/** A slider that sends on release: `command(value)` is the line it sends, and the line it previews while dragged. */
export interface SliderShortcut {
  readonly kind: 'slider';
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly initial: number;
  command(value: number): string;
}

/** A control that stands in for typing a line to the board. */
export type Shortcut = ChipShortcut | SliderShortcut;

/** A variable of the sketch the editor shows live: its `name` and its value in the program's `state`. */
export interface LiveValue<S> {
  readonly name: string;
  value(state: S): string;
}

/**
 * One step of a project for the workbench: the sketch the simulator runs, what the page offers beside the command
 * line, and how the page reads the board's output. `S` is the program's state, `E` what a board line means.
 */
export interface StepDefinition<S, E> {
  /** The step's name as the sketch prints it, such as `blink/simple`. */
  readonly key: string;
  /** The sketch's folder from the repository root, such as `sketches/blink/simple`. */
  readonly sketch: string;
  /** The sketch's program: its operations name lines of the `.ino` in `sketch`. */
  readonly program: Sketch<S>;
  /** The controls that send a line for the visitor; empty when the sketch reads no serial input. */
  readonly shortcuts: readonly Shortcut[];
  /** Shown while the command line is empty. */
  readonly placeholder: string;
  /** One or two plain sentences: what the arrow is and what to try. */
  readonly hint: string;
  /**
   * The variable whose current value the editor shows in place of the number it is declared with, such as
   * `blinkDelay`, and that value; absent for a step with none.
   */
  readonly live?: LiveValue<S>;
  /** What a line the board printed means; `undefined` for a line with no meaning to the page, such as a blank one. */
  parse(line: string): E | undefined;
  /**
   * The source line a real board running this step is on just after it printed a line meaning `event`, where the
   * arrow sits in live mode; `undefined` for an event that places it nowhere. Absent on a step whose printed lines
   * do not tell where the board is.
   */
  liveLine?(event: E): LineRef | undefined;
  /**
   * Whether a line the board printed answers a line the visitor sent, which shows that the board applied it. Absent
   * on a step that reads no input.
   */
  answers?(line: string): boolean;
  /** Whether the board answers the line `sent`, as the sketch decides; absent on a step that reads no input. */
  expectsAnswer?(sent: string): boolean;
}
