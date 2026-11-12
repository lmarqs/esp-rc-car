import type { Shortcut } from '../../lib/workbench/step';
import type { CodeRow } from './view';

/** One step of a project's rail as the page draws it: the step's page entry, its definition and its source's rows. */
export interface RailStep {
  readonly id: string;
  readonly sketch: string;
  readonly idea: string;
  /** The step's number in the rail, from 1. */
  readonly number: number;
  /** The step's name as the sketch prints it, such as `blink/simple`. */
  readonly key: string;
  readonly hint: string;
  readonly placeholder: string;
  readonly shortcuts: readonly Shortcut[];
  /** The name of the step's `.ino`, for the editor's file tab. */
  readonly file: string;
  readonly crumbs: readonly string[];
  readonly rows: readonly CodeRow[];
}

/** The id of the part `part` of the workbench of `project`, such as its tab panel, for the tabs that control it. */
export const elementId = (project: string, part: string): string => `workbench-${project}-${part}`;
