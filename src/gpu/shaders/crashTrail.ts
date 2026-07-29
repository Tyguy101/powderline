import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  clamp,
  dot,
  float,
  length,
  max,
  mix,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

function segmentCoordinates(
  point: Node<'vec2'>,
  start: Node<'vec2'>,
  end: Node<'vec2'>,
): { distance: Node<'float'>; along: Node<'float'>; closest: Node<'vec2'> } {
  const segment = end.sub(start);
  const denominator = max(0.001, dot(segment, segment));
  const along = clamp(dot(point.sub(start), segment).div(denominator), 0, 1);
  const closest = start.add(segment.mul(along));
  return { distance: length(point.sub(closest)), along, closest };
}

function disc(
  point: Node<'vec2'>,
  center: Node<'vec2'>,
  radius: Node<'float'>,
): Node<'float'> {
  return float(1).sub(smoothstep(radius.mul(0.82), radius, length(point.sub(center))));
}

export function createCrashTrailShader() {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const startX = uniform(0);
  const startY = uniform(0);
  const endX = uniform(0);
  const endY = uniform(0);
  const intensity = uniform(0);
  const family = uniform(0);
  const p = uv();
  const point = vec2(
    p.x.sub(0.5).mul(viewWidth).add(worldX),
    float(0.5).sub(p.y).mul(viewHeight).add(worldY),
  );
  const start = vec2(startX, startY);
  const end = vec2(endX, endY);
  const segment = segmentCoordinates(point, start, end);
  const width = float(0.72).add(intensity.mul(0.42));
  const edgeRipple = sin(segment.along.mul(29).add(family.mul(2.3))).mul(0.12).add(0.88);
  const localWidth = width.mul(edgeRipple);
  const fade = smoothstep(0, 0.18, segment.along).mul(
    float(1).sub(smoothstep(0.88, 1, segment.along)),
  );
  const groove = float(1)
    .sub(smoothstep(localWidth.mul(0.52), localWidth, segment.distance))
    .mul(fade);
  const bermDistance = abs(segment.distance.sub(localWidth.mul(1.12)));
  const berms = float(1)
    .sub(smoothstep(0.06, 0.16, bermDistance))
    .mul(fade)
    .mul(float(0.58).add(intensity.mul(0.42)));

  const impactRadius = float(0.45).add(intensity.mul(0.5));
  const crater = disc(point, start, impactRadius);
  const craterRim = float(1).sub(
    smoothstep(0.07, 0.17, abs(length(point.sub(start)).sub(impactRadius))),
  );

  let color: Node<'vec3'> = vec3(0.35, 0.57, 0.62);
  color = mix(color, vec3(0.13, 0.38, 0.46), max(groove.mul(0.86), crater.mul(0.58)));
  color = mix(color, vec3(0.77, 0.94, 0.98), max(berms, craterRim.mul(0.94)));
  const alpha = max(
    max(groove.mul(0.72), berms.mul(0.96)),
    max(crater.mul(0.64), craterRim.mul(0.92)),
  ).mul(intensity);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return {
    material,
    worldX,
    worldY,
    viewWidth,
    viewHeight,
    startX,
    startY,
    endX,
    endY,
    intensity,
    family,
  };
}
