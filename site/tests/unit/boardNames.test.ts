import { describe, expect, it } from 'vitest';
import { sketchNames } from '../../src/lib/board/names';

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
      'blink/simple': { title: 'Blink · 1 simple', path: '/projects/blink/#simple' },
      'blink/input': { title: 'Blink · 2 input', path: '/projects/blink/#input' },
      'web-relay': { title: 'Web relay', path: '/projects/web-relay/' },
    });
  });
});
