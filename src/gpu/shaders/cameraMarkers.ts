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
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

function ellipse(point: Node<'vec2'>, radius: Node<'vec2'>): Node<'float'> {
  return float(1).sub(smoothstep(0.88, 1.04, length(point.div(radius))));
}

function box(point: Node<'vec2'>, halfSize: Node<'vec2'>): Node<'float'> {
  const distance = max(abs(point.x).sub(halfSize.x), abs(point.y).sub(halfSize.y));
  return float(1).sub(smoothstep(-0.018, 0.018, distance));
}

export interface CameraMarkerShader {
  readonly material: MeshBasicNodeMaterial;
  readonly worldX: ReturnType<typeof uniform>;
  readonly worldY: ReturnType<typeof uniform>;
  readonly viewWidth: ReturnType<typeof uniform>;
  readonly viewHeight: ReturnType<typeof uniform>;
}

export function createCameraMarkerShader(seed: number): CameraMarkerShader {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const p = uv();
  const wx = p.x.sub(0.5).mul(viewWidth).add(worldX);
  const wy = float(0.5).sub(p.y).mul(viewHeight).add(worldY);
  const cell = vec2(floor(wx.div(12)), floor(wy.div(12)));
  const local = vec2(fract(wx.div(12)).sub(0.5), fract(wy.div(12)).sub(0.5));
  const random = fract(sin(cell.x.mul(12.9898).add(cell.y.mul(78.233)).add(seed)).mul(43758.547));

  const treeChoice = step(0.84, random);
  const rockChoice = step(0.74, random).mul(float(1).sub(treeChoice));
  const gateChoice = step(0.68, random).mul(float(1).sub(max(treeChoice, rockChoice)));

  const treeTrunk = box(local.sub(vec2(0, -0.06)), vec2(0.016, 0.08));
  const treeCrownLower = ellipse(local.sub(vec2(0, 0.01)), vec2(0.1, 0.13));
  const treeCrownUpper = ellipse(local.sub(vec2(0, 0.11)), vec2(0.07, 0.1));
  const tree = max(treeTrunk, max(treeCrownLower, treeCrownUpper)).mul(treeChoice);
  const rock = ellipse(local.sub(vec2(0, -0.08)), vec2(0.1, 0.06)).mul(rockChoice);
  const gatePoles = max(
    box(local.sub(vec2(-0.11, -0.01)), vec2(0.012, 0.14)),
    box(local.sub(vec2(0.11, -0.01)), vec2(0.012, 0.14)),
  );
  const gateFlag = box(local.sub(vec2(0, 0.07)), vec2(0.11, 0.022));
  const gate = max(gatePoles, gateFlag).mul(gateChoice);

  const contourDistance = abs(fract(wy.div(50)).sub(0.5));
  const contour = smoothstep(0.485, 0.498, contourDistance)
    .mul(float(1).sub(smoothstep(0.08, 0.1, abs(fract(wx.div(8)).sub(0.5)))));

  let color: Node<'vec3'> = vec3(0.19, 0.47, 0.48);
  color = mix(color, vec3(0.13, 0.53, 0.36), tree);
  color = mix(color, vec3(0.38, 0.46, 0.49), rock);
  color = mix(color, vec3(0.9, 0.3, 0.18), gate);
  color = mix(color, vec3(0.22, 0.54, 0.58), contour.mul(0.35));
  const alpha = max(contour.mul(0.18), max(tree, max(rock, gate))).mul(0.82);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
