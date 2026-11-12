import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const level = z.enum(['beginner', 'intermediate', 'advanced']);

/**
 * `state` tells the visitor how far a page is: `draft` is written from the code and waits for the owner's review,
 * `coming` is an outline with gaps, `done` is reviewed.
 */
const state = z.enum(['done', 'draft', 'coming']);

/** One rung of a project's ladder: a sketch that adds one idea to the step before it. */
const step = z.object({
  id: z.string(),
  /** The step's sketch folder in the repository. */
  sketch: z.string(),
  /** One short phrase: what this step adds. */
  idea: z.string(),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z
    .object({
      title: z.string(),
      summary: z.string(),
      art: z.string(),
      level,
      state,
      order: z.number(),
      /** The sketch folder in the repository; a project with none yet has no firmware here. */
      sketch: z.string().optional(),
      /** The project's steps, in order; a project with one sketch sets `sketch` alone. */
      steps: z
        .array(step)
        .min(1)
        .refine((steps) => new Set(steps.map(({ id }) => id)).size === steps.length, {
          message: 'Step ids must be unique.',
        })
        .optional(),
      example: z.enum(['omnidirectional']).optional(),
      /** The flash card's copy for a sketch the browser flashes; a project whose sketch has no image sets none. */
      flash: z
        .object({
          /**
           * The speed of the sketch's `Serial.begin`; absent for a sketch that prints nothing, which gets no board
           * output.
           */
          baud: z.number().int().positive().optional(),
          /** What to do once the board runs, which the flash card says; a project with steps has no flash card. */
          next: z.string().optional(),
        })
        .optional(),
      topics: z.array(z.string()).default([]),
    })
    .superRefine((project, context) => {
      // A ladder's `sketch` is the sketch it starts on, so it cannot drift from the first step.
      if (project.steps !== undefined && project.sketch !== project.steps[0].sketch) {
        context.addIssue({
          code: 'custom',
          path: ['sketch'],
          message: "A project with steps sets `sketch` to its first step's sketch.",
        });
      }
      if (project.steps === undefined && project.flash !== undefined && project.flash.next === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['flash', 'next'],
          message: 'A project with one sketch says what to do once the board runs.',
        });
      }
    }),
});

const topics = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/topics' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    art: z.string(),
    family: z.enum(['Electronics', 'Programming', '3D models', 'Control', 'Inside the ESP32']),
    level,
    state,
    order: z.number(),
    example: z.enum(['motor', 'h-bridge']).optional(),
  }),
});

export const collections = { projects, topics };
