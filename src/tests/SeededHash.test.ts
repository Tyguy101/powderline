import { describe, expect, it } from 'vitest';
import { hashCoordinates, hashUnit } from '../core/SeededHash';

describe('deterministic coordinate hashing', () => {
  it('repeats selected coordinates exactly', () => {
    expect(hashCoordinates(42, 10, -80, 3)).toBe(hashCoordinates(42, 10, -80, 3));
    expect(hashCoordinates(0x51f15e, 0, 0)).toBe(4160712326);
  });

  it('changes across spatial cells and remains normalized', () => {
    expect(hashCoordinates(7, 12, 9)).not.toBe(hashCoordinates(7, 13, 9));
    expect(hashUnit(7, -100, 200)).toBeGreaterThanOrEqual(0);
    expect(hashUnit(7, -100, 200)).toBeLessThan(1);
  });
});
