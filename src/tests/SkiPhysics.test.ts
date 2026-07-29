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
});
