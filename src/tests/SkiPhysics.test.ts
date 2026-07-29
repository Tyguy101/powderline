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
    expect(neutral.state.velocityY).toBeGreaterThan(20.5);
    expect(neutral.state.velocityY).toBeLessThan(22);
    expect(tucked.state.velocityY).toBeGreaterThan(neutral.state.velocityY);
    expect(braking.state.velocityY).toBeLessThan(8);
  });

  it('builds stronger lateral authority during a sustained carve', () => {
    const standing = new SkiPhysics();
    const tucked = new SkiPhysics();
    const braking = new SkiPhysics();
    for (let index = 0; index < 240; index += 1) {
      standing.step(1 / 60, { steer: 1, brake: false, tuck: false });
      tucked.step(1 / 60, { steer: 1, brake: false, tuck: true });
      braking.step(1 / 60, { steer: 1, brake: true, tuck: false });
    }
    expect(standing.state.steeringHold).toBeCloseTo(1.6);
    expect(standing.state.position.x).toBeGreaterThan(45);
    expect(Math.abs(tucked.state.position.x)).toBeLessThan(
      Math.abs(standing.state.position.x),
    );
    expect(braking.state.velocityX).toBeLessThanOrEqual(10);
    expect(braking.state.velocityY).toBeLessThan(6);
  });

  it('advances a crash deterministically and resets to the spawn state', () => {
    const physics = new SkiPhysics();
    physics.step(1 / 60, { steer: 1, brake: false, tuck: true });
    physics.crash();
    physics.step(1 / 60, { steer: 1, brake: false, tuck: true });
    expect(physics.state.crash.elapsed).toBeCloseTo(1 / 60);
    expect(physics.state.crashed).toBe(true);

    physics.reset();
    expect(physics.state).toMatchObject({
      position: { x: 0, y: 0 },
      velocityX: 0,
      velocityY: 12,
      crashed: false,
    });
  });

  it('uses momentum for a guaranteed jump and slows by twenty percent on landing', () => {
    const physics = new SkiPhysics();
    physics.state.velocityY = 25;
    physics.state.velocityX = 4;
    const launchY = physics.state.velocityY;
    const launchX = physics.state.velocityX;
    physics.beginJump();
    let peak = 0;
    for (let frame = 0; frame < 300 && physics.state.airborne; frame += 1) {
      physics.step(1 / 60, { steer: 0.35, brake: false, tuck: false });
      peak = Math.max(peak, physics.state.airborneHeight);
    }
    expect(peak).toBeGreaterThan(3);
    expect(physics.state.airborne).toBe(false);
    expect(physics.state.airborneHeight).toBe(0);
    expect(physics.state.jump.completedDistance).toBeGreaterThan(25);
    expect(physics.state.velocityY).toBeCloseTo(launchY * 0.8);
    expect(physics.state.velocityX).toBeGreaterThan(launchX * 0.8);
    expect(physics.state.landingAmount).toBe(1);
  });
});
