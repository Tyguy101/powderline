import { describe, expect, it } from 'vitest';
import { CollisionSystem } from '../simulation/CollisionSystem';
import { MountainRun } from '../simulation/MountainRun';
import { deserializeReplay, ReplaySystem } from '../simulation/ReplaySystem';
import { SkiPhysics } from '../simulation/SkiPhysics';
import {
  FORK_LENGTH, LANES, LANE_SPACING, TRAILS, hitsJumpObstacle, jumpAtLip, laneAt, openingSection,
  pathCenter, pathHalfWidth, takeRoute, type Trail,
} from '../world/EndlessMountain';
import { FEATURE_CELL_SIZE, FeatureGeneratorCPU, type FeatureDescriptor } from '../world/FeatureGeneratorCPU';

const DT = 1 / 60;
const neutral = { steer: 0, brake: false, tuck: false };

function guide(physics: SkiPhysics, target: number, brake = false, tuck = false) {
  const error = target - physics.state.position.x - physics.state.velocityX * 0.63;
  return { steer: Math.max(-1, Math.min(1, error * 0.13)), brake, tuck };
}

function ride(
  run: MountainRun,
  control: (physics: SkiPhysics, run: MountainRun) => typeof neutral,
  stop: (physics: SkiPhysics, run: MountainRun) => boolean,
  collide = false,
): SkiPhysics {
  const physics = new SkiPhysics();
  Object.assign(physics.state.position, run.spawn);
  const collision = new CollisionSystem(run.seed, run);
  for (let tick = 0; tick < 19_000; tick += 1) {
    if (stop(physics, run)) return physics;
    const before = { ...physics.state.position };
    physics.step(DT, control(physics, run));
    if (collide && physics.canCollide() && !physics.state.airborne) {
      const wall = collision.queryWall(physics.state);
      const hit = collision.query(physics.state);
      if (wall || (hit && hit.feature.type !== 'ramp')) {
        throw new Error(`Hit wall or obstacle on seed ${run.seed} at ${JSON.stringify(physics.state.position)}`);
      }
      if (hit || jumpAtLip(run.section, before, physics.state.position)) physics.beginJump();
    }
    if (collide && hitsJumpObstacle(run.section, physics.state.position, physics.state.airborneHeight)) {
      physics.crash();
    }
    if (run.advance(before, physics.state.position, physics.state.airborne, DT) === 'caught') physics.crash();
  }
  throw new Error('Ride timed out at seed ' + run.seed);
}

function canReachAll(seed: number) {
  const reached = new Set<Trail>();
  let layer = [openingSection(seed, 'pine')];
  for (let i = 0; i < 6 && reached.size < 5; i += 1) {
    for (const section of layer) reached.add(section.trail);
    layer = layer.flatMap((section) => LANES.map((lane) => takeRoute(section, lane)));
  }
  return reached.size === 5;
}

describe('Endless Mountain', () => {
  it('keeps every route reachable, retains distinct deterministic IDs, and joins piste edges over 256 seeds', () => {
    for (let seed = 0; seed < 256; seed += 1) {
      expect(canReachAll(seed)).toBe(true);
      for (const trail of Object.keys(TRAILS) as Trail[]) {
        const section = openingSection(seed, trail);
        expect(new Set(section.offers.map((offer) => offer.id)).size).toBe(3);
        expect(section.offers[1]?.trail).toBe(trail);
        for (const lane of LANES) {
          const next = takeRoute(section, lane);
          expect(next).toEqual(takeRoute(openingSection(seed, trail), lane));
          expect(laneAt(section, next.center)).toBe(lane);
          expect(next.start).toBe(section.end);
          expect(pathCenter(next, next.start)).toBe(pathCenter(section, section.end));
          expect(pathHalfWidth(next, next.start)).toBe(pathHalfWidth(section, section.end));
          expect(Math.abs(next.center - section.center)).toBe(Math.abs(lane) * LANE_SPACING);
        }
      }
    }
  });

  it('leaves the shared center line in Pine, inside Chute, and all fork approaches free of procedural obstacles', () => {
    const candidate: FeatureDescriptor = { id: 0, type: 'none', x: 0, y: 0, radius: 0, scale: 0 };
    for (let seed = 0; seed < 64; seed += 1) {
      for (const trail of Object.keys(TRAILS) as Trail[]) {
        const run = new MountainRun(seed, { trail, scenario: 'summit' });
        const { section } = run;
        const generator = new FeatureGeneratorCPU(seed, run);
        const target = { ...candidate };
        let counted = 0;
        let unsafe = 0;
        for (let cy = 0; cy * FEATURE_CELL_SIZE < section.end; cy += 1) {
          for (let cx = -6; cx <= 6; cx += 1) {
            generator.describeCell(cx, cy, target);
            if (target.type === 'none') continue;
            counted += 1;
            const blocksPiste = trail === 'pine' ? Math.abs(target.x - section.center) - target.radius <= 4.7
              : Math.abs(target.x - pathCenter(section, target.y)) - target.radius <= pathHalfWidth(section, target.y);
            if (target.y >= section.end - FORK_LENGTH || blocksPiste) unsafe += 1;
          }
        }
        expect(counted).toBeGreaterThan(5);
        expect(unsafe, `seed ${seed}, ${trail}`).toBe(0);
      }
    }
  });

  it('supports clean slalom rhythms at standing speeds and resets a miss without consuming a retry', () => {
    const streaks = [];
    for (let seed = 0; seed < 48; seed += 1) {
      const run = new MountainRun(seed, { trail: 'gate', scenario: 'encounter' });
      ride(run, (physics, course) => {
        const gate = course.section.gates[course.gateIndex];
        return guide(physics, gate?.x ?? 0);
      }, (_physics, course) => course.gateIndex >= 12, true);
      streaks.push(run.cleanGates);
      expect(run.cleanGates).toBeGreaterThanOrEqual(10);
      run.retry();
      ride(run, (physics) => guide(physics, 25), (_physics, course) => course.gateIndex >= 2, true);
      expect(run.cleanGates).toBe(0);
      expect(run.gateOutcome).toBe('missed');
    }
    expect(Math.min(...streaks)).toBeGreaterThanOrEqual(10);
  });

  it('allows a centered jump and a side bypass at tuck speed across all park variants', () => {
    for (let seed = 0; seed < 32; seed += 1) {
      const jump = new MountainRun(seed, { trail: 'air', scenario: 'encounter' });
      const launched = ride(jump, () => ({ ...neutral, tuck: true }),
        (physics) => physics.state.position.y > 184, true);
      expect(launched.state.jump.sequence).toBe(1);
      expect(launched.state.crashed).toBe(false);
      expect(launched.state.jump.completedDistance).toBeGreaterThan(40);
      expect(launched.state.jump.completedDistance).toBeLessThan(56);
      const bypass = new MountainRun(seed, { trail: 'air', scenario: 'encounter' });
      const clear = ride(bypass, (physics) => guide(physics, 28),
        (physics) => physics.state.position.y > 200, true);
      expect(clear.state.jump.sequence).toBe(0);
      const slow = new MountainRun(seed, { trail: 'air', scenario: 'encounter' });
      const short = ride(slow, () => neutral, (physics) => physics.state.crashed, true);
      expect(short.state.jump.sequence).toBe(1);
    }
  });

  it('makes Needle Chute navigable with brake and look-ahead through all variants', () => {
    for (let seed = 0; seed < 32; seed += 1) {
      const run = new MountainRun(seed, { trail: 'chute', scenario: 'encounter' });
      ride(run, (physics, course) => {
        const y = physics.state.position.y;
        const look = Math.min(16, physics.state.velocityY * 0.59 + 3);
        return guide(physics, pathCenter(course.section, y + look), true);
      }, (_physics, course) => course.section.index === 1, true);
    }
  });

  it('requires repeated crossings, allows a late first reaction, and catches straight tucks', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      for (const reaction of ['early', 'late', 'missed', 'tuck']) {
        const run = new MountainRun(seed, { trail: 'avalanche', scenario: 'encounter' });
        const waveCount = run.section.waves.length;
        let move = false;
        const skier = ride(run, (physics, course) => {
          const wave = course.wave!;
          if (reaction === 'early' && course.avalanche === 'warning') move = true;
          if (reaction === 'late' && course.avalanche === 'chasing' && physics.state.position.y - course.front <= 50) move = true;
          return guide(physics, move ? wave.safeSide * (wave.safeEdge + 7) : 0, false, reaction === 'tuck');
        }, (_physics, course) => course.avalanche === 'caught' ||
          course.wavesCleared >= (reaction === 'early' ? waveCount : 1), true);
        const caught = reaction === 'missed' || reaction === 'tuck';
        expect(run.avalanche, `seed ${seed}, ${reaction}`).toBe(caught ? 'caught' : 'escaped');
        expect(skier.state.crashed).toBe(caught);
        run.retry();
        expect(run.front).toBe(0);
        expect(run.wavesCleared).toBe(0);
        expect(run.avalanche).toBe('quiet');
      }
    }
  });

  it('keeps committed rewards and layout after repeated retries and reconstructs choices from recorded input', () => {
    const options = { trail: 'gate', scenario: 'encounter', npcCount: 3, npcSimulation: true, collisions: true } as const;
    const seed = 1729;
    const mountain = new MountainRun(seed, options);
    const recorder = new ReplaySystem(seed, null, options);
    const record = ride(mountain, (physics, run) => {
      const target = run.section.gates[run.gateIndex]?.x ?? run.section.center;
      return recorder.sample(guide(physics, target));
    }, (_physics, course) => course.section.index === 1);
    const checkpoint = recorder.checkpoint();
    const skiCheckpoint = record.checkpoint();
    const next = mountain.section;
    const committedScore = mountain.cleanGates;
    expect(committedScore).toBeGreaterThan(18);
    const replay = new ReplaySystem(seed, recorder.serialize());
    const data = deserializeReplay(recorder.serialize());
    const duplicate = new MountainRun(seed, data.mountain!);
    const repeated = ride(duplicate, () => replay.sample(neutral),
      (_physics, course) => course.section.index === 1);
    expect(duplicate.section).toEqual(next);
    expect(repeated.checkpoint()).toEqual(skiCheckpoint);
    for (let i = 0; i < 3; i += 1) {
      recorder.sample(neutral);
      record.step(DT, neutral);
      recorder.restore(checkpoint);
      record.restore(skiCheckpoint);
      mountain.cleanGates += 5;
      mountain.retry();
      expect(mountain.cleanGates).toBe(committedScore);
      expect(mountain.section).toBe(next);
      expect(record.checkpoint()).toEqual(skiCheckpoint);
    }
  });

  it('retains only current and previous sections over a long run and caps replay storage', () => {
    const settings = { trail: 'pine', scenario: 'summit', npcCount: 5, npcSimulation: true, collisions: true } as const;
    const run = new MountainRun(1729, settings);
    const replay = new ReplaySystem(run.seed, null, settings);
    const sample = { ...neutral, tuck: true };
    const physics = new SkiPhysics();
    for (let i = 0; i < 180_000; i += 1) {
      const previous = { ...physics.state.position };
      sample.steer = i % 2 === 0 ? 1 / 127 : -1 / 127;
      physics.step(DT, replay.sample(sample));
      run.advance(previous, physics.state.position, false, DT);
    }
    expect(run.section.index).toBeGreaterThan(60);
    expect(run.previous?.index).toBe(run.section.index - 1);
    expect(run.sectionAt(run.section.start - 102)).toBeNull();
    expect(replay.recordingRuns).toBe(16000);
    expect(replay.serialize()).toBe('');
  });
});
