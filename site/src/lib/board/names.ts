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
    readonly steps?: readonly { readonly sketch: string }[];
  };
}

/**
 * Each sketch of `projects` by the key it is flashed and printed by, such as `blink/input`: a project's title, and the
 * step's number in a project in steps, as the workbench numbers it.
 */
export function sketchNames(projects: readonly NamedProject[]): Record<string, SketchName> {
  const names: Record<string, SketchName> = {};
  for (const { id, data } of projects) {
    const path = `/projects/${id}/`;
    if (data.steps !== undefined) {
      data.steps.forEach((step, index) => {
        names[sketchKey(step.sketch)] = { title: `${data.title} · step ${index + 1}`, path };
      });
    } else if (data.sketch !== undefined) {
      names[sketchKey(data.sketch)] = { title: data.title, path };
    }
  }
  return names;
}
