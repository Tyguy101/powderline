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
});
