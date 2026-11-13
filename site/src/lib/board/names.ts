import { sketchKey } from '../flash/manifest';

/** How the board dock names a sketch the board runs, and the page of its project. */
export interface SketchName {
  readonly title: string;
  readonly path: string;
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
export function stepTitle(project: string, index: number, id: string): string {
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
        names[sketchKey(step.sketch)] = { title: stepTitle(data.title, index, step.id), path: `${path}#${step.id}` };
      });
    } else if (data.sketch !== undefined) {
      names[sketchKey(data.sketch)] = { title: data.title, path };
    }
  }
  return names;
}
