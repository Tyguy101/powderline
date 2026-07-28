import { describe, expect, it } from 'vitest';
import { CameraRelativeOrigin } from '../core/WorldCoordinates';

describe('camera-relative origin', () => {
  it('keeps large coordinates locally precise', () => {
    const origin = new CameraRelativeOrigin(4096);
    expect(origin.update({ x: 10, y: 9000 })).toBe(true);
    expect(Math.abs(origin.relative({ x: 10, y: 9000 }).y)).toBeLessThan(4096);
  });
});
