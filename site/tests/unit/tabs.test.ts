import { describe, expect, it } from 'vitest';
import { tabAfterKey } from '../../src/lib/workbench/tabs';

describe('tabAfterKey', () => {
  it('moves to the next and previous tab with the arrows, wrapping at the ends', () => {
    expect(tabAfterKey('ArrowRight', 0, 4)).toBe(1);
    expect(tabAfterKey('ArrowDown', 3, 4)).toBe(0);
    expect(tabAfterKey('ArrowLeft', 2, 4)).toBe(1);
    expect(tabAfterKey('ArrowUp', 0, 4)).toBe(3);
  });

  it('moves to the first and last tab with Home and End', () => {
    expect(tabAfterKey('Home', 2, 4)).toBe(0);
    expect(tabAfterKey('End', 1, 4)).toBe(3);
  });

  it('ignores any other key', () => {
    expect(tabAfterKey('Enter', 1, 4)).toBeUndefined();
    expect(tabAfterKey('a', 1, 4)).toBeUndefined();
  });
});
