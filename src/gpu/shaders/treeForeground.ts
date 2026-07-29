import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  max,
  mod,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { FEATURE_CELL_SIZE } from '../../world/FeatureGeneratorCPU';

function hashUnitNode(
  seed: number,
  x: Node<'float'>,
  y: Node<'float'>,
  category: number,
): Node<'float'> {
  const modulus = 997;
  const cellX = mod(mod(x, modulus).add(modulus), modulus);
  const cellY = mod(mod(y, modulus).add(modulus), modulus);
  const cross = mod(cellX.mul(cellY), modulus);
  const seedValue = ((seed % modulus) + modulus) % modulus;
  return mod(
    cross
      .mul(17 + category * 2)
      .add(cellX.mul(73 + category * 11))
      .add(cellY.mul(151 + category * 7))
      .add(seedValue * (29 + category * 3))
      .add(category * 199),
    modulus,
  ).div(modulus);
}

export function createTreeForegroundShader(seed: number) {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const p = uv();
  const wx = p.x.sub(0.5).mul(viewWidth).add(worldX);
  const wy = float(0.5).sub(p.y).mul(viewHeight).add(worldY);
  const grid = vec2(wx, wy).div(FEATURE_CELL_SIZE);
  const cell = floor(grid);
  const jitter = vec2(
    hashUnitNode(seed, cell.x, cell.y, 1).sub(0.5).mul(0.5),
    hashUnitNode(seed, cell.x, cell.y, 2).sub(0.5).mul(0.5),
  );
  const local = fract(grid).sub(0.5).sub(jitter);
  const choice = hashUnitNode(seed, cell.x, cell.y, 3);
  const scale = hashUnitNode(seed, cell.x, cell.y, 4).mul(0.34).add(0.84);
  const q = local.div(scale);
  const centerX = cell.x.add(0.5).add(jitter.x).mul(FEATURE_CELL_SIZE);
  const centerY = cell.y.add(0.5).add(jitter.y).mul(FEATURE_CELL_SIZE);
  const spawnSafe = step(30, centerY).mul(max(step(100, centerY), step(6, abs(centerX))));
  const treeChoice = step(0.78, choice).mul(spawnSafe);
  const trunkPoint = q.sub(vec2(0, 0.025));
  const trunkDistance = max(abs(trunkPoint.x).sub(0.034), abs(trunkPoint.y).sub(0.19));
  const trunk = float(1).sub(smoothstep(-0.012, 0.012, trunkDistance)).mul(treeChoice);
  const barkStripe = float(1)
    .sub(smoothstep(0.004, 0.014, abs(q.x.add(0.012))))
    .mul(trunk)
    .mul(0.35);
  const upperTrunk = float(1).sub(step(0.105, q.y)).mul(trunk);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = vec3(0.27, 0.21, 0.15)
    .add(vec3(0.08, 0.05, 0.02).mul(barkStripe))
    .add(vec3(-0.12, 0.2, 0.08).mul(upperTrunk.mul(0.72)));
  material.opacityNode = trunk;
  material.transparent = true;
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
