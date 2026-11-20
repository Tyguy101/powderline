import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Quaternion,
  StorageInstancedBufferAttribute,
  Vector3,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  float,
  instanceIndex,
  length,
  max,
  mix,
  smoothstep,
  storage,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import {
  FeatureGeneratorCPU,
  FEATURE_CELL_SIZE,
  type FeatureDescriptor,
  type SectionSource,
} from '../world/FeatureGeneratorCPU';

const FEATURE_CAPACITY = 192;

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

function mask(value: Node<'float'>, expected: number): Node<'float'> {
  return float(1).sub(smoothstep(0.08, 0.2, abs(value.sub(expected))));
}

export class WorldFeatureRenderer {
  readonly mesh: InstancedMesh;
  private readonly typeData = new Float32Array(FEATURE_CAPACITY * 4);
  private readonly typeAttribute: StorageInstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly candidate: FeatureDescriptor = {
    id: 0, type: 'none', x: 0, y: 0, radius: 0, scale: 0,
  };
  private previousMinX = Number.NaN;
  private previousMaxX = Number.NaN;
  private previousMinY = Number.NaN;
  private previousMaxY = Number.NaN;
  private visibleCount = 0;
  private readonly generation: FeatureGeneratorCPU;
  private previousRevision = -1;
  private anchorX = 0;
  private anchorY = 0;

  constructor(seed: number, private readonly course?: SectionSource) {
    this.generation = new FeatureGeneratorCPU(seed, course);
    this.typeAttribute = new StorageInstancedBufferAttribute(this.typeData, 4);
    this.typeAttribute.setUsage(DynamicDrawUsage);
    const feature = varying(
      storage(this.typeAttribute, 'vec4', FEATURE_CAPACITY).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const tree = mask(feature.x, 1);
    const rock = mask(feature.x, 2);
    const ramp = mask(feature.x, 3);
    // Convert the tight 4 × 6 world quad back to the original cell-normalized
    // q coordinate used by the fullscreen shader. Visual dimensions are exact.
    const featureUv = uv();
    const q = vec2(featureUv.x.sub(0.5), float(0.5).sub(featureUv.y))
      .mul(vec2(4 / FEATURE_CELL_SIZE, 6 / FEATURE_CELL_SIZE));
    const treeShadow = ellipse(q.sub(vec2(0.045, 0.115)), vec2(0.14, 0.055));
    const treeTrunk = box(q.sub(vec2(0, 0.025)), vec2(0.034, 0.19));
    const treeLower = pineTier(q, 0.015, 0.13, 0.17);
    const treeMiddle = pineTier(q, -0.07, 0.105, 0.15);
    const treeUpper = pineTier(q, -0.145, 0.075, 0.125);
    const treeSnow = pineTier(q.sub(vec2(-0.012, 0.002)), -0.155, 0.052, 0.062);
    const treeBody = max(treeTrunk, max(treeLower, max(treeMiddle, treeUpper))).mul(tree);
    const rockShadow = ellipse(q.sub(vec2(0.04, 0.055)), vec2(0.13, 0.05));
    const rockBody = ellipse(q, vec2(0.105, 0.075)).mul(rock);
    const rockFacet = ellipse(q.sub(vec2(-0.028, -0.012)), vec2(0.065, 0.045)).mul(rock);
    const rockSnow = ellipse(q.sub(vec2(-0.018, -0.038)), vec2(0.077, 0.032)).mul(rock);
    const rampShadow = ellipse(q.sub(vec2(0.035, 0.045)), vec2(0.13, 0.052));
    const rampBody = box(q, vec2(0.105, 0.055)).mul(ramp);
    const rampLip = box(q.sub(vec2(0, -0.042)), vec2(0.112, 0.014)).mul(ramp);
    const rampStripe = box(q, vec2(0.018, 0.058)).mul(ramp);
    const shadow = max(
      max(treeShadow.mul(tree), rockShadow.mul(rock)),
      rampShadow.mul(ramp),
    );
    let color: Node<'vec3'> = vec3(0.14, 0.3, 0.34);
    color = mix(color, vec3(0.1, 0.24, 0.27), shadow.mul(0.28));
    color = mix(color, vec3(0.26, 0.22, 0.17), treeTrunk.mul(tree));
    color = mix(color, vec3(0.08, 0.45, 0.3), treeBody);
    color = mix(color, vec3(0.55, 0.67, 0.68), rockBody);
    color = mix(color, vec3(0.38, 0.5, 0.52), rockFacet);
    color = mix(color, vec3(0.94, 0.99, 1), max(treeSnow.mul(tree), rockSnow));
    color = mix(color, vec3(0.78, 0.09, 0.08), rampBody);
    color = mix(color, vec3(0.98, 0.27, 0.18), rampLip);
    color = mix(color, vec3(0.98, 0.84, 0.65), rampStripe);
    const body = max(max(treeBody, rockBody), rampBody);
    const highlight = max(treeSnow.mul(tree), rockSnow);
    const alpha = max(shadow.mul(0.25), max(max(body, highlight), max(rampLip, rampStripe)));
    const material = new MeshBasicNodeMaterial();
    material.colorNode = color;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    this.mesh = new InstancedMesh(new PlaneGeometry(4, 6), material, FEATURE_CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.position.z = 0.25;
  }

  update(cameraX: number, cameraY: number, viewWidth: number, viewHeight: number): void {
    const margin = FEATURE_CELL_SIZE;
    const minX = Math.floor((cameraX - viewWidth * 0.5 - margin) / FEATURE_CELL_SIZE);
    const maxX = Math.floor((cameraX + viewWidth * 0.5 + margin) / FEATURE_CELL_SIZE);
    const minY = Math.floor((cameraY - viewHeight * 0.5 - margin) / FEATURE_CELL_SIZE);
    const maxY = Math.floor((cameraY + viewHeight * 0.5 + margin) / FEATURE_CELL_SIZE);
    const revision = this.course?.revision ?? 0;
    if (minX !== this.previousMinX || maxX !== this.previousMaxX ||
      minY !== this.previousMinY || maxY !== this.previousMaxY || revision !== this.previousRevision) {
      this.rebuild(minX, maxX, minY, maxY, revision);
    }
    this.mesh.position.x = this.anchorX - cameraX;
    this.mesh.position.y = cameraY - this.anchorY;
  }

  private rebuild(minX: number, maxX: number, minY: number, maxY: number, revision: number): void {
    this.previousRevision = revision;
    this.previousMinX = minX;
    this.previousMaxX = maxX;
    this.previousMinY = minY;
    this.previousMaxY = maxY;
    this.anchorX = minX * FEATURE_CELL_SIZE;
    this.anchorY = minY * FEATURE_CELL_SIZE;
    let instance = 0;
    const sections = new Set([minY, (minY + maxY) / 2, maxY]
      .map((cellY) => this.course?.sectionAt((cellY + 0.5) * FEATURE_CELL_SIZE)));
    for (const section of sections) {
      for (const feature of section?.features ?? []) {
        if (feature.x < this.anchorX || feature.x > (maxX + 1) * FEATURE_CELL_SIZE ||
            feature.y < this.anchorY || feature.y > (maxY + 1) * FEATURE_CELL_SIZE) continue;
        this.writeFeature(instance++, feature);
      }
    }
    for (let cellY = minY; cellY <= maxY && instance < FEATURE_CAPACITY; cellY += 1) {
      for (let cellX = minX; cellX <= maxX && instance < FEATURE_CAPACITY; cellX += 1) {
        this.generation.describeCell(cellX, cellY, this.candidate);
        if (this.candidate.type === 'none') continue;
        this.writeFeature(instance++, this.candidate);
      }
    }
    this.visibleCount = instance;
    this.mesh.count = instance;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.typeAttribute.needsUpdate = true;
  }

  private writeFeature(instance: number, feature: FeatureDescriptor): void {
    this.position.set(feature.x - this.anchorX, this.anchorY - feature.y, 0);
    this.scale.set(feature.scale, feature.scale, 1);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.mesh.setMatrixAt(instance, this.matrix);
    this.typeData[instance * 4] = feature.type === 'tree' ? 1 : feature.type === 'rock' ? 2 : 3;
  }

  get count(): number {
    return this.visibleCount;
  }
}
