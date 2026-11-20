import { mkdir, writeFile } from 'node:fs/promises';
import { CollisionSystem } from '../../src/simulation/CollisionSystem';
import { MountainRun } from '../../src/simulation/MountainRun';
import { SkiPhysics } from '../../src/simulation/SkiPhysics';
import type { Trail } from '../../src/world/EndlessMountain';
import type { InputState } from '../../src/input/InputState';

const step = 1 / 60;

function runUntil(trail: Trail, seed: number, control: (ski: SkiPhysics, run: MountainRun) => InputState,
  done: (ski: SkiPhysics, run: MountainRun) => boolean) {
  const run = new MountainRun(seed, { trail, scenario: 'encounter' });
  const ski = new SkiPhysics();
  const collision = new CollisionSystem(seed, run);
  Object.assign(ski.state.position, run.spawn);
  let ticks = 0;
  for (; ticks < 7200 && !done(ski, run); ticks += 1) {
    const before = { ...ski.state.position };
    ski.step(step, control(ski, run));
    if (!ski.state.airborne && ski.canCollide() && collision.query(ski.state)?.feature.type === 'ramp') ski.beginJump();
    run.advance(before, ski.state.position, ski.state.airborne, step);
  }
  if (ticks === 7200) throw new Error(`Timed out on ${trail} seed ${seed}`);
  return { run, ski, seconds: Math.round(ticks * step * 10) / 10 };
}

function guide(ski: SkiPhysics, target: number, speed: 'brake' | 'coast' | 'tuck'): InputState {
  const x = ski.state.position.x + ski.state.velocityX * 0.63;
  return {
    steer: Math.max(-1, Math.min(1, (target - x) * 0.13)),
    brake: speed === 'brake',
    tuck: speed === 'tuck',
  };
}

const results: Array<{
  seed: number;
  gates: Array<{ speed: string; clean: number; seconds: number }>;
  jumps: Array<{ speed: string; distance: number; airtime: number }>;
  avalanche: Array<{ trigger: number | string; outcome: string; seconds: number }>;
}> = [];
for (const seed of [1729, 424242, 2718, 9, 12, 13, 21, 57, 84, 198, 456, 769]) {
  const gates = [];
  const jumps = [];
  for (const speed of ['brake', 'coast', 'tuck'] as const) {
    const gate = runUntil('gate', seed,
      (ski, run) => guide(ski, run.section.gates[run.gateIndex]?.x ?? 0, speed),
      (_ski, run) => run.gateIndex === 12);
    gates.push({ speed, clean: gate.run.cleanGates, seconds: gate.seconds });
    const air = runUntil('air', seed, (ski) => guide(ski, 0, speed),
      (ski) => ski.state.jump.completedDistance > 0);
    jumps.push({
      speed, distance: Math.round(100 * air.ski.state.jump.completedDistance) / 100,
      airtime: Math.round(100 * air.ski.state.jump.airtime) / 100,
    });
  }
  const avalanche = [];
  for (const gap of [Infinity, 52, 44, 36, 28, -Infinity]) {
    let reacting = false;
    const test = runUntil('avalanche', seed, (ski, run) => {
      if (gap === Infinity && run.avalanche === 'warning') reacting = true;
      if (run.avalanche === 'chasing' && ski.state.position.y - run.front <= gap) reacting = true;
      return guide(ski, reacting ? run.section.slide!.shelterEdge + 6 : 0, 'coast');
    }, (_ski, run) => run.avalanche === 'caught' || run.avalanche === 'escaped');
    avalanche.push({
      trigger: gap === Infinity ? 'warning' : gap === -Infinity ? 'never' : gap,
      outcome: test.run.avalanche, seconds: test.seconds,
    });
  }
  results.push({ seed, gates, jumps, avalanche });
}

await mkdir('tools/reports/endless', { recursive: true });
await writeFile('tools/reports/endless/tuning.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  seeds: results.length,
  gateCleanOutOf12: Object.fromEntries(['brake', 'coast', 'tuck'].map((speed) => {
    const values = results.map((result) => result.gates.find((item) => item.speed === speed)!.clean);
    return [speed, [Math.min(...values), Math.max(...values)]];
  })),
  jumpDistanceMeters: results[0]!.jumps,
  avalancheEscapes: Object.fromEntries(['warning', 52, 44, 36, 28, 'never'].map((gap) =>
    [gap, results.filter((result) => result.avalanche.find((item) => item.trigger === gap)?.outcome === 'escaped').length])),
}, null, 2));
