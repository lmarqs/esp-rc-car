import { describe, expect, it } from 'vitest';
import { blinkWorkbench, railOf, servoWorkbench, workbenchFor } from '../../src/lib/workbench/projects';

describe('workbenchFor', () => {
  it('finds the projects with step definitions and nothing else', () => {
    expect(workbenchFor('blink')).toBe(blinkWorkbench);
    expect(workbenchFor('servo')).toBe(servoWorkbench);
    expect(workbenchFor('balance-beam')).toBeUndefined();
    expect(workbenchFor('toString')).toBeUndefined();
  });
});

describe('railOf', () => {
  it('lists the step definitions in the order the rail names their sketches', () => {
    const [first, second] = blinkWorkbench.steps;
    expect(railOf(blinkWorkbench, [second.sketch, first.sketch])).toEqual([second, first]);
  });

  it('throws for a sketch no step definition runs', () => {
    expect(() => railOf(blinkWorkbench, ['sketches/blink/missing'])).toThrow('sketches/blink/missing');
  });
});
