import { describe, expect, it } from 'vitest';
import {
  createPoseParameters,
  resolveSkierPose,
  SKIER_POSES,
} from '../simulation/SkierPose';
import { SkiPhysics } from '../simulation/SkiPhysics';

describe('procedural skier poses', () => {
  it('gives every inspection pose a distinct parameter signature', () => {
    const state = new SkiPhysics().state;
    const target = createPoseParameters();
    const signatures = new Set<string>();
    for (const pose of SKIER_POSES) {
      resolveSkierPose(state, { steer: 0, brake: false, tuck: false }, pose, target);
      signatures.add(Object.values(target).map((value) => value.toFixed(2)).join(','));
    }
    expect(signatures.size).toBe(SKIER_POSES.length);
  });
});
