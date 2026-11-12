import { describe, expect, it } from 'vitest';
import { chipLevel, flashStage } from '../../src/components/board/flashPicture';

describe('the flashing picture', () => {
  it('writes until 100%, then restarts the board', () => {
    expect([0, 40, 99, 100].map(flashStage)).toEqual(['writing', 'writing', 'writing', 'restart']);
  });

  it("fills the chip from its floor, empty at 0% and to its top at 100%, never past either", () => {
    expect(chipLevel(0)).toEqual({ y: 52, height: 0 });
    expect(chipLevel(50)).toEqual({ y: 30, height: 22 });
    expect(chipLevel(100)).toEqual({ y: 8, height: 44 });
    expect(chipLevel(140)).toEqual(chipLevel(100));
    expect(chipLevel(-5)).toEqual(chipLevel(0));
  });
});
