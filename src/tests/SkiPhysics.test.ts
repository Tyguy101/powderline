import { describe, expect, it } from 'vitest';
import { SkiPhysics } from '../simulation/SkiPhysics';

describe('ski physics', () => {
  it('advances deterministically at a fixed step', () => {
    const a = new SkiPhysics();
    const b = new SkiPhysics();
    for (let index = 0; index < 600; index += 1) {
      const input = { steer: index < 240 ? 0.6 : -0.2, brake: index > 480, tuck: false };
      a.step(1 / 60, input);
      b.step(1 / 60, input);
    }
    expect(a.state.position).toEqual(b.state.position);
    expect(a.state.position.y).toBeGreaterThan(100);
  });

  it('makes tuck faster and braking slower than a neutral descent', () => {
    const neutral = new SkiPhysics();
    const tucked = new SkiPhysics();
    const braking = new SkiPhysics();
    for (let index = 0; index < 120; index += 1) {
      neutral.step(1 / 60, { steer: 0, brake: false, tuck: false });
      tucked.step(1 / 60, { steer: 0, brake: false, tuck: true });
      braking.step(1 / 60, { steer: 0, brake: true, tuck: false });
    }
    expect(tucked.state.position.y).toBeGreaterThan(neutral.state.position.y);
    expect(braking.state.position.y).toBeLessThan(neutral.state.position.y);
  });

  it('stops on crash and resets to the deterministic spawn state', () => {
    const physics = new SkiPhysics();
    physics.step(1 / 60, { steer: 1, brake: false, tuck: true });
    physics.crash();
    const crashPosition = { ...physics.state.position };
    physics.step(1, { steer: 1, brake: false, tuck: true });
    expect(physics.state.position).toEqual(crashPosition);
    expect(physics.state.crashed).toBe(true);

    physics.reset();
    expect(physics.state).toMatchObject({
      position: { x: 0, y: 0 },
      velocityX: 0,
      velocityY: 12,
      crashed: false,
    });
  });
});
