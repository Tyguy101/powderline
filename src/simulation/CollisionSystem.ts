import type { FeatureDescriptor } from '../world/FeatureGeneratorCPU';
import { FeatureGeneratorCPU } from '../world/FeatureGeneratorCPU';
import type { SkiState } from './SkiPhysics';

export const SKIER_COLLISION_RADIUS = 0.62;

export class CollisionSystem {
  private readonly generator: FeatureGeneratorCPU;
  private readonly hit: FeatureDescriptor = {
    id: 0,
    type: 'none',
    x: 0,
    y: 0,
    radius: 0,
    scale: 0,
  };

  constructor(seed: number) {
    this.generator = new FeatureGeneratorCPU(seed);
  }

  query(state: Readonly<SkiState>): Readonly<FeatureDescriptor> | null {
    return this.generator.findCollision(
      state.position.x,
      state.position.y,
      SKIER_COLLISION_RADIUS,
      this.hit,
    );
  }
}
