import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  dot,
  float,
  length,
  max,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

function ring(point: Node<'vec2'>, center: Node<'vec2'>, radius: Node<'float'>): Node<'float'> {
  return float(1).sub(smoothstep(0.045, 0.1, abs(length(point.sub(center)).sub(radius))));
}

function line(
  point: Node<'vec2'>,
  start: Node<'vec2'>,
  end: Node<'vec2'>,
  width: number,
): Node<'float'> {
  const segment = end.sub(start);
  const projection = dot(point.sub(start), segment).div(max(0.0001, dot(segment, segment)));
  const clamped = projection.clamp(0, 1);
  return float(1).sub(smoothstep(width, width + 0.06, length(point.sub(start.add(segment.mul(clamped))))));
}

export function createCollisionDebugShader() {
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const skierX = uniform(0);
  const skierY = uniform(0);
  const obstacleX = uniform(0);
  const obstacleY = uniform(0);
  const obstacleRadius = uniform(1);
  const contactX = uniform(0);
  const contactY = uniform(0);
  const normalX = uniform(0);
  const normalY = uniform(-1);
  const velocityX = uniform(0);
  const velocityY = uniform(0);
  const point = vec2(uv().x.sub(0.5).mul(viewWidth), float(0.5).sub(uv().y).mul(viewHeight));
  const skier = vec2(skierX, skierY);
  const obstacle = vec2(obstacleX, obstacleY);
  const contact = vec2(contactX, contactY);
  const collisionShapes = max(ring(point, skier, float(0.62)), ring(point, obstacle, obstacleRadius));
  const contactMark = float(1).sub(smoothstep(0.08, 0.16, length(point.sub(contact))));
  const normal = line(point, contact, contact.add(vec2(normalX, normalY).mul(2.2)), 0.06);
  const velocityLength = max(0.001, length(vec2(velocityX, velocityY)));
  const incoming = line(
    point,
    skier,
    skier.add(vec2(velocityX, velocityY).div(velocityLength).mul(3)),
    0.055,
  );
  const alpha = max(collisionShapes.mul(0.85), max(contactMark, max(normal, incoming).mul(0.9)));
  const color = vec3(0.95, 0.12, 0.38)
    .mul(collisionShapes.add(contactMark))
    .add(vec3(0.12, 0.75, 0.95).mul(normal))
    .add(vec3(0.98, 0.7, 0.1).mul(incoming));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return {
    material,
    viewWidth,
    viewHeight,
    skierX,
    skierY,
    obstacleX,
    obstacleY,
    obstacleRadius,
    contactX,
    contactY,
    normalX,
    normalY,
    velocityX,
    velocityY,
  };
}
