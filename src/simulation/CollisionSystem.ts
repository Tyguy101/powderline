import type { FeatureDescriptor } from '../world/FeatureGeneratorCPU';
import { FeatureGeneratorCPU, type SectionSource } from '../world/FeatureGeneratorCPU';
import { pathCenter, pathHalfWidth, skiBand } from '../world/EndlessMountain';
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

  constructor(seed: number, private readonly course?: SectionSource) {
    this.generator = new FeatureGeneratorCPU(seed, course);
  }

  queryWall(state: Readonly<SkiState>): Readonly<CollisionContact> | null {
    const section = this.course?.sectionAt(state.position.y);
    if (!section) return null;
    const { x, y } = state.position;
    const band = section.trail === 'patrol' ? skiBand(section, x, y) : null;
    const center = band ? (band.left + band.right) * 0.5 : pathCenter(section, y);
    const side = Math.sign(x - center);
    const edge = band ? (side < 0 ? band.left : band.right) : center + side * pathHalfWidth(section, y);
    if ((x - edge) * side < -SKIER_COLLISION_RADIUS || side === 0) return null;
    const nextBand = band ? skiBand(section, x, y + 0.5) : null;
    const downhillEdge = nextBand ? (side < 0 ? nextBand.left : nextBand.right)
      : pathCenter(section, y + 0.5) + side * pathHalfWidth(section, y + 0.5);
    const slope = (downhillEdge - edge) * 2;
    const length = Math.hypot(1, slope);
    this.contact.normalX = -side / length;
    this.contact.normalY = side * slope / length;
    this.contact.contactX = edge;
    this.contact.contactY = y;
    const speed = Math.max(0.01, Math.hypot(state.velocityX, state.velocityY));
    this.contact.contactOffset = (state.velocityX * this.contact.normalY -
      state.velocityY * this.contact.normalX) / speed;
    Object.assign(this.hit, { id: section.id, type: 'rock', x: edge, y, radius: 0, scale: 1 });
    return this.contact;
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
