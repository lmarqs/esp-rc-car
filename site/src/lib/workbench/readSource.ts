import { sketchSourcePath } from './source';

/** Every sketch's `.ino`, read when the site builds, keyed by its path from this file's folder. */
const sources = import.meta.glob<string>('../../../../sketches/**/*.ino', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const REPOSITORY_FROM_HERE = '../../../../';

/**
 * The text of a step's `.ino`, given its `sketch` folder such as `sketches/blink/simple`; throws when the sketch has
 * no `.ino`.
 */
export function readStepSource(sketch: string): string {
  const path = sketchSourcePath(sketch);
  const text = sources[REPOSITORY_FROM_HERE + path];
  if (text === undefined) {
    throw new Error(`No sketch source at ${path}: a sketch is a folder under sketches/ holding <folder name>.ino.`);
  }
  return text;
}
