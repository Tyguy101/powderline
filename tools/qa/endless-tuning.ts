import { mkdir, writeFile } from 'node:fs/promises';
import { CollisionSystem } from '../../src/simulation/CollisionSystem';
import { MountainRun } from '../../src/simulation/MountainRun';
import { SkiPhysics } from '../../src/simulation/SkiPhysics';
import { hitsJumpObstacle, jumpAtLip, pathCenter, type Trail } from '../../src/world/EndlessMountain';
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
    if (!ski.state.airborne && ski.canCollide() &&
      (jumpAtLip(run.section, before, ski.state.position) || collision.query(ski.state)?.feature.type === 'ramp')) ski.beginJump();
    if (hitsJumpObstacle(run.section, ski.state.position, ski.state.airborneHeight) ||
      ((trail === 'chute' || trail === 'pine') && (collision.queryWall(ski.state) || collision.query(ski.state)))) ski.crash();
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
  jumps: Array<{ speed: string; distance: number; airtime: number; crashed: boolean }>;
  avalanche: Array<{ trigger: number | string; outcome: string; seconds: number }>;
  chute: Array<{ speed: string; distance: number; crashed: boolean }>;
  pine: Array<{ line: string; crashed: boolean }>;
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
      (ski) => ski.state.crashed || ski.state.jump.completedDistance > 0 && ski.state.position.y > 174);
    jumps.push({
      speed, distance: Math.round(100 * (air.ski.state.jump.completedDistance || air.ski.state.jump.distance)) / 100,
      airtime: Math.round(100 * air.ski.state.jump.airtime) / 100,
      crashed: air.ski.state.crashed,
    });
  }
  const avalanche = [];
  for (const gap of [Infinity, 52, 44, 36, 28, -Infinity]) {
    let reacting = false;
    const test = runUntil('avalanche', seed, (ski, run) => {
      if (gap === Infinity && run.avalanche === 'warning') reacting = true;
      if (run.avalanche === 'chasing' && ski.state.position.y - run.front <= gap) reacting = true;
      return guide(ski, reacting ? run.wave!.safeSide * (run.wave!.safeEdge + 7) : 0, 'coast');
    }, (_ski, run) => run.avalanche === 'caught' || run.avalanche === 'escaped');
    avalanche.push({
      trigger: gap === Infinity ? 'warning' : gap === -Infinity ? 'never' : gap,
      outcome: test.run.avalanche, seconds: test.seconds,
    });
  }
  const chute = [];
  for (const speed of ['brake', 'coast', 'tuck'] as const) {
    const ride = runUntil('chute', seed, (ski, run) => {
      const look = Math.min(16, ski.state.velocityY * 0.59 + 3);
      const line = speed === 'tuck' ? 0 : pathCenter(run.section, ski.state.position.y + look);
      return guide(ski, line, speed);
    }, (ski) => ski.state.crashed || ski.state.position.y >= 355);
    chute.push({ speed, distance: Math.round(ride.ski.state.position.y), crashed: ride.ski.state.crashed });
  }
  const pine = [];
  for (const line of ['wide', 'scenic']) {
    const ride = runUntil('pine', seed, (ski, run) => {
      const glade = run.section.glade!;
      const approach = ski.state.position.y - glade.y;
      if (line === 'scenic' && approach >= -49 && approach < 25) {
        return guide(ski, -glade.relaxedSide * 26, approach < -9 ? 'brake' : 'coast');
      }
      const target = line === 'wide' && approach >= -70 && approach < 31 ? glade.relaxedSide * 12 : 0;
      return guide(ski, target, 'coast');
    }, (ski, run) => ski.state.crashed || ski.state.position.y > run.section.glade!.y + 45);
    pine.push({ line, crashed: ride.ski.state.crashed });
  }
  results.push({ seed, gates, jumps, avalanche, chute, pine });
}

await mkdir('tools/reports/trail-pass', { recursive: true });
await writeFile('tools/reports/trail-pass/tuning.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({
  seeds: results.length,
  gateCleanOutOf12: Object.fromEntries(['brake', 'coast', 'tuck'].map((speed) => {
    const values = results.map((result) => result.gates.find((item) => item.speed === speed)!.clean);
    return [speed, [Math.min(...values), Math.max(...values)]];
  })),
  jumpDistanceMeters: results[0]!.jumps,
  avalancheEscapes: Object.fromEntries(['warning', 52, 44, 36, 28, 'never'].map((gap) =>
    [gap, results.filter((result) => result.avalanche.find((item) => item.trigger === gap)?.outcome === 'escaped').length])),
  chuteCleanTo355: Object.fromEntries(['brake', 'coast', 'tuck'].map((speed) =>
    [speed, results.filter((result) => !result.chute.find((item) => item.speed === speed)?.crashed).length])),
  pineClean: Object.fromEntries(['wide', 'scenic'].map((line) =>
    [line, results.filter((result) => !result.pine.find((item) => item.line === line)?.crashed).length])),
}, null, 2));
