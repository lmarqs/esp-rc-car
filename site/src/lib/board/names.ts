import { sketchKey } from '../flash/manifest';

/** How the board dock names a sketch, and the page of its project. */
export interface SketchName {
  readonly title: string;
  readonly path: string;
  /** Set for a step of a workbench, whose page lets the visitor pick another step. */
  readonly step: boolean;
}

/** The sketches of the site by key, as {@link sketchNames} names them. */
export type SketchNames = Readonly<Record<string, SketchName>>;

/** The name of the sketch `key` in `names`, or its key, with no page, for a sketch outside the site. */
export function nameOf(names: SketchNames, key: string): SketchName {
  // The key may be whatever the board printed, so a key such as `constructor` must not reach the object's prototype.
  return Object.hasOwn(names, key) ? names[key]! : { title: key, path: '', step: false };
}

/** The fields of a project page that name its sketches. */
export interface NamedProject {
  readonly id: string;
  readonly data: {
    readonly title: string;
    readonly sketch?: string;
    readonly steps?: readonly { readonly id: string; readonly sketch: string }[];
  };
}

/** The name of a project's step, as the site names it beside the project: `Blink · 2 input` for its `index` 1. */
function stepTitle(project: string, index: number, id: string): string {
  return `${project} · ${index + 1} ${id}`;
}

/**
 * Each sketch of `projects` by the key it is flashed and printed by, such as `blink/input`: a project's title, and a
 * step's name as its tab shows it, such as `2 input`, with a link that opens the step in the workbench.
 */
export function sketchNames(projects: readonly NamedProject[]): Record<string, SketchName> {
  const names: Record<string, SketchName> = {};
  for (const { id, data } of projects) {
    const path = `/projects/${id}/`;
    if (data.steps !== undefined) {
      data.steps.forEach((step, index) => {
        names[sketchKey(step.sketch)] = {
          title: stepTitle(data.title, index, step.id),
          path: `${path}#${step.id}`,
          step: true,
        };
      });
    } else if (data.sketch !== undefined) {
      names[sketchKey(data.sketch)] = { title: data.title, path, step: false };
    }
  }
  return names;
}
