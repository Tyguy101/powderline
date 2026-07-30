import { describe, expect, it } from 'vitest';
import { resolvePointerGesture } from '../input/InputManager';
import {
  applyGamepadDeadZone,
  resolveStandardGamepad,
  selectConnectedGamepad,
  smoothGamepadSteer,
} from '../input/GamepadInput';

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

function gamepad(
  axes: number[],
  pressed: number[] = [],
  analog: Record<number, number> = {},
) {
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: analog[index] ?? Number(pressed.includes(index)),
    })),
  };
}

describe('standard gamepad input', () => {
  it('removes stick drift and smoothly scales analog steering', () => {
    expect(applyGamepadDeadZone(0.1)).toBe(0);
    expect(applyGamepadDeadZone(-0.16)).toBe(0);
    expect(applyGamepadDeadZone(0.55)).toBeGreaterThan(0.3);
    expect(applyGamepadDeadZone(1)).toBe(1);
    expect(smoothGamepadSteer(0, 1)).toBeCloseTo(0.28);
    expect(smoothGamepadSteer(0.28, 1)).toBeGreaterThan(0.28);
  });

  it('maps standard-layout movement and generic actions', () => {
    expect(resolveStandardGamepad(gamepad([-0.8, -0.7], [0, 3, 9]))).toMatchObject({
      steer: expect.any(Number),
      brake: true,
      tuck: false,
      confirm: true,
      restart: true,
      pause: true,
    });
    expect(resolveStandardGamepad(gamepad([0.7, 0.8], [], { 7: 0.7 }))).toMatchObject({
      brake: false,
      tuck: true,
    });
  });

  it('gives braking precedence over tuck input', () => {
    expect(resolveStandardGamepad(gamepad([0, 0.8], [], { 6: 0.8, 7: 0.8 }))).toMatchObject({
      brake: true,
      tuck: false,
    });
  });

  it('keeps a preferred controller and reconnects to the next available pad', () => {
    const first = { index: 0, connected: true };
    const second = { index: 1, connected: true };
    expect(selectConnectedGamepad([first, second], 1)).toBe(second);
    expect(selectConnectedGamepad([{ ...first, connected: false }, second], 0)).toBe(second);
    expect(selectConnectedGamepad([null, { ...second, connected: false }], 1)).toBeNull();
  });
});
