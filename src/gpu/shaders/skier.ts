import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { abs, float, length, max, min, mix, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl';

function ellipse(point: Node<'vec2'>, center: Node<'vec2'>, radius: Node<'vec2'>): Node<'float'> {
  return float(1).sub(smoothstep(0.92, 1.02, length(point.sub(center).div(radius))));
}

function box(point: Node<'vec2'>, center: Node<'vec2'>, halfSize: Node<'vec2'>): Node<'float'> {
  const q = abs(point.sub(center)).sub(halfSize);
  const distance = length(max(q, vec2(0))).add(min(max(q.x, q.y), float(0)));
  return float(1).sub(smoothstep(-0.012, 0.012, distance));
}

export interface SkierShader {
  readonly material: MeshBasicNodeMaterial;
  readonly carve: ReturnType<typeof uniform>;
  readonly brake: ReturnType<typeof uniform>;
}

export function createSkierShader(): SkierShader {
  const carve = uniform(0);
  const brake = uniform(0);
  const source = uv().sub(0.5);
  const point = vec2(source.x.add(carve.mul(source.y).mul(0.42)), source.y);

  const shadow = ellipse(point, vec2(0.035, -0.29), vec2(0.25, 0.075));
  const leftSki = box(point, vec2(-0.085, -0.13), vec2(0.024, 0.29));
  const rightSki = box(point, vec2(0.085, -0.13), vec2(0.024, 0.29));
  const torso = ellipse(point, vec2(0, 0.06), vec2(0.18, 0.21));
  const jacket = box(point, vec2(0, 0.035), vec2(0.145, 0.14));
  const head = ellipse(point, vec2(0, 0.285), vec2(0.095, 0.1));
  const goggles = box(point, vec2(carve.mul(0.015), 0.3), vec2(0.088, 0.025));
  const leftArm = box(point, vec2(-0.18, 0.015), vec2(0.045, 0.15));
  const rightArm = box(point, vec2(0.18, 0.015), vec2(0.045, 0.15));
  const brakeSpread = brake.mul(0.055);
  const boots = max(
    box(point, vec2(float(-0.065).sub(brakeSpread), -0.115), vec2(0.065, 0.075)),
    box(point, vec2(float(0.065).add(brakeSpread), -0.115), vec2(0.065, 0.075)),
  );

  let color: Node<'vec3'> = vec3(0.12, 0.29, 0.35);
  color = mix(color, vec3(0.06, 0.17, 0.22), shadow.mul(0.25));
  color = mix(color, vec3(0.94, 0.38, 0.22), max(leftSki, rightSki));
  color = mix(color, vec3(0.08, 0.18, 0.24), boots);
  color = mix(color, vec3(0.98, 0.45, 0.18), max(max(torso, jacket), max(leftArm, rightArm)));
  color = mix(color, vec3(1, 0.78, 0.58), head);
  color = mix(color, vec3(0.08, 0.56, 0.67), goggles);
  const alpha = max(shadow.mul(0.32), max(max(leftSki, rightSki), max(max(torso, head), max(max(leftArm, rightArm), boots))));

  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return { material, carve, brake };
}
