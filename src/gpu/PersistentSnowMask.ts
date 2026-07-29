import {
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  StorageTexture,
  WebGPURenderer,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  clamp,
  float,
  floor,
  Fn,
  If,
  instanceIndex,
  length,
  max,
  min,
  storageTexture,
  textureStore,
  uint,
  uniform,
  uvec2,
  vec2,
  vec4,
} from 'three/tsl';
import type { SkiState } from '../simulation/SkiPhysics';

export const SNOW_MASK_SIZE = 512;
export const SNOW_MASK_CELL_SIZE = 0.35;
export const SNOW_MASK_RELAX_SECONDS = 22;

const DEPOSIT_GRID_SIZE = 32;
const DEPOSIT_INVOCATIONS = DEPOSIT_GRID_SIZE * DEPOSIT_GRID_SIZE;

function toroidalCoordinate(globalCell: Node<'vec2'>): Node<'vec2'> {
  return globalCell.sub(
    floor(globalCell.div(SNOW_MASK_SIZE)).mul(SNOW_MASK_SIZE),
  ) as Node<'vec2'>;
}

export class PersistentSnowMask {
  readonly texture: StorageTexture;
  readonly time = uniform(0);
  readonly resetTime = uniform(0);
  private readonly start = uniform(vec2(0, 0));
  private readonly end = uniform(vec2(0, 0));
  private readonly intensity = uniform(0);
  private readonly landing = uniform(0);
  private readonly computeNode;
  private elapsed = 0;
  private previousX = 0;
  private previousY = 0;
  private hasPrevious = false;
  private pending = false;
  private pendingStartX = 0;
  private pendingStartY = 0;
  private pendingEndX = 0;
  private pendingEndY = 0;
  private pendingIntensity = 0;
  private pendingLanding = 0;
  private landingWasActive = false;
  private stamps = 0;
  private lastFlushTime = -1;

  constructor() {
    this.texture = new StorageTexture(SNOW_MASK_SIZE, SNOW_MASK_SIZE);
    this.texture.format = RGBAFormat;
    this.texture.type = HalfFloatType;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;

    const mask = storageTexture(this.texture).toWriteOnly();
    const deposit = Fn(() => {
      const offset = vec2(
        float(instanceIndex.mod(uint(DEPOSIT_GRID_SIZE))),
        float(instanceIndex.div(uint(DEPOSIT_GRID_SIZE))),
      ).sub(DEPOSIT_GRID_SIZE * 0.5);
      const midpoint = this.start.add(this.end).mul(0.5);
      const centerCell = floor(midpoint.div(SNOW_MASK_CELL_SIZE));
      const globalCell = centerCell.add(offset);
      const texel = toroidalCoordinate(globalCell);
      const coordinate = uvec2(texel);
      const world = globalCell.add(0.5).mul(SNOW_MASK_CELL_SIZE);
      const segment = this.end.sub(this.start);
      const segmentLengthSquared = max(segment.dot(segment), 0.0001);
      const along = clamp(world.sub(this.start).dot(segment).div(segmentLengthSquared), 0, 1);
      const closest = this.start.add(segment.mul(along));
      const direction = segment.div(max(length(segment), 0.001));
      const perpendicular = vec2(direction.y.negate(), direction.x);
      const skiSpacing = float(0.3).add(this.intensity.mul(0.09));
      const leftDistance = length(world.sub(closest.add(perpendicular.mul(skiSpacing))));
      const rightDistance = length(world.sub(closest.sub(perpendicular.mul(skiSpacing))));
      const grooveDistance = min(leftDistance, rightDistance);
      const groove = clamp(
        float(1).sub(grooveDistance.div(float(0.28).add(this.intensity.mul(0.12)))),
        0,
        1,
      );
      const landingDistance = length(world.sub(this.end));
      const landingBurst = clamp(float(1).sub(landingDistance.div(1.8)), 0, 1)
        .mul(this.landing);
      const deposited = max(
        groove.mul(float(0.65).add(this.intensity.mul(0.35))),
        landingBurst,
      );
      const page = floor(globalCell.div(SNOW_MASK_SIZE));
      If(deposited.greaterThan(0.015), () => {
        textureStore(mask, coordinate, vec4(deposited, page.x, page.y, this.time));
      });
    });
    this.computeNode = deposit().compute(DEPOSIT_INVOCATIONS);
  }

  record(state: Readonly<SkiState>, delta: number): void {
    this.elapsed += delta;
    this.time.value = this.elapsed;
    if (state.crashed) {
      this.landingWasActive = false;
      return;
    }
    if (state.airborne) {
      this.previousX = state.position.x;
      this.previousY = state.position.y;
      this.hasPrevious = true;
      this.landingWasActive = false;
      return;
    }
    const landing = state.landingAmount > 0.82 && !this.landingWasActive ? 1 : 0;
    this.landingWasActive = state.landingAmount > 0.18;
    if (!this.hasPrevious) {
      this.previousX = state.position.x;
      this.previousY = state.position.y;
      this.hasPrevious = true;
      return;
    }
    const dx = state.position.x - this.previousX;
    const dy = state.position.y - this.previousY;
    if (Math.hypot(dx, dy) < 0.08 && landing === 0) return;
    if (!this.pending) {
      this.pendingStartX = this.previousX;
      this.pendingStartY = this.previousY;
      this.pendingIntensity = 0;
      this.pendingLanding = 0;
    }
    this.pendingEndX = state.position.x;
    this.pendingEndY = state.position.y;
    this.pendingIntensity = Math.max(
      this.pendingIntensity,
      Math.max(0.08, Math.min(1, Math.abs(state.carve))),
    );
    this.pendingLanding = Math.max(this.pendingLanding, landing);
    this.pending = true;
    this.previousX = state.position.x;
    this.previousY = state.position.y;
  }

  flush(renderer: WebGPURenderer): void {
    if (!this.pending) return;
    if (this.pendingLanding === 0 && this.elapsed - this.lastFlushTime < 0.25) return;
    this.start.value.set(this.pendingStartX, this.pendingStartY);
    this.end.value.set(this.pendingEndX, this.pendingEndY);
    this.intensity.value = this.pendingIntensity;
    this.landing.value = this.pendingLanding;
    renderer.compute(this.computeNode);
    this.pending = false;
    this.lastFlushTime = this.elapsed;
    this.stamps += 1;
  }

  reset(state: Readonly<SkiState>): void {
    this.resetTime.value = this.elapsed;
    this.previousX = state.position.x;
    this.previousY = state.position.y;
    this.hasPrevious = true;
    this.pending = false;
    this.pendingIntensity = 0;
    this.pendingLanding = 0;
    this.landingWasActive = false;
    this.lastFlushTime = -1;
    this.stamps = 0;
  }

  get stampCount(): number {
    return this.stamps;
  }
}
