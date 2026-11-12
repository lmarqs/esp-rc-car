import { describe, expect, it } from 'vitest';
import { sketchNames } from '../../src/lib/board/names';

describe('the names of the sketches', () => {
  it('numbers the steps of a project in steps and names a single sketch by its project', () => {
    const names = sketchNames([
      {
        id: 'blink',
        data: { title: 'Blink', sketch: 'sketches/blink/simple', steps: [{ sketch: 'sketches/blink/simple' }, { sketch: 'sketches/blink/input' }] },
      },
      { id: 'web-relay', data: { title: 'Web relay', sketch: 'sketches/web-relay' } },
      { id: 'fpv-drone', data: { title: 'FPV drone' } },
    ]);

    expect(names).toEqual({
      'blink/simple': { title: 'Blink · step 1', path: '/projects/blink/' },
      'blink/input': { title: 'Blink · step 2', path: '/projects/blink/' },
      'web-relay': { title: 'Web relay', path: '/projects/web-relay/' },
    });
  });
});
