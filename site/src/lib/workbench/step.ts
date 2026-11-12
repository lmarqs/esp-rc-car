import type { Sketch } from './simulator';

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
  /** What a line the board printed means; `undefined` for a line with no meaning to the page, such as a blank one. */
  parse(line: string): E | undefined;
}
