import { describe, expect, it } from 'vitest';
import type { InputState } from '../input/InputState';
import { CollisionSystem } from '../simulation/CollisionSystem';
import { MountainRun } from '../simulation/MountainRun';
import { NpcSystem } from '../simulation/NpcSystem';
import { ReplaySystem } from '../simulation/ReplaySystem';
import { SkiPhysics } from '../simulation/SkiPhysics';
import { pathCenter, skiBand, takeRoute, openingSection, type MountainStart } from '../world/EndlessMountain';
import { BASE_TUCK_SPEED, BOULDER_SPEED } from '../world/RouteExpansion';

const dt = 1 / 60;
const neutral: InputState = { steer: 0, brake: false, tuck: false };

function steer(ski: SkiPhysics, x: number, speed: 'coast' | 'brake' | 'tuck' = 'coast'): InputState {
  return {
    steer: Math.max(-1, Math.min(1, (x - ski.state.position.x - ski.state.velocityX * 0.60) * 0.14)),
    brake: speed === 'brake',
    tuck: speed === 'tuck',
  };
}

function ride(seed: number, start: MountainStart, input: (ski: SkiPhysics, run: MountainRun) => Readonly<InputState>,
  done: (ski: SkiPhysics, run: MountainRun) => boolean, checkWalls = true) {
  const ski = new SkiPhysics();
  const run = new MountainRun(seed, start);
  const collision = new CollisionSystem(seed, run);
  Object.assign(ski.state.position, run.spawn);
  let peak = 0;
  for (let i = 0; i < 19_000; i += 1) {
    if (ski.state.crashed || done(ski, run)) return { ski, run, peak };
    const before = { ...ski.state.position };
    const controls = input(ski, run);
    ski.step(dt, controls, run.downhillMultiplier(before.y));
    peak = Math.max(peak, ski.state.velocityY);
    if (checkWalls && (collision.queryWall(ski.state) || collision.query(ski.state))) {
      throw new Error(`${start.trail} seed ${seed} contacted terrain at ${JSON.stringify(ski.state.position)}`);
    }
    const hit = run.advance(before, ski.state.position, ski.state.airborne, dt, ski.state.velocityY, true, controls);
    if (hit === 'ice' || hit === 'boulder') ski.crash();
  }
  throw new Error(`${start.trail} seed ${seed} timed out.`);
}

describe('route expansion', () => {
  it('links the new trails into one descent and recovers to a calm bowl on every sampled seed', () => {
    for (let seed = 0; seed < 64; seed += 1) {
      let section = openingSection(seed, 'pine');
      for (const [lane, expected] of [[1, 'sun'], [-1, 'patrol'], [-1, 'speed'], [-1, 'hazards'], [1, 'busy'], [1, 'sun']] as const) {
        section = takeRoute(section, lane);
        expect(section.trail).toBe(expected);
      }
    }
  });

  it('keeps the natural Sun Bowl line open from the ridge reveal to the junction', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      ride(seed, { trail: 'sun', scenario: 'encounter' }, () => neutral,
        (ski, run) => ski.state.position.y > run.section.end - 125);
    }
  });

  it('lets both Patrol Road branches rejoin using existing steering and brake inputs', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      for (const side of [-1, 1]) {
        const attempt = ride(seed, { trail: 'patrol', scenario: 'encounter' }, (ski, run) => {
          const fork = run.section.expansion.patrol[0]!;
          const y = ski.state.position.y;
          const next = y + Math.min(13, ski.state.velocityY * 0.54 + 2);
          const band = skiBand(run.section, run.section.center + side * 100, next);
          const target = (band.left + band.right) / 2;
          return steer(ski, target, side === -1 && y > fork.entry - 34 && y < fork.merge ? 'brake' : 'coast');
        }, (_ski, run) => run.expansion.patrolMerges > 0);
        expect(attempt.run.expansion.patrolLane).toBe(side);
      }
    }
  });

  it('can log a clean timed run and reproduces finish time and flags from input', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const settings = { trail: 'speed', scenario: 'encounter', npcCount: 5,
        npcSimulation: false, collisions: true } as const;
      const recorder = new ReplaySystem(seed, null, settings);
      const attempt = ride(seed, settings, (ski, run) => {
        const flag = run.section.expansion.timed!.flags[run.expansion.flagIndex];
        const x = run.expansion.timer === 'running' && flag ? flag.x + flag.passSide * 5.8 : 0;
        return recorder.sample(steer(ski, x));
      }, (_ski, run) => run.expansion.timer === 'finished');
      expect(attempt.run.expansion.flagMisses, `seed ${seed}`).toBe(0);
      expect(attempt.run.expansion.outsideCourse).toBe(false);
      expect(attempt.peak).toBeGreaterThan(32);
      const replay = new ReplaySystem(seed, recorder.serialize());
      const repeated = ride(seed, settings, () => replay.sample(neutral),
        (_ski, run) => run.expansion.timer === 'finished');
      expect(repeated.run.expansion.time).toBe(attempt.run.expansion.time);
      expect(repeated.run.expansion.flagIndex).toBe(attempt.run.expansion.flagIndex);
    }
  });

  it('voids missed flags, reaches the new tuck target and eases back to ordinary speed', () => {
    const attempt = ride(1729, { trail: 'speed', scenario: 'encounter' }, () => ({ ...neutral, tuck: true }),
      (ski, run) => run.expansion.timer === 'finished' && ski.state.position.y > run.section.expansion.timed!.finish + 137);
    expect(attempt.peak).toBeGreaterThan(50.9);
    expect(attempt.ski.state.velocityY).toBeLessThan(34.7);
    expect(attempt.run.expansion.flagMisses).toBeGreaterThan(0);
  });

  it('invalidates a start outside the banner even if every flag is clear', () => {
    const attempt = ride(1729, { trail: 'speed', scenario: 'encounter' }, (ski, run) => {
      const flag = run.section.expansion.timed!.flags[run.expansion.flagIndex];
      if (run.expansion.timer === 'waiting') return steer(ski, 26, 'brake');
      return steer(ski, flag ? flag.x + flag.passSide * 5.8 : 0);
    }, (_ski, run) => run.expansion.timer === 'finished');
    expect(attempt.run.expansion.flagMisses).toBe(0);
    expect(attempt.run.expansion.outsideCourse).toBe(true);
  });

  it('keeps the crowd bounded with an offscreen spawn lead on both quality presets', () => {
    for (const [population, limit] of [[5, 16], [3, 10]] as const) {
      const run = new MountainRun(1729, { trail: 'busy', scenario: 'encounter' });
      const riderSystem = new NpcSystem(1729, population, run);
      const ski = new SkiPhysics();
      Object.assign(ski.state.position, run.spawn);
      riderSystem.reset(ski.state);
      let peak = 0;
      for (let i = 0; i < 2600; i += 1) {
        const active = riderSystem.states.map((npc) => npc.active);
        ski.step(dt, neutral);
        riderSystem.step(dt, ski.state);
        for (const npc of riderSystem.states) {
          if (npc.active && !active[npc.slot]) expect(npc.y - ski.state.position.y).toBeGreaterThan(95);
        }
        peak = Math.max(peak, riderSystem.metrics.active);
      }
      expect(peak).toBe(limit);
    }
  });

  it('catches a straight tuck with a faster boulder and catches a late ice dodge', () => {
    expect(BOULDER_SPEED - BASE_TUCK_SPEED).toBeCloseTo(2.4);
    const straight = ride(1729, { trail: 'hazards', scenario: 'encounter' }, () => ({ ...neutral, tuck: true }),
      (ski) => ski.state.position.y > 900);
    expect(straight.run.expansion.impact).toBe('boulder');
    const late = ride(1729, { trail: 'hazards', scenario: 'ice' }, (ski, run) =>
      steer(ski, run.expansion.ice && run.expansion.iceTime < 0.12 ? 12 : 0, 'tuck'),
    (ski) => ski.state.position.y > 560);
    expect(late.run.expansion.impact).toBe('ice');
    late.run.retry();
    expect(late.run.expansion.ice).toBeUndefined();
    expect(late.run.expansion.boulder).toBeUndefined();
    expect(late.run.expansion.impact).toBeUndefined();
  });

  it('leaves a fair sequence of connected lines even from the ice-side first escape', () => {
    for (let seed = 0; seed < 32; seed += 1) {
      for (const tempting of [true, false]) {
        const attempt = ride(seed, { trail: 'hazards', scenario: 'encounter' }, (ski, run) => {
          const { boulders, ice } = run.section.expansion;
          const sign = Math.sign(ice[1]!.x - run.section.center);
          const y = ski.state.position.y;
          const target = y < boulders[2]!.start - 64 ? sign * (tempting ? 22 : -15) : pathCenter(run.section, y);
          return steer(ski, target, 'tuck');
        }, (_ski, run) => run.expansion.boulderPasses === 3 && run.expansion.icePasses === 3);
        expect(attempt.run.expansion.impact).toBeUndefined();
        expect(attempt.run.expansion.icePasses).toBe(3);
      }
    }
  });
});
