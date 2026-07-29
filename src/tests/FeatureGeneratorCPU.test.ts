import { describe, expect, it } from 'vitest';
import {
  describeFeature,
  FeatureGeneratorCPU,
  type FeatureDescriptor,
} from '../world/FeatureGeneratorCPU';

function feature(): FeatureDescriptor {
  return { id: 0, type: 'none', x: 0, y: 0, radius: 0, scale: 0 };
}

describe('deterministic CPU features', () => {
  it('produces identical descriptors for a seed and cell', () => {
    const a = describeFeature(424242, -17, 83, feature());
    const b = describeFeature(424242, -17, 83, feature());
    expect(a).toEqual(b);
  });

  it('keeps the spawn corridor clear and collides with generated features', () => {
    const seed = 424242;
    const generator = new FeatureGeneratorCPU(seed);
    const candidate = feature();
    for (let cellY = -2; cellY <= 7; cellY += 1) {
      for (let cellX = -1; cellX <= 0; cellX += 1) {
        const nearSpawn = describeFeature(seed, cellX, cellY, feature());
        if (nearSpawn.y < 100 && Math.abs(nearSpawn.x) < 6) {
          expect(nearSpawn.type).toBe('none');
        }
      }
    }

    let found: FeatureDescriptor | null = null;
    for (let cellY = 9; cellY < 30 && !found; cellY += 1) {
      for (let cellX = -4; cellX <= 4 && !found; cellX += 1) {
        const descriptor = describeFeature(seed, cellX, cellY, feature());
        if (descriptor.type !== 'none') found = { ...descriptor };
      }
    }
    expect(found).not.toBeNull();
    expect(generator.findCollision(found!.x, found!.y, 0.62, candidate)).toEqual(found);
  });
});
