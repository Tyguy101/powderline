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
  readonly crashStyle: ReturnType<typeof uniform>;
  readonly equipmentSpread: ReturnType<typeof uniform>;
  readonly snowBurst: ReturnType<typeof uniform>;
  readonly facePlant: ReturnType<typeof uniform>;
  readonly treeStick: ReturnType<typeof uniform>;
  readonly sideWipeout: ReturnType<typeof uniform>;
  readonly tumbleCurl: ReturnType<typeof uniform>;
  readonly skiLift: ReturnType<typeof uniform>;
  readonly armSpread: ReturnType<typeof uniform>;
  readonly slideTrail: ReturnType<typeof uniform>;
  readonly slideSpray: ReturnType<typeof uniform>;
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
  const crashStyle = uniform(0);
  const equipmentSpread = uniform(0);
  const snowBurst = uniform(0);
  const facePlant = uniform(0);
  const treeStick = uniform(0);
  const sideWipeout = uniform(0);
  const tumbleCurl = uniform(0);
  const skiLift = uniform(0);
  const armSpread = uniform(0);
  const slideTrail = uniform(0);
  const slideSpray = uniform(0);
  const point = uv().sub(0.5);
  const bodyX = lean.mul(0.085).add(traverse.mul(0.025));
  const bodyY = float(0.075).sub(crouch.mul(0.075)).add(air.mul(0.07));
  let hip: Node<'vec2'> = vec2(bodyX, bodyY.sub(0.105));
  let neck: Node<'vec2'> = vec2(bodyX.add(lean.mul(0.045)), bodyY.add(float(0.13).sub(crouch.mul(0.035))));
  let headCenter: Node<'vec2'> = vec2(
    bodyX.add(lean.mul(0.075)),
    bodyY.add(float(0.245).sub(crouch.mul(0.075))),
  );
  // Authored crash silhouettes. Sequential mixes let impact families blend
  // smoothly from the exact skiing pose present on the collision frame.
  hip = mix(hip, vec2(0, 0.045), facePlant);
  neck = mix(neck, vec2(0, -0.075), facePlant);
  headCenter = mix(headCenter, vec2(0, -0.19), facePlant);
  hip = mix(hip, vec2(-0.015, -0.015), treeStick);
  neck = mix(neck, vec2(0.005, 0.12), treeStick);
  headCenter = mix(headCenter, vec2(0.015, 0.245), treeStick);
  hip = mix(hip, vec2(-0.045, -0.015), sideWipeout);
  neck = mix(neck, vec2(0.105, 0.025), sideWipeout);
  headCenter = mix(headCenter, vec2(0.235, 0.03), sideWipeout);
  hip = mix(hip, vec2(0, -0.02), tumbleCurl);
  neck = mix(neck, vec2(0.075, 0.055), tumbleCurl);
  headCenter = mix(headCenter, vec2(0.14, 0.115), tumbleCurl);

  const outsideExtension = lean.mul(0.045);
  let leftBoot: Node<'vec2'> = vec2(
    bodyX.sub(0.075).sub(outsideExtension).sub(wedge.mul(0.06)),
    bodyY.sub(float(0.235).add(lean.mul(0.025))).add(air.mul(0.015)),
  );
  let rightBoot: Node<'vec2'> = vec2(
    bodyX.add(0.075).sub(outsideExtension).add(wedge.mul(0.06)),
    bodyY.sub(float(0.235).sub(lean.mul(0.025))).add(air.mul(0.015)),
  );
  leftBoot = mix(leftBoot, vec2(-0.17, float(0.2).add(skiLift.mul(0.12))), facePlant);
  rightBoot = mix(rightBoot, vec2(0.055, float(0.16).add(skiLift.mul(0.08))), facePlant);
  leftBoot = mix(leftBoot, vec2(-0.27, -0.095), treeStick);
  rightBoot = mix(rightBoot, vec2(0.27, -0.095), treeStick);
  leftBoot = mix(leftBoot, vec2(-0.2, -0.055), sideWipeout);
  rightBoot = mix(rightBoot, vec2(-0.08, 0.085), sideWipeout);
  leftBoot = mix(leftBoot, vec2(-0.13, -0.03), tumbleCurl);
  rightBoot = mix(rightBoot, vec2(-0.04, 0.11), tumbleCurl);
  let leftKnee: Node<'vec2'> = vec2(
    mix(bodyX.sub(0.045), leftBoot.x, 0.55).sub(lean.mul(0.025)),
    mix(hip.y, leftBoot.y, 0.5).add(crouch.mul(0.035)),
  );
  let rightKnee: Node<'vec2'> = vec2(
    mix(bodyX.add(0.045), rightBoot.x, 0.55).sub(lean.mul(0.025)),
    mix(hip.y, rightBoot.y, 0.5).add(crouch.mul(0.035)),
  );
  leftKnee = mix(leftKnee, vec2(-0.085, 0.085), facePlant);
  rightKnee = mix(rightKnee, vec2(0.105, 0.07), facePlant);
  leftKnee = mix(leftKnee, vec2(-0.14, -0.055), treeStick);
  rightKnee = mix(rightKnee, vec2(0.14, -0.055), treeStick);
  leftKnee = mix(leftKnee, vec2(-0.1, 0.015), sideWipeout);
  rightKnee = mix(rightKnee, vec2(0.015, 0.04), sideWipeout);
  leftKnee = mix(leftKnee, vec2(-0.05, 0.055), tumbleCurl);
  rightKnee = mix(rightKnee, vec2(0.03, 0.08), tumbleCurl);

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
  const spread = equipmentSpread.mul(0.18);
  leftSkiStart = mix(leftSkiStart, vec2(leftBoot.x.sub(0.03), leftBoot.y.sub(0.2)), crash);
  leftSkiEnd = mix(leftSkiEnd, vec2(leftBoot.x.add(spread.mul(-0.4)), leftBoot.y.add(0.18)), crash);
  rightSkiStart = mix(rightSkiStart, vec2(rightBoot.x.add(0.03), rightBoot.y.sub(0.2)), crash);
  rightSkiEnd = mix(rightSkiEnd, vec2(rightBoot.x.add(spread.mul(0.4)), rightBoot.y.add(0.18)), crash);
  leftSkiStart = mix(leftSkiStart, vec2(-0.31, -0.1), treeStick);
  leftSkiEnd = mix(leftSkiEnd, vec2(-0.2, 0.1), treeStick);
  rightSkiStart = mix(rightSkiStart, vec2(0.31, -0.1), treeStick);
  rightSkiEnd = mix(rightSkiEnd, vec2(0.2, 0.1), treeStick);
  // Face-plants finish with one leg kicked out and the skis crossed in the air.
  leftSkiStart = mix(leftSkiStart, vec2(-0.29, 0.37), facePlant);
  leftSkiEnd = mix(leftSkiEnd, vec2(0.07, 0.08), facePlant);
  rightSkiStart = mix(rightSkiStart, vec2(0.15, 0.34), facePlant);
  rightSkiEnd = mix(rightSkiEnd, vec2(-0.08, 0.055), facePlant);

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
  leftHand = mix(leftHand, vec2(float(-0.22).sub(armSpread.mul(0.1)), -0.04), crash);
  rightHand = mix(rightHand, vec2(float(0.22).add(armSpread.mul(0.1)), -0.04), crash);
  leftHand = mix(leftHand, vec2(-0.34, 0.085), treeStick);
  rightHand = mix(rightHand, vec2(0.34, 0.085), treeStick);
  leftHand = mix(leftHand, vec2(-0.05, -0.18), facePlant);
  rightHand = mix(rightHand, vec2(0.05, -0.18), facePlant);
  leftHand = mix(leftHand, vec2(0.04, -0.12), tumbleCurl);
  rightHand = mix(rightHand, vec2(0.15, -0.04), tumbleCurl);

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
  const crashCloud = ellipse(point, vec2(0, -0.08), vec2(0.34, 0.19)).mul(snowBurst);
  const slideCloudLeft = ellipse(point, vec2(-0.25, 0.03), vec2(0.22, 0.12)).mul(slideSpray);
  const slideCloudRight = ellipse(point, vec2(0.25, 0.08), vec2(0.2, 0.1)).mul(slideSpray);
  const sprayMask = max(
    max(max(sprayLeft, sprayRight).mul(spray).mul(float(1).sub(air)), crashCloud),
    max(slideCloudLeft, slideCloudRight),
  );
  const slideGroove = capsule(point, vec2(0, 0.02), vec2(0, 0.48), 0.055).mul(slideTrail);
  const slideRidgeLeft = capsule(point, vec2(-0.075, 0.04), vec2(-0.1, 0.45), 0.022).mul(slideTrail);
  const slideRidgeRight = capsule(point, vec2(0.075, 0.04), vec2(0.1, 0.45), 0.022).mul(slideTrail);
  const slideRidges = max(slideRidgeLeft, slideRidgeRight);

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
  color = mix(color, vec3(0.3, 0.53, 0.58), slideGroove.mul(0.34));
  color = mix(color, vec3(0.93, 0.99, 1), slideRidges.mul(0.88));
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
  const alpha = max(
    max(slideGroove.mul(0.32), slideRidges.mul(0.74)),
    max(shadow.mul(0.28), max(sprayMask.mul(0.72), bodyMask)),
  );

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
    crashStyle,
    equipmentSpread,
    snowBurst,
    facePlant,
    treeStick,
    sideWipeout,
    tumbleCurl,
    skiLift,
    armSpread,
    slideTrail,
    slideSpray,
  };
}
