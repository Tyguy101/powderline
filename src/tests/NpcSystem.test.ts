import { describe, expect, it } from 'vitest';
import { NpcSystem } from '../simulation/NpcSystem';
import { SkiPhysics } from '../simulation/SkiPhysics';

function snapshot(system: NpcSystem): unknown {
  return system.states.map((npc) => ({
    active: npc.active,
    generation: npc.generation,
    type: npc.type,
    x: Number(npc.x.toFixed(5)),
    y: Number(npc.y.toFixed(5)),
    velocityX: Number(npc.velocityX.toFixed(5)),
    velocityY: Number(npc.velocityY.toFixed(5)),
    fall: npc.fall,
    variation: Number(npc.variation.toFixed(5)),
    colors: [npc.hatColor, npc.topColor, npc.bottomColor, npc.accessoryColor],
  }));
}

describe('NpcSystem', () => {
  it('reproduces the same population and motion from a seed', () => {
    const playerA = new SkiPhysics();
    const playerB = new SkiPhysics();
    const first = new NpcSystem(91423);
    const second = new NpcSystem(91423);
    first.reset(playerA.state);
    second.reset(playerB.state);
    for (let frame = 0; frame < 720; frame += 1) {
      playerA.step(1 / 60, { steer: 0.35, brake: false, tuck: false });
      playerB.step(1 / 60, { steer: 0.35, brake: false, tuck: false });
      first.step(1 / 60, playerA.state);
      second.step(1 / 60, playerB.state);
    }
    expect(snapshot(first)).toEqual(snapshot(second));
  });

  it('keeps a sparse fixed population and recycles without growth', () => {
    const player = new SkiPhysics();
    const system = new NpcSystem(17);
    system.reset(player.state);
    for (let frame = 0; frame < 3600; frame += 1) {
      player.step(1 / 60, { steer: 0, brake: false, tuck: true });
      system.step(1 / 60, player.state);
    }
    expect(system.states).toHaveLength(5);
    expect(system.metrics.active).toBeGreaterThanOrEqual(3);
    expect(system.metrics.active).toBeLessThanOrEqual(5);
    expect(system.metrics.recycled).toBeGreaterThan(0);
  });

  it('assigns deterministic clothing colors from the six-color palette', () => {
    const player = new SkiPhysics();
    const first = new NpcSystem(771);
    const second = new NpcSystem(771);
    first.reset(player.state);
    second.reset(player.state);
    expect(first.states.map((npc) => [
      npc.hatColor,
      npc.topColor,
      npc.bottomColor,
      npc.accessoryColor,
    ])).toEqual(second.states.map((npc) => [
      npc.hatColor,
      npc.topColor,
      npc.bottomColor,
      npc.accessoryColor,
    ]));
    for (const npc of first.states) {
      expect(npc.hatColor).toBeGreaterThanOrEqual(0);
      expect(npc.hatColor).toBeLessThan(6);
      expect(npc.topColor).toBeGreaterThanOrEqual(0);
      expect(npc.topColor).toBeLessThan(6);
      expect(npc.bottomColor).toBeGreaterThanOrEqual(0);
      expect(npc.bottomColor).toBeLessThan(6);
    }
  });

  it('classifies contact and drives an NPC fall deterministically', () => {
    const player = new SkiPhysics();
    const system = new NpcSystem(44);
    system.reset(player.state);
    const npc = system.states[0]!;
    npc.active = true;
    npc.x = player.state.position.x;
    npc.y = player.state.position.y + 0.4;
    npc.velocityX = 0;
    npc.velocityY = 2;
    const contact = system.queryPlayerContact(player.state);
    expect(contact).not.toBeNull();
    expect(contact!.severity).toBeGreaterThan(0);
    expect(npc.fall).not.toBe('none');
    for (let frame = 0; frame < 180; frame += 1) system.step(1 / 60, player.state);
    expect(npc.fall).toBe('none');
    expect(npc.recovery).toBeGreaterThan(0);
  });

  it('preserves the golden fixed-step route and NPC outcomes', () => {
    const player = new SkiPhysics();
    const system = new NpcSystem(91423);
    system.reset(player.state);
    for (let frame = 0; frame < 1200; frame += 1) {
      const steer = frame < 300 ? 0.65 : frame < 600 ? -0.45 : frame < 900 ? 0.2 : 0;
      player.step(1 / 60, {
        steer,
        brake: frame >= 900 && frame < 980,
        tuck: frame >= 600 && frame < 850,
      });
      system.step(1 / 60, player.state);
    }
    expect([
      player.state.position.x,
      player.state.position.y,
      player.state.velocityX,
      player.state.velocityY,
    ].map((value) => Number(value.toFixed(4)))).toEqual([
      36.8513, 417.4507, 0.0031, 21.7792,
    ]);
    expect(system.states.map((npc) => [
      npc.generation,
      npc.type,
      Number(npc.x.toFixed(3)),
      Number(npc.y.toFixed(3)),
      npc.fall,
      npc.hatColor,
      npc.topColor,
      npc.bottomColor,
    ])).toEqual([
      [1, 'beginner-skier', 44.998, 436.189, 'none', 1, 5, 2],
      [1, 'speed-skier', 38.249, 451.175, 'none', 0, 5, 3],
      [0, 'snowboarder', 7.253, 393.504, 'spin', 4, 5, 5],
      [0, 'snowboarder', -32.892, 83.957, 'none', 1, 3, 5],
      [0, 'snowboarder', -8.252, 373.584, 'none', 0, 2, 3],
    ]);
  });
});
