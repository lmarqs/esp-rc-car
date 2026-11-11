import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const level = z.enum(['beginner', 'intermediate', 'advanced']);

/**
 * `state` tells the visitor how far a page is: `draft` is written from the code and waits for the owner's review,
 * `coming` is an outline with gaps, `done` is reviewed.
 */
const state = z.enum(['done', 'draft', 'coming']);

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    art: z.string(),
    level,
    state,
    order: z.number(),
    /** The sketch folder in the repository; a project with none yet has no firmware here. */
    sketch: z.string().optional(),
    example: z.enum(['blink', 'servo', 'omnidirectional']).optional(),
    topics: z.array(z.string()).default([]),
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
