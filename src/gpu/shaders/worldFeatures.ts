import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  mod,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { FEATURE_CELL_SIZE } from '../../world/FeatureGeneratorCPU';

function ellipse(point: Node<'vec2'>, radius: Node<'vec2'>): Node<'float'> {
  return float(1).sub(smoothstep(0.88, 1.04, length(point.div(radius))));
}

function box(point: Node<'vec2'>, halfSize: Node<'vec2'>): Node<'float'> {
  const distance = max(abs(point.x).sub(halfSize.x), abs(point.y).sub(halfSize.y));
  return float(1).sub(smoothstep(-0.015, 0.015, distance));
}

function pineTier(
  point: Node<'vec2'>,
  centerY: number,
  halfWidth: number,
  height: number,
): Node<'float'> {
  const tier = point.sub(vec2(0, centerY));
  const halfHeight = height * 0.5;
  const allowedWidth = tier.y.add(halfHeight).div(height).mul(halfWidth);
  const distance = max(abs(tier.y).sub(halfHeight), abs(tier.x).sub(allowedWidth));
  return float(1).sub(smoothstep(-0.012, 0.012, distance));
}

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

export interface WorldFeatureShader {
  readonly material: MeshBasicNodeMaterial;
  readonly worldX: ReturnType<typeof uniform>;
  readonly worldY: ReturnType<typeof uniform>;
  readonly viewWidth: ReturnType<typeof uniform>;
  readonly viewHeight: ReturnType<typeof uniform>;
}

export function createWorldFeatureShader(seed: number): WorldFeatureShader {
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
  const rockChoice = step(0.62, choice).mul(float(1).sub(step(0.78, choice))).mul(spawnSafe);
  const rampChoice = step(0.585, choice)
    .mul(float(1).sub(step(0.62, choice)))
    .mul(spawnSafe);

  const treeShadow = ellipse(q.sub(vec2(0.045, 0.115)), vec2(0.14, 0.055));
  const treeTrunk = box(q.sub(vec2(0, 0.025)), vec2(0.034, 0.19));
  const treeLower = pineTier(q, 0.015, 0.13, 0.17);
  const treeMiddle = pineTier(q, -0.07, 0.105, 0.15);
  const treeUpper = pineTier(q, -0.145, 0.075, 0.125);
  const treeSnow = pineTier(q.sub(vec2(-0.012, 0.002)), -0.155, 0.052, 0.062);
  const treeBody = max(treeTrunk, max(treeLower, max(treeMiddle, treeUpper))).mul(treeChoice);

  const rockShadow = ellipse(q.sub(vec2(0.04, 0.055)), vec2(0.13, 0.05));
  const rockBody = ellipse(q, vec2(0.105, 0.075)).mul(rockChoice);
  const rockFacet = ellipse(q.sub(vec2(-0.028, -0.012)), vec2(0.065, 0.045)).mul(rockChoice);
  const rockSnow = ellipse(q.sub(vec2(-0.018, -0.038)), vec2(0.077, 0.032)).mul(rockChoice);

  const rampShadow = ellipse(q.sub(vec2(0.035, 0.045)), vec2(0.13, 0.052));
  const rampBody = box(q, vec2(0.105, 0.055)).mul(rampChoice);
  const rampLip = box(q.sub(vec2(0, -0.042)), vec2(0.112, 0.014)).mul(rampChoice);
  const rampStripe = box(q, vec2(0.018, 0.058)).mul(rampChoice);

  const shadow = max(
    max(treeShadow.mul(treeChoice), rockShadow.mul(rockChoice)),
    rampShadow.mul(rampChoice),
  );
  let color: Node<'vec3'> = vec3(0.14, 0.3, 0.34);
  color = mix(color, vec3(0.1, 0.24, 0.27), shadow.mul(0.28));
  color = mix(color, vec3(0.26, 0.22, 0.17), treeTrunk.mul(treeChoice));
  color = mix(color, vec3(0.08, 0.45, 0.3), treeBody);
  color = mix(color, vec3(0.55, 0.67, 0.68), rockBody);
  color = mix(color, vec3(0.38, 0.5, 0.52), rockFacet);
  color = mix(color, vec3(0.94, 0.99, 1), max(treeSnow.mul(treeChoice), rockSnow));
  color = mix(color, vec3(0.78, 0.09, 0.08), rampBody);
  color = mix(color, vec3(0.98, 0.27, 0.18), rampLip);
  color = mix(color, vec3(0.98, 0.84, 0.65), rampStripe);
  const body = max(max(treeBody, rockBody), rampBody);
  const highlight = max(treeSnow.mul(treeChoice), rockSnow);
  const alpha = max(shadow.mul(0.25), max(max(body, highlight), max(rampLip, rampStripe)));

  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
