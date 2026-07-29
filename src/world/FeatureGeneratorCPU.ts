import { hashCoordinates } from '../core/SeededHash';

export const FEATURE_CELL_SIZE = 12;
export const FEATURE_MAX_RADIUS = 1.35;

export type FeatureType = 'none' | 'tree' | 'rock';

export interface FeatureDescriptor {
  id: number;
  type: FeatureType;
  x: number;
  y: number;
  radius: number;
  scale: number;
}

const EMPTY_FEATURE: FeatureDescriptor = {
  id: 0,
  type: 'none',
  x: 0,
  y: 0,
  radius: 0,
  scale: 0,
};

function featureUnit(seed: number, x: number, y: number, category: number): number {
  const modulus = 997;
  const mod = (value: number): number => ((value % modulus) + modulus) % modulus;
  const cellX = mod(x);
  const cellY = mod(y);
  const cross = mod(cellX * cellY);
  const value = mod(
    cross * (17 + category * 2) +
      cellX * (73 + category * 11) +
      cellY * (151 + category * 7) +
      mod(seed) * (29 + category * 3) +
      category * 199,
  );
  return value / modulus;
}

export function describeFeature(
  seed: number,
  cellX: number,
  cellY: number,
  target: FeatureDescriptor,
): FeatureDescriptor {
  const jitterX = (featureUnit(seed, cellX, cellY, 1) - 0.5) * 0.5;
  const jitterY = (featureUnit(seed, cellX, cellY, 2) - 0.5) * 0.5;
  const x = (cellX + 0.5 + jitterX) * FEATURE_CELL_SIZE;
  const y = (cellY + 0.5 + jitterY) * FEATURE_CELL_SIZE;
  const choice = featureUnit(seed, cellX, cellY, 3);
  const scale = 0.84 + featureUnit(seed, cellX, cellY, 4) * 0.34;
  const spawnSafe = y >= 30 && (y >= 100 || Math.abs(x) >= 6);
  const type: FeatureType = !spawnSafe
    ? 'none'
    : choice >= 0.78
      ? 'tree'
      : choice >= 0.62
        ? 'rock'
        : 'none';

  target.id = hashCoordinates(seed, cellX, cellY, 5);
  target.type = type;
  target.x = x;
  target.y = y;
  target.scale = scale;
  target.radius = type === 'tree' ? 1.05 * scale : type === 'rock' ? 0.88 * scale : 0;
  return target;
}

export class FeatureGeneratorCPU {
  private readonly candidate: FeatureDescriptor = { ...EMPTY_FEATURE };

  constructor(private readonly seed: number) {}

  findCollision(
    x: number,
    y: number,
    playerRadius: number,
    target: FeatureDescriptor,
  ): FeatureDescriptor | null {
    const range = playerRadius + FEATURE_MAX_RADIUS;
    const minCellX = Math.floor((x - range) / FEATURE_CELL_SIZE);
    const maxCellX = Math.floor((x + range) / FEATURE_CELL_SIZE);
    const minCellY = Math.floor((y - range) / FEATURE_CELL_SIZE);
    const maxCellY = Math.floor((y + range) / FEATURE_CELL_SIZE);

    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        describeFeature(this.seed, cellX, cellY, this.candidate);
        if (this.candidate.type === 'none') continue;
        const dx = x - this.candidate.x;
        const dy = y - this.candidate.y;
        const combinedRadius = playerRadius + this.candidate.radius;
        if (dx * dx + dy * dy >= combinedRadius * combinedRadius) continue;
        Object.assign(target, this.candidate);
        return target;
      }
    }
    return null;
  }
}
