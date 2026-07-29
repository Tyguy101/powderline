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
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

function ellipse(point: Node<'vec2'>, center: Node<'vec2'>, radius: Node<'vec2'>): Node<'float'> {
  return float(1).sub(smoothstep(0.88, 1.02, length(point.sub(center).div(radius))));
}

function capsule(
  point: Node<'vec2'>,
  start: Node<'vec2'>,
  end: Node<'vec2'>,
  radius: Node<'float'> | number,
): Node<'float'> {
  const pointDelta = point.sub(start);
  const segment = end.sub(start);
  const projection = clamp(dot(pointDelta, segment).div(dot(segment, segment)), 0, 1);
  const distance = length(pointDelta.sub(segment.mul(projection))).sub(radius);
  return float(1).sub(smoothstep(-0.012, 0.012, distance));
}

export interface SkierShader {
  readonly material: MeshBasicNodeMaterial;
  readonly lean: ReturnType<typeof uniform>;
  readonly traverse: ReturnType<typeof uniform>;
  readonly crouch: ReturnType<typeof uniform>;
  readonly wedge: ReturnType<typeof uniform>;
  readonly tuck: ReturnType<typeof uniform>;
  readonly air: ReturnType<typeof uniform>;
  readonly landing: ReturnType<typeof uniform>;
  readonly crash: ReturnType<typeof uniform>;
  readonly spray: ReturnType<typeof uniform>;
  readonly stopped: ReturnType<typeof uniform>;
}

export function createSkierShader(): SkierShader {
  const lean = uniform(0);
  const traverse = uniform(0);
  const crouch = uniform(0);
  const wedge = uniform(0);
  const tuck = uniform(0);
  const air = uniform(0);
  const landing = uniform(0);
  const crash = uniform(0);
  const spray = uniform(0);
  const stopped = uniform(0);
  const point = uv().sub(0.5);
  const bodyX = lean.mul(0.085).add(traverse.mul(0.025));
  const bodyY = float(0.075).sub(crouch.mul(0.075)).add(air.mul(0.07));
  const hip = vec2(bodyX, bodyY.sub(0.105));
  const neck = vec2(bodyX.add(lean.mul(0.045)), bodyY.add(float(0.13).sub(crouch.mul(0.035))));
  const headCenter = vec2(
    bodyX.add(lean.mul(0.075)),
    bodyY.add(float(0.245).sub(crouch.mul(0.075))),
  );

  const outsideExtension = lean.mul(0.045);
  const leftBoot = vec2(
    bodyX.sub(0.075).sub(outsideExtension).sub(wedge.mul(0.06)),
    bodyY.sub(float(0.235).add(lean.mul(0.025))).add(air.mul(0.015)),
  );
  const rightBoot = vec2(
    bodyX.add(0.075).sub(outsideExtension).add(wedge.mul(0.06)),
    bodyY.sub(float(0.235).sub(lean.mul(0.025))).add(air.mul(0.015)),
  );
  const leftKnee = vec2(
    mix(bodyX.sub(0.045), leftBoot.x, 0.55).sub(lean.mul(0.025)),
    mix(hip.y, leftBoot.y, 0.5).add(crouch.mul(0.035)),
  );
  const rightKnee = vec2(
    mix(bodyX.add(0.045), rightBoot.x, 0.55).sub(lean.mul(0.025)),
    mix(hip.y, rightBoot.y, 0.5).add(crouch.mul(0.035)),
  );

  // Keep the skis aligned with the skier's downhill travel direction. Turn
  // poses primarily communicate direction through lean, while traversal poses
  // also provide an explicit lateral component.
  const skiHeading = clamp(traverse.add(lean.mul(0.72)), -1, 1);
  const skiDrift = skiHeading.mul(0.24);
  const skiRise = float(0.29).sub(abs(skiHeading).mul(0.105)).add(air.mul(0.025));
  let leftSkiStart: Node<'vec2'> = vec2(
    leftBoot.x.add(skiDrift.mul(0.52)).add(wedge.mul(0.025)).sub(air.mul(0.12)),
    leftBoot.y.sub(skiRise.mul(0.56)),
  );
  let leftSkiEnd: Node<'vec2'> = vec2(
    leftBoot.x.sub(skiDrift.mul(0.48)).sub(wedge.mul(0.07)).add(air.mul(0.055)),
    leftBoot.y.add(skiRise.mul(0.56)),
  );
  let rightSkiStart: Node<'vec2'> = vec2(
    rightBoot.x.add(skiDrift.mul(0.52)).sub(wedge.mul(0.025)).add(air.mul(0.12)),
    rightBoot.y.sub(skiRise.mul(0.56)),
  );
  let rightSkiEnd: Node<'vec2'> = vec2(
    rightBoot.x.sub(skiDrift.mul(0.48)).add(wedge.mul(0.07)).sub(air.mul(0.055)),
    rightBoot.y.add(skiRise.mul(0.56)),
  );
  leftSkiStart = mix(leftSkiStart, vec2(-0.34, -0.17), crash);
  leftSkiEnd = mix(leftSkiEnd, vec2(0.1, -0.05), crash);
  rightSkiStart = mix(rightSkiStart, vec2(-0.12, 0.05), crash);
  rightSkiEnd = mix(rightSkiEnd, vec2(0.35, -0.23), crash);

  const shoulderLeft = vec2(neck.x.sub(0.075), neck.y.sub(0.04));
  const shoulderRight = vec2(neck.x.add(0.075), neck.y.sub(0.04));
  const tuckReach = tuck.mul(0.075);
  let leftHand: Node<'vec2'> = vec2(
    bodyX
      .sub(float(0.175).sub(tuckReach))
      .sub(lean.mul(0.035))
      .sub(air.mul(0.065))
      .sub(landing.mul(0.04)),
    bodyY
      .sub(float(0.015).add(tuck.mul(0.08)))
      .add(landing.mul(0.055))
      .add(air.mul(0.055)),
  );
  let rightHand: Node<'vec2'> = vec2(
    bodyX
      .add(float(0.175).sub(tuckReach))
      .sub(lean.mul(0.035))
      .add(air.mul(0.065))
      .add(landing.mul(0.04)),
    bodyY
      .sub(float(0.015).add(tuck.mul(0.08)))
      .add(landing.mul(0.055))
      .add(air.mul(0.055)),
  );
  leftHand = mix(leftHand, vec2(-0.32, 0.12), crash);
  rightHand = mix(rightHand, vec2(0.29, -0.02), crash);

  // The skier faces downhill toward the bottom of the screen, so poles and
  // spray trail uphill toward the top of the screen.
  const poleTrail = vec2(traverse.mul(-0.08).add(lean.mul(-0.09)), 0.28);
  const leftPoleEnd = mix(leftHand.add(poleTrail).sub(vec2(0.08, 0)), vec2(-0.42, -0.2), crash);
  const rightPoleEnd = mix(rightHand.add(poleTrail).add(vec2(0.08, 0)), vec2(0.4, 0.12), crash);

  const shadowCenter = vec2(lean.mul(-0.03), float(-0.31).sub(air.mul(0.045)));
  const shadow = ellipse(
    point,
    shadowCenter,
    vec2(float(0.25).sub(air.mul(0.06)), float(0.065).sub(air.mul(0.015))),
  );
  const sprayLeft = ellipse(point, leftSkiEnd.add(vec2(-0.035, 0.02)), vec2(0.13, 0.07));
  const sprayRight = ellipse(point, rightSkiEnd.add(vec2(0.035, 0.02)), vec2(0.13, 0.07));
  const sprayMask = max(sprayLeft, sprayRight).mul(spray).mul(float(1).sub(air));

  const leftSki = capsule(point, leftSkiStart, leftSkiEnd, 0.018);
  const rightSki = capsule(point, rightSkiStart, rightSkiEnd, 0.018);
  const leftPole = capsule(point, leftHand, leftPoleEnd, 0.011);
  const rightPole = capsule(point, rightHand, rightPoleEnd, 0.011);
  const leftLeg = max(
    capsule(point, vec2(hip.x.sub(0.038), hip.y), leftKnee, 0.032),
    capsule(point, leftKnee, leftBoot, 0.03),
  );
  const rightLeg = max(
    capsule(point, vec2(hip.x.add(0.038), hip.y), rightKnee, 0.032),
    capsule(point, rightKnee, rightBoot, 0.03),
  );
  const torso = capsule(point, hip, neck, 0.09);
  const leftArm = capsule(point, shoulderLeft, leftHand, 0.032);
  const rightArm = capsule(point, shoulderRight, rightHand, 0.032);
  const helmet = ellipse(point, headCenter, vec2(0.078, 0.086));
  const face = ellipse(point, headCenter.add(vec2(lean.mul(0.012), -0.014)), vec2(0.059, 0.054));
  const goggles = capsule(
    point,
    headCenter.add(vec2(-0.06, 0.005)),
    headCenter.add(vec2(0.06, 0.005)),
    0.018,
  );
  const bootMask = max(
    capsule(point, leftBoot.sub(vec2(0.035, 0)), leftBoot.add(vec2(0.035, 0)), 0.025),
    capsule(point, rightBoot.sub(vec2(0.035, 0)), rightBoot.add(vec2(0.035, 0)), 0.025),
  );

  let color: Node<'vec3'> = vec3(0.12, 0.31, 0.36);
  color = mix(color, vec3(0.07, 0.18, 0.21), shadow.mul(0.32));
  color = mix(color, vec3(0.92, 0.99, 1), sprayMask.mul(0.78));
  color = mix(color, vec3(0.93, 0.25, 0.17), max(leftSki, rightSki));
  color = mix(color, vec3(0.07, 0.19, 0.23), max(leftPole, rightPole));
  color = mix(color, vec3(0.1, 0.23, 0.28), max(max(leftLeg, rightLeg), bootMask));
  color = mix(color, vec3(0.97, 0.42, 0.16), max(torso, max(leftArm, rightArm)));
  color = mix(color, vec3(0.12, 0.58, 0.68), helmet);
  color = mix(color, vec3(0.98, 0.72, 0.48), face);
  color = mix(color, vec3(0.05, 0.16, 0.23), goggles);

  const bodyMask = max(
    max(max(leftSki, rightSki), max(leftPole, rightPole)),
    max(
      max(max(leftLeg, rightLeg), bootMask),
      max(max(torso, max(leftArm, rightArm)), max(helmet, max(face, goggles))),
    ),
  );
  const alpha = max(shadow.mul(0.28), max(sprayMask.mul(0.72), bodyMask));

  const material = new MeshBasicNodeMaterial();
  material.colorNode = color;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  return {
    material,
    lean,
    traverse,
    crouch,
    wedge,
    tuck,
    air,
    landing,
    crash,
    spray,
    stopped,
  };
}
