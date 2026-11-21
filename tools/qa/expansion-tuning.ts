import { mkdir, writeFile } from 'node:fs/promises';
import { CollisionSystem } from '../../src/simulation/CollisionSystem';
import { MountainRun } from '../../src/simulation/MountainRun';
import { SkiPhysics } from '../../src/simulation/SkiPhysics';
import { BASE_TUCK_SPEED, BOULDER_RADIUS, BOULDER_SPEED } from '../../src/world/RouteExpansion';

const dt = 1 / 60;
const seeds = [1729, 424242, 2718, 9, 12, 13, 21, 57, 84, 198, 456, 769];
const delays = Array.from({ length: 31 }, (_, index) => index * 3);
const measure = (seed: number, crossing: number, delay: number) => {
  const run = new MountainRun(seed, { trail: 'hazards', scenario: 'encounter' });
  const ski = new SkiPhysics();
  const collision = new CollisionSystem(seed, run);
  Object.assign(ski.state.position, run.spawn);
  const target = run.section.expansion.ice[crossing]!;
  const startY = run.section.expansion.boulders[crossing]!.start;
  const sign = Math.sign(target.x);
  const tempting = target.x + sign * 2.3;
  const outer = target.x + sign * (target.radius + 3.1);
  const earlyClear = -Math.sign(run.section.expansion.ice[1]!.x) * 15;
  let elapsedSinceShadow = 0;
  let warned = false;
  let warningSeconds = 0;
  let rockClearance = Infinity;
  let peak = 0;
  for (let frame = 0; frame < 2400; frame += 1) {
    const before = { ...ski.state.position };
    const setup = crossing === 1 || before.y > startY - 100;
    const destination = !setup ? (before.y < run.section.expansion.boulders[2]!.start - 75 ? earlyClear : 0) :
      warned && elapsedSinceShadow >= delay ? outer : tempting;
    const steer = Math.max(-1, Math.min(1, (destination - before.x - ski.state.velocityX * 0.72) * 0.23));
    const input = { steer, tuck: true, brake: false };
    ski.step(dt, input);
    const hit = run.advance(before, ski.state.position, false, dt, ski.state.velocityY, true, input);
    if (run.expansion.ice === target && !warned) {
      warned = true;
      warningSeconds = run.expansion.iceTime;
    }
    if (warned) {
      elapsedSinceShadow += 1;
      peak = Math.max(peak, ski.state.velocityY);
      if (run.expansion.boulder) {
        rockClearance = Math.min(rockClearance, Math.hypot(ski.state.position.x - run.expansion.rockX,
          ski.state.position.y - run.expansion.rockY) - BOULDER_RADIUS - 0.62);
      }
    }
    const terrain = collision.queryWall(ski.state) || collision.query(ski.state);
    if (hit || terrain) {
      if (delay === 0) throw new Error(JSON.stringify({ seed, crossing, hit, terrain, position: ski.state.position }));
      return undefined;
    }
    if (warned && ski.state.position.y > target.y + 15) return { warningSeconds, rockClearance, peak };
  }
  throw new Error('No result for seed ' + seed);
};

const trials = seeds.flatMap((seed) => [1, 2, 3].map((crossing) => {
  const passes = delays.flatMap((frames) => {
    const result = measure(seed, crossing, frames);
    return result ? [{ delaySeconds: frames * dt, ...result }] : [];
  });
  const immediate = passes[0];
  if (!immediate || immediate.delaySeconds !== 0) throw new Error('Immediate outside escape failed at ' + seed + '/' + crossing);
  return { seed, crossing, immediate, latest: passes.at(-1)!, passCount: passes.length };
}));
const tightest = trials.reduce((a, b) => a.latest.delaySeconds < b.latest.delaySeconds ? a : b);
const report = { fixedHz: 60, delayIntervalSeconds: 0.05, boulderSpeed: BOULDER_SPEED, sustainedTuck: BASE_TUCK_SPEED,
  tightest, trials };
await mkdir('tools/reports/route-expansion', { recursive: true });
await writeFile('tools/reports/route-expansion/ice-tuning.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ trials: trials.length, ...tightest }, null, 2));
