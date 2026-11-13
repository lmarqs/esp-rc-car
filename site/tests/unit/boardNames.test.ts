import { describe, expect, it } from 'vitest';
import { nameOf, sketchNames } from '../../src/lib/board/names';

describe('the names of the sketches', () => {
  it('names a step as its tab does and links its tab, and names a single sketch by its project', () => {
    const names = sketchNames([
      {
        id: 'blink',
        data: {
          title: 'Blink',
          sketch: 'sketches/blink/simple',
          steps: [
            { id: 'simple', sketch: 'sketches/blink/simple' },
            { id: 'input', sketch: 'sketches/blink/input' },
          ],
        },
      },
      { id: 'web-relay', data: { title: 'Web relay', sketch: 'sketches/web-relay' } },
      { id: 'fpv-drone', data: { title: 'FPV drone' } },
    ]);

    expect(names).toEqual({
      'blink/simple': { title: 'Blink · 1 simple', path: '/projects/blink/#simple', step: true },
      'blink/input': { title: 'Blink · 2 input', path: '/projects/blink/#input', step: true },
      'web-relay': { title: 'Web relay', path: '/projects/web-relay/', step: false },
    });
  });
});

describe('the name of a sketch', () => {
  const names = { 'blink/input': { title: 'Blink · 2 input', path: '/projects/blink/#input', step: true } };

  it('is the site\'s name for it, or its key with no page for a sketch outside the site', () => {
    expect(nameOf(names, 'blink/input')).toEqual(names['blink/input']);
    expect(nameOf(names, 'mine/sketch')).toEqual({ title: 'mine/sketch', path: '', step: false });
  });

  it('is its key for a key that is a property every object has', () => {
    expect(nameOf(names, 'constructor').title).toBe('constructor');
  });
});
