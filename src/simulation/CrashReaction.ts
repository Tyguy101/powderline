import { hashCoordinates } from '../core/SeededHash';
import type { FeatureType } from '../world/FeatureGeneratorCPU';

export type CrashFamily = 'face-plant' | 'side-spin' | 'rolling-tumble' | 'obstacle-slam';
export type CrashPhase = 'impact' | 'launch' | 'follow-through' | 'rest';
export type CollisionOutcome = 'minor' | 'stumble' | 'crash';

export interface ImpactContext {
  seed: number;
  obstacleId: number;
  obstacleType: Exclude<FeatureType, 'none'>;
  obstacleRadius: number;
  speed: number;
  velocityX: number;
  velocityY: number;
  facing: number;
  carve: number;
  airborneHeight: number;
  normalX: number;
  normalY: number;
  contactX: number;
  contactY: number;
  contactOffset: number;
  variation?: number;
}

export interface CrashReaction {
  outcome: CollisionOutcome;
  family: CrashFamily;
  severity: number;
  strength: number;
  glancing: number;
  spinDirection: number;
  rolls: number;
  launch: number;
  squash: number;
  equipmentSpread: number;
  duration: number;
  impactDuration: number;
  launchDuration: number;
  followDuration: number;
  variant: number;
}

export interface CrashVisualState {
  active: boolean;
  family: CrashFamily;
  phase: CrashPhase;
  progress: number;
  severity: number;
  rotation: number;
  lift: number;
  squash: number;
  equipmentSpread: number;
  snowBurst: number;
  slideTrail: number;
  facePlant: number;
  treeStick: number;
  sideWipeout: number;
  tumbleCurl: number;
  skiLift: number;
  armSpread: number;
  trailActive: boolean;
  trailStartX: number;
  trailStartY: number;
  elapsed: number;
  duration: number;
  contactX: number;
  contactY: number;
  normalX: number;
  normalY: number;
  impactStrength: number;
}

export function createCrashVisualState(): CrashVisualState {
  return {
    active: false,
    family: 'face-plant',
    phase: 'rest',
    progress: 0,
    severity: 0,
    rotation: 0,
    lift: 0,
    squash: 0,
    equipmentSpread: 0,
    snowBurst: 0,
    slideTrail: 0,
    facePlant: 0,
    treeStick: 0,
    sideWipeout: 0,
    tumbleCurl: 0,
    skiLift: 0,
    armSpread: 0,
    trailActive: false,
    trailStartX: 0,
    trailStartY: 0,
    elapsed: 0,
    duration: 0,
    contactX: 0,
    contactY: 0,
    normalX: 0,
    normalY: -1,
    impactStrength: 0,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function selectCrashReaction(context: Readonly<ImpactContext>): CrashReaction {
  const speed = Math.max(0, context.speed);
  const invSpeed = speed > 0.001 ? 1 / speed : 0;
  const incomingNormal = Math.max(
    0,
    -(context.velocityX * context.normalX + context.velocityY * context.normalY) * invSpeed,
  );
  const glancing = clamp01(1 - incomingNormal);
  const centered = 1 - clamp01(Math.abs(context.contactOffset));
  const size = clamp01((context.obstacleRadius - 0.55) / 0.9);
  const airborne = clamp01(context.airborneHeight / 2);
  const strength = clamp01(
    speed / 32 * (0.42 + incomingNormal * 0.58) *
      (0.86 + size * 0.14) +
      airborne * 0.14,
  );
  const severity = clamp01(strength * 0.8 + centered * 0.16 + speed / 70);
  const variationKey = context.variation ?? 0;
  const hash = hashCoordinates(
    context.seed ^ context.obstacleId,
    Math.round(context.contactX * 64),
    Math.round(context.contactY * 64),
    91 + variationKey,
  );
  const variant = hash / 0x1_0000_0000;
  const spinDirection =
    Math.abs(context.contactOffset) > 0.08
      ? Math.sign(context.contactOffset)
      : (hash & 1) === 0 ? -1 : 1;

  let outcome: CollisionOutcome =
    strength < 0.2 || (glancing > 0.76 && speed < 25)
      ? 'minor'
      : strength < 0.36 || (glancing > 0.58 && speed < 29)
        ? 'stumble'
        : 'crash';

  if (context.obstacleType === 'tree' && centered > 0.82 && speed > 12) outcome = 'crash';

  let family: CrashFamily;
  if (outcome !== 'crash' || glancing > 0.58) {
    family = 'side-spin';
  } else if (context.obstacleType === 'tree' && centered > 0.58) {
    family = 'obstacle-slam';
  } else if (
    context.obstacleType === 'rock' &&
    centered < 0.72 &&
    (speed > 23 || airborne > 0.15 || variant > 0.56)
  ) {
    family = 'rolling-tumble';
  } else {
    family = 'face-plant';
  }

  const rareExaggeration = severity > 0.88 && variant > 0.88 ? 1 : 0;
  const rolls =
    family === 'rolling-tumble'
      ? 1 + Math.floor(severity * 2.4 + variant * 1.3) + rareExaggeration
      : family === 'side-spin'
        ? 1
        : 0;
  const launch =
    context.obstacleType === 'rock'
      ? clamp01(0.25 + severity * 0.75)
      : family === 'rolling-tumble'
        ? severity * 0.5
        : severity * 0.12;
  const squash = family === 'obstacle-slam' ? 0.55 + severity * 0.35 : 0.08;
  const equipmentSpread = clamp01(severity * 0.75 + rareExaggeration * 0.25);
  const impactDuration = family === 'obstacle-slam' ? 0.2 : 0.16;
  const launchDuration = family === 'obstacle-slam' ? 0 : 0.22 + launch * 0.46;
  const followDuration =
    family === 'obstacle-slam'
      ? 1.8 + variant * 0.28
      : 0.52 + severity * 1.55 + rolls * 0.24;
  const duration =
    family === 'obstacle-slam'
      ? impactDuration + followDuration
      : impactDuration + launchDuration + followDuration + 0.8 + variant * 0.38;

  return {
    outcome,
    family,
    severity,
    strength,
    glancing,
    spinDirection,
    rolls,
    launch,
    squash,
    equipmentSpread,
    duration,
    impactDuration,
    launchDuration,
    followDuration,
    variant,
  };
}
