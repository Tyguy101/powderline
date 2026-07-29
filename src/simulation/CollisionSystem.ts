import type { FeatureDescriptor } from '../world/FeatureGeneratorCPU';
import { FeatureGeneratorCPU } from '../world/FeatureGeneratorCPU';
import type { SkiState } from './SkiPhysics';

export const SKIER_COLLISION_RADIUS = 0.62;

export interface CollisionContact {
  readonly feature: Readonly<FeatureDescriptor>;
  normalX: number;
  normalY: number;
  contactX: number;
  contactY: number;
  contactOffset: number;
}

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
  private readonly contact: CollisionContact = {
    feature: this.hit,
    normalX: 0,
    normalY: -1,
    contactX: 0,
    contactY: 0,
    contactOffset: 0,
  };

  constructor(seed: number) {
    this.generator = new FeatureGeneratorCPU(seed);
  }

  query(state: Readonly<SkiState>): Readonly<CollisionContact> | null {
    const feature = this.generator.findCollision(
      state.position.x,
      state.position.y,
      SKIER_COLLISION_RADIUS,
      this.hit,
    );
    if (!feature) return null;
    const dx = state.position.x - feature.x;
    const dy = state.position.y - feature.y;
    const distance = Math.max(0.0001, Math.hypot(dx, dy));
    this.contact.normalX = dx / distance;
    this.contact.normalY = dy / distance;
    this.contact.contactX = feature.x + this.contact.normalX * feature.radius;
    this.contact.contactY = feature.y + this.contact.normalY * feature.radius;
    const speed = Math.max(0.0001, Math.hypot(state.velocityX, state.velocityY));
    this.contact.contactOffset = Math.max(
      -1,
      Math.min(
        1,
        (state.velocityX * this.contact.normalY -
          state.velocityY * this.contact.normalX) /
          speed,
      ),
    );
    return this.contact;
  }
}
