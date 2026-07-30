import { hashCoordinates, hashUnit } from '../core/SeededHash';
import type { SkiState } from './SkiPhysics';
import { FeatureGeneratorCPU, type FeatureDescriptor } from '../world/FeatureGeneratorCPU';

export const MAX_NPCS = 5;
export const NPC_COLLISION_RADIUS = 0.66;

export type NpcType = 'speed-skier' | 'beginner-skier' | 'snowboarder';
export type NpcFall = 'none' | 'stumble' | 'spin' | 'tumble';

export interface NpcState {
  readonly slot: number;
  active: boolean;
  generation: number;
  type: NpcType;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: number;
  carve: number;
  pose: number;
  compression: number;
  traverse: number;
  phase: number;
  variation: number;
  hatColor: number;
  topColor: number;
  bottomColor: number;
  accessoryColor: number;
  fall: NpcFall;
  fallTime: number;
  fallDuration: number;
  recovery: number;
  airborne: number;
  collisionCooldown: number;
}

export interface NpcPlayerContact {
  npc: NpcState;
  normalX: number;
  normalY: number;
  relativeSpeed: number;
  severity: number;
  glancing: boolean;
}

export interface NpcMetrics {
  active: number;
  recycled: number;
  simulationMs: number;
}

const TYPE_BY_INDEX: readonly NpcType[] = [
  'speed-skier',
  'beginner-skier',
  'snowboarder',
];

const createNpc = (slot: number): NpcState => ({
  slot,
  active: false,
  generation: 0,
  type: TYPE_BY_INDEX[slot % 3]!,
  x: 0,
  y: 0,
  velocityX: 0,
  velocityY: 0,
  facing: 0,
  carve: 0,
  pose: 0,
  compression: 0,
  traverse: 0,
  phase: 0,
  variation: 0,
  hatColor: slot % 6,
  topColor: (slot + 2) % 6,
  bottomColor: (slot + 4) % 6,
  accessoryColor: (slot + 1) % 6,
  fall: 'none',
  fallTime: 0,
  fallDuration: 0,
  recovery: 0,
  airborne: 0,
  collisionCooldown: 0,
});

export class NpcSystem {
  readonly states: NpcState[] = Array.from({ length: MAX_NPCS }, (_, slot) => createNpc(slot));
  readonly metrics: NpcMetrics = { active: 0, recycled: 0, simulationMs: 0 };
  private readonly features: FeatureGeneratorCPU;
  private readonly obstacle: FeatureDescriptor = {
    id: 0, type: 'none', x: 0, y: 0, radius: 0, scale: 0,
  };
  private readonly contact: NpcPlayerContact = {
    npc: this.states[0]!,
    normalX: 0,
    normalY: -1,
    relativeSpeed: 0,
    severity: 0,
    glancing: false,
  };
  private labActive = false;
  private labType: NpcType = 'speed-skier';
  private labPose = 0;
  private labFall: NpcFall = 'none';
  private recycled = 0;

  constructor(
    private readonly seed: number,
    private readonly populationLimit = MAX_NPCS,
  ) {
    this.features = new FeatureGeneratorCPU(seed);
  }

  reset(player: Readonly<SkiState>): void {
    this.recycled = 0;
    for (const npc of this.states) {
      npc.generation = 0;
      this.spawn(npc, player, true);
    }
  }

  setLab(active: boolean, type: NpcType, pose: number, fall: NpcFall): void {
    this.labActive = active;
    this.labType = type;
    this.labPose = pose;
    this.labFall = fall;
  }

  step(delta: number, player: Readonly<SkiState>): void {
    const started = performance.now();
    if (this.labActive) {
      this.stepLab(delta, player);
      this.finishMetrics(started);
      return;
    }
    for (const npc of this.states) {
      if (!npc.active) continue;
      npc.collisionCooldown = Math.max(0, npc.collisionCooldown - delta);
      if (npc.fall !== 'none') {
        this.stepFall(npc, delta);
      } else {
        this.stepRiding(npc, delta, player);
      }
      if (
        npc.y < player.position.y - 54 ||
        npc.y > player.position.y + 96 ||
        Math.abs(npc.x - player.position.x) > 82
      ) {
        npc.generation += 1;
        this.spawn(npc, player, false);
        this.recycled += 1;
      }
    }
    this.resolveNpcContacts();
    this.finishMetrics(started);
  }

  queryPlayerContact(player: Readonly<SkiState>): Readonly<NpcPlayerContact> | null {
    if (this.labActive || player.airborne || player.crashed) return null;
    for (const npc of this.states) {
      if (!npc.active || npc.fall !== 'none' || npc.collisionCooldown > 0) continue;
      const dx = player.position.x - npc.x;
      const dy = player.position.y - npc.y;
      const radius = NPC_COLLISION_RADIUS * 2;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= radius * radius) continue;
      const distance = Math.max(0.001, Math.sqrt(distanceSquared));
      const relativeX = player.velocityX - npc.velocityX;
      const relativeY = player.velocityY - npc.velocityY;
      const relativeSpeed = Math.hypot(relativeX, relativeY);
      const normalX = dx / distance;
      const normalY = dy / distance;
      const normalImpact = Math.abs(relativeX * normalX + relativeY * normalY);
      const severity = Math.min(1, (normalImpact + relativeSpeed * 0.28) / 23);
      const tangentImpact = Math.abs(relativeX * -normalY + relativeY * normalX);
      this.contact.npc = npc;
      this.contact.normalX = normalX;
      this.contact.normalY = normalY;
      this.contact.relativeSpeed = relativeSpeed;
      this.contact.severity = severity;
      this.contact.glancing = tangentImpact > normalImpact * 1.15;
      this.hitNpc(npc, severity, this.contact.glancing, relativeX, relativeY);
      return this.contact;
    }
    return null;
  }

  private stepRiding(npc: NpcState, delta: number, player: Readonly<SkiState>): void {
    npc.phase += delta;
    const typeIndex = TYPE_BY_INDEX.indexOf(npc.type);
    const tempo = npc.type === 'speed-skier' ? 0.72 : npc.type === 'beginner-skier' ? 1.8 : 1.05;
    let intent = Math.sin(npc.phase * tempo + npc.variation * 6.28);
    if (npc.type === 'beginner-skier') intent *= 0.58;
    if (npc.type === 'snowboarder') intent = Math.sin(npc.phase * tempo + npc.variation * 8.7) * 0.82;

    const lookX = npc.x + npc.velocityX * 0.34;
    const lookY = npc.y + npc.velocityY * 0.42;
    const obstacle = this.features.findCollision(lookX, lookY, 1.2, this.obstacle);
    if (obstacle?.type === 'ramp' && npc.type === 'snowboarder') {
      npc.airborne = Math.max(npc.airborne, 1);
    } else if (obstacle && obstacle.type !== 'none') {
      const avoidance = Math.sign(lookX - obstacle.x) || (hashUnit(this.seed, npc.slot, npc.generation, 91) > 0.5 ? 1 : -1);
      intent = avoidance;
    }
    const playerDx = npc.x - player.position.x;
    const playerDy = npc.y - player.position.y;
    if (Math.abs(playerDy) < 12 && Math.abs(playerDx) < 5) {
      intent += Math.sign(playerDx || 1) * (1 - Math.abs(playerDx) / 5);
    }
    intent = Math.max(-1, Math.min(1, intent));
    const response = npc.type === 'beginner-skier' ? 2.2 : 3.8;
    npc.carve += (intent - npc.carve) * (1 - Math.exp(-response * delta));
    const targetSpeed = typeIndex === 0 ? 29 : typeIndex === 1 ? 10.5 : 20.5;
    const lateralForce = typeIndex === 0 ? 8.6 : typeIndex === 1 ? 3.4 : 6.8;
    npc.velocityX += npc.carve * lateralForce * delta;
    npc.velocityX *= Math.exp(-(typeIndex === 1 ? 1.7 : 1.25) * delta);
    npc.velocityY += (targetSpeed - npc.velocityY) * (1 - Math.exp(-1.1 * delta));
    npc.x += npc.velocityX * delta;
    npc.y += npc.velocityY * delta;
    npc.facing += (npc.carve * (typeIndex === 2 ? 0.78 : 0.55) - npc.facing) *
      (1 - Math.exp(-5 * delta));
    const carveStrength = Math.abs(npc.carve);
    const speedRatio = Math.min(1, Math.hypot(npc.velocityX, npc.velocityY) / 30);
    const compressionTarget =
      carveStrength * (npc.type === 'speed-skier' ? 0.62 : 0.38) +
      speedRatio * (npc.type === 'speed-skier' ? 0.28 : 0.1) +
      npc.recovery * 0.72;
    npc.compression +=
      (compressionTarget - npc.compression) * (1 - Math.exp(-5.5 * delta));
    npc.traverse +=
      (npc.facing - npc.traverse) * (1 - Math.exp(-4.2 * delta));
    npc.pose = carveStrength;
    npc.recovery *= Math.exp(-3.8 * delta);
    if (npc.airborne > 0) npc.airborne = Math.max(0, npc.airborne - delta * 0.82);

    const contactFeature = this.features.findCollision(npc.x, npc.y, NPC_COLLISION_RADIUS, this.obstacle);
    if (contactFeature && contactFeature.type !== 'none') {
      if (contactFeature.type === 'ramp') {
        npc.airborne = npc.type === 'snowboarder' ? 1 : 0.72;
        npc.collisionCooldown = 0.7;
      } else if (npc.collisionCooldown <= 0) {
        const severity = Math.min(1, Math.hypot(npc.velocityX, npc.velocityY) / 27);
        const offset = Math.abs(npc.x - contactFeature.x) / Math.max(0.2, contactFeature.radius);
        this.hitNpc(npc, severity, offset > 0.58, npc.velocityX, npc.velocityY);
      }
    }

    // Beginner mishaps are rare, deterministic, and tied to awkward transition timing.
    const mishapGate = hashCoordinates(this.seed, npc.slot, npc.generation, 151) % 1200;
    if (
      npc.type === 'beginner-skier' &&
      mishapGate < 7 &&
      npc.phase > 4 + mishapGate * 0.16
    ) {
      this.hitNpc(npc, 0.28, true, npc.velocityX, npc.velocityY);
    }
  }

  private hitNpc(
    npc: NpcState,
    severity: number,
    glancing: boolean,
    impactX: number,
    impactY: number,
  ): void {
    npc.fall = severity < 0.34 ? 'stumble' : glancing ? 'spin' : 'tumble';
    npc.fallTime = 0;
    npc.fallDuration = npc.fall === 'stumble' ? 0.72 : 1.15 + severity * 0.85;
    npc.velocityX += impactX * (0.12 + severity * 0.12);
    npc.velocityY = Math.max(3, npc.velocityY - Math.abs(impactY) * severity * 0.22);
    npc.collisionCooldown = npc.fallDuration + 0.5;
  }

  private stepFall(npc: NpcState, delta: number): void {
    npc.fallTime += delta;
    const progress = Math.min(1, npc.fallTime / npc.fallDuration);
    npc.pose = progress;
    npc.compression +=
      ((npc.fall === 'stumble' ? 0.68 : 0.3) - npc.compression) *
      (1 - Math.exp(-7 * delta));
    npc.traverse +=
      (Math.sign(npc.velocityX || 1) * 0.92 - npc.traverse) *
      (1 - Math.exp(-4 * delta));
    const drag = Math.exp(-(npc.fall === 'stumble' ? 1.2 : 2.1) * delta);
    npc.x += npc.velocityX * delta;
    npc.y += npc.velocityY * delta;
    npc.velocityX *= drag;
    npc.velocityY *= drag;
    if (progress < 1) return;
    npc.fall = 'none';
    npc.fallTime = 0;
    npc.recovery = 1;
    npc.velocityY = npc.type === 'beginner-skier' ? 6.5 : 10;
    npc.carve = 0;
  }

  private spawn(npc: NpcState, player: Readonly<SkiState>, initial: boolean): void {
    const key = npc.generation + (initial ? 0 : 1);
    npc.active = npc.slot < Math.min(3, this.populationLimit) ||
      (npc.slot < this.populationLimit && hashUnit(this.seed, npc.slot, key, 20) > 0.32);
    npc.type = TYPE_BY_INDEX[hashCoordinates(this.seed, npc.slot, key, 21) % 3]!;
    npc.variation = hashUnit(this.seed, npc.slot, key, 22);
    const side = hashUnit(this.seed, npc.slot, key, 23) * 2 - 1;
    npc.x = player.position.x + side * (9 + hashUnit(this.seed, npc.slot, key, 24) * 35);
    npc.y = player.position.y + 34 + npc.slot * 11 + hashUnit(this.seed, npc.slot, key, 25) * 34;
    npc.velocityX = 0;
    npc.velocityY = npc.type === 'speed-skier' ? 27 : npc.type === 'beginner-skier' ? 9 : 19;
    npc.facing = 0;
    npc.carve = 0;
    npc.pose = 0;
    npc.compression = 0;
    npc.traverse = 0;
    npc.phase = hashUnit(this.seed, npc.slot, key, 26) * 14;
    npc.hatColor = hashCoordinates(this.seed, npc.slot, key, 31) % 6;
    npc.topColor = hashCoordinates(this.seed, npc.slot, key, 32) % 6;
    npc.bottomColor = hashCoordinates(this.seed, npc.slot, key, 33) % 6;
    npc.accessoryColor = hashCoordinates(this.seed, npc.slot, key, 34) % 6;
    npc.fall = 'none';
    npc.fallTime = 0;
    npc.recovery = 0;
    npc.airborne = 0;
    npc.collisionCooldown = 0;
  }

  private resolveNpcContacts(): void {
    for (let first = 0; first < this.states.length; first += 1) {
      const a = this.states[first]!;
      if (!a.active || a.fall !== 'none' || a.collisionCooldown > 0) continue;
      for (let second = first + 1; second < this.states.length; second += 1) {
        const b = this.states[second]!;
        if (!b.active || b.fall !== 'none' || b.collisionCooldown > 0) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > 1.55 * 1.55) continue;
        const relativeX = a.velocityX - b.velocityX;
        const relativeY = a.velocityY - b.velocityY;
        const speed = Math.hypot(relativeX, relativeY);
        if (speed < 1.8) continue;
        const severity = Math.min(0.82, speed / 22);
        const glancing = Math.abs(dx) > Math.abs(dy);
        this.hitNpc(a, severity, glancing, relativeX, relativeY);
        this.hitNpc(b, severity, glancing, -relativeX, -relativeY);
      }
    }
  }

  private stepLab(delta: number, player: Readonly<SkiState>): void {
    for (const npc of this.states) npc.active = false;
    for (let index = 0; index < 3; index += 1) {
      const npc = this.states[index]!;
      npc.active = true;
      npc.type = index === 0 ? this.labType : TYPE_BY_INDEX[index]!;
      npc.x = player.position.x + (index - 1) * 8;
      npc.y = player.position.y + 18;
      npc.phase += delta;
      npc.carve = index === 0 ? this.labPose : Math.sin(npc.phase * (0.7 + index * 0.35)) * 0.78;
      npc.facing = npc.carve * (npc.type === 'snowboarder' ? 0.8 : 0.5);
      npc.pose = Math.abs(npc.carve);
      npc.compression = Math.abs(npc.carve) * 0.62;
      npc.traverse = npc.facing;
      npc.variation = 0.2 + index * 0.28;
      npc.hatColor = (index * 2) % 6;
      npc.topColor = (index * 2 + 1) % 6;
      npc.bottomColor = (index * 2 + 3) % 6;
      npc.accessoryColor = (index * 2 + 4) % 6;
      npc.fall = index === 0 ? this.labFall : 'none';
      npc.fallTime = this.labFall === 'none' ? 0 : (npc.fallTime + delta) % 1.6;
      npc.fallDuration = 1.6;
      npc.recovery = 0;
      npc.airborne = this.labPose > 0.85 ? 0.65 : 0;
    }
  }

  private finishMetrics(started: number): void {
    this.metrics.active = this.states.reduce((count, npc) => count + Number(npc.active), 0);
    this.metrics.recycled = this.recycled;
    this.metrics.simulationMs = performance.now() - started;
  }
}
