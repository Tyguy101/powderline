import type { InputState } from '../input/InputState';
import type { SkiState } from './SkiPhysics';

export const SKIER_POSES = [
  'neutral',
  'turn-left',
  'turn-right',
  'carve-left',
  'carve-right',
  'traverse-left',
  'traverse-right',
  'brake',
  'tuck',
  'airborne',
  'landing',
  'crash',
  'idle',
] as const;

export type SkierPoseName = (typeof SKIER_POSES)[number];

export interface SkierPoseParameters {
  lean: number;
  traverse: number;
  crouch: number;
  wedge: number;
  tuck: number;
  air: number;
  landing: number;
  crash: number;
  spray: number;
  stopped: number;
}

const BASE_POSE: SkierPoseParameters = {
  lean: 0,
  traverse: 0,
  crouch: 0.12,
  wedge: 0,
  tuck: 0,
  air: 0,
  landing: 0,
  crash: 0,
  spray: 0.08,
  stopped: 0,
};

const PRESETS: Record<SkierPoseName, Partial<SkierPoseParameters>> = {
  neutral: {},
  'turn-left': { lean: -0.38, crouch: 0.2, spray: 0.24 },
  'turn-right': { lean: 0.38, crouch: 0.2, spray: 0.24 },
  'carve-left': { lean: -0.82, crouch: 0.34, spray: 0.9 },
  'carve-right': { lean: 0.82, crouch: 0.34, spray: 0.9 },
  'traverse-left': { lean: -0.28, traverse: -0.9, crouch: 0.16, spray: 0.18 },
  'traverse-right': { lean: 0.28, traverse: 0.9, crouch: 0.16, spray: 0.18 },
  brake: { crouch: 0.34, wedge: 1, spray: 1 },
  tuck: { crouch: 0.9, tuck: 1, spray: 0.04 },
  airborne: { crouch: 0.08, air: 1, spray: 0 },
  landing: { crouch: 0.82, landing: 1, spray: 0.72 },
  crash: { crash: 1, spray: 0.42 },
  idle: { stopped: 1, wedge: 0.25, spray: 0 },
};

export function createPoseParameters(): SkierPoseParameters {
  return { ...BASE_POSE };
}

function writePreset(target: SkierPoseParameters, name: SkierPoseName): void {
  Object.assign(target, BASE_POSE, PRESETS[name]);
}

export function resolveSkierPose(
  state: Readonly<SkiState>,
  input: Readonly<InputState>,
  override: SkierPoseName | null,
  target: SkierPoseParameters,
): void {
  if (override) {
    writePreset(target, override);
    return;
  }
  const speed = Math.hypot(state.velocityX, state.velocityY);
  if (state.crashed) {
    writePreset(target, 'crash');
    return;
  }
  if (speed < 5.2) {
    writePreset(target, 'idle');
    return;
  }
  if (input.brake) {
    writePreset(target, 'brake');
    return;
  }
  if (input.tuck) {
    writePreset(target, 'tuck');
    return;
  }

  const lateralRatio = Math.max(-1, Math.min(1, state.velocityX / Math.max(5, state.velocityY) * 3));
  const carve = Math.max(-1, Math.min(1, state.carve));
  Object.assign(target, BASE_POSE);
  target.lean = carve * 0.78;
  target.traverse = lateralRatio;
  target.crouch = 0.12 + Math.abs(carve) * 0.24;
  target.spray = 0.08 + Math.abs(carve) * 0.72;
}
