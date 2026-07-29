import { describe, expect, it } from 'vitest';
import { resolvePointerGesture } from '../input/InputManager';

describe('two-axis pointer gestures', () => {
  it('scales steering with horizontal drag distance', () => {
    const light = resolvePointerGesture(30, 0, 1280, 720);
    const hard = resolvePointerGesture(180, 0, 1280, 720);
    expect(light.steer).toBeGreaterThan(0);
    expect(light.steer).toBeLessThan(hard.steer);
    expect(hard.steer).toBe(1);
  });

  it('combines diagonal steering with manual brake and tuck states', () => {
    expect(resolvePointerGesture(-120, -60, 390, 844)).toMatchObject({
      steer: -1,
      brake: true,
      tuck: false,
    });
    expect(resolvePointerGesture(120, 60, 390, 844)).toMatchObject({
      steer: 1,
      brake: false,
      tuck: true,
    });
  });
});
