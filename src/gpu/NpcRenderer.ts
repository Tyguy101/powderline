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
  clamp,
  dot,
  float,
  instanceIndex,
  length,
  max,
  mix,
  sin,
  smoothstep,
  storage,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { MAX_NPCS, type NpcState, type NpcType } from '../simulation/NpcSystem';

function capsule(
  point: Node<'vec2'>,
  start: Node<'vec2'>,
  end: Node<'vec2'>,
  radius: Node<'float'> | number,
): Node<'float'> {
  const segment = end.sub(start);
  const projection = clamp(dot(point.sub(start), segment).div(dot(segment, segment)), 0, 1);
  return float(1).sub(
    smoothstep(-0.012, 0.012, length(point.sub(start).sub(segment.mul(projection))).sub(radius)),
  );
}

function ellipse(
  point: Node<'vec2'>,
  center: Node<'vec2'>,
  radius: Node<'vec2'>,
): Node<'float'> {
  return float(1).sub(smoothstep(0.88, 1.02, length(point.sub(center).div(radius))));
}

function typeMask(type: Node<'float'>, expected: number): Node<'float'> {
  return float(1).sub(smoothstep(0.08, 0.22, abs(type.sub(expected))));
}

function typeIndex(type: NpcType): number {
  return type === 'speed-skier' ? 0 : type === 'beginner-skier' ? 1 : 2;
}

function paletteColor(index: Node<'float'>): Node<'vec3'> {
  let color: Node<'vec3'> = vec3(0.9, 0.16, 0.13);
  color = mix(color, vec3(1, 0.43, 0.08), typeMask(index, 1));
  color = mix(color, vec3(0.98, 0.75, 0.08), typeMask(index, 2));
  color = mix(color, vec3(0.04, 0.65, 0.53), typeMask(index, 3));
  color = mix(color, vec3(0.12, 0.38, 0.9), typeMask(index, 4));
  color = mix(color, vec3(0.61, 0.2, 0.82), typeMask(index, 5));
  return color;
}

export class NpcRenderer {
  readonly mesh: InstancedMesh;
  private readonly poseData = new Float32Array(MAX_NPCS * 4);
  private readonly motionData = new Float32Array(MAX_NPCS * 4);
  private readonly clothingData = new Float32Array(MAX_NPCS * 4);
  private readonly poseAttribute: StorageInstancedBufferAttribute;
  private readonly motionAttribute: StorageInstancedBufferAttribute;
  private readonly clothingAttribute: StorageInstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly axis = new Vector3(0, 0, 1);

  constructor() {
    this.poseAttribute = new StorageInstancedBufferAttribute(this.poseData, 4);
    this.motionAttribute = new StorageInstancedBufferAttribute(this.motionData, 4);
    this.clothingAttribute = new StorageInstancedBufferAttribute(this.clothingData, 4);
    this.poseAttribute.setUsage(DynamicDrawUsage);
    this.motionAttribute.setUsage(DynamicDrawUsage);
    this.clothingAttribute.setUsage(DynamicDrawUsage);
    const pose = varying(
      storage(this.poseAttribute, 'vec4', MAX_NPCS).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const motion = varying(
      storage(this.motionAttribute, 'vec4', MAX_NPCS).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const clothing = varying(
      storage(this.clothingAttribute, 'vec4', MAX_NPCS).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const p = uv().sub(0.5);
    const speedMask = typeMask(pose.x, 0);
    const beginnerMask = typeMask(pose.x, 1);
    const boarderMask = typeMask(pose.x, 2);
    const skierMask = max(speedMask, beginnerMask);
    const carve = pose.y;
    const fall = pose.z;
    const recovery = pose.w;
    const compression = motion.x;
    const traverse = motion.y;
    const fallKind = motion.z;
    const airborne = motion.w;
    const fallCurl = sin(fall.mul(3.14159)).mul(float(1).sub(recovery.mul(0.4)));
    const stumbleFall = typeMask(fallKind, 1).mul(fallCurl);
    const spinFall = typeMask(fallKind, 2).mul(fallCurl);
    const tumbleFall = typeMask(fallKind, 3).mul(fallCurl);
    const fullFall = max(stumbleFall, max(spinFall, tumbleFall));
    const upright = beginnerMask;
    const lean = carve.mul(mix(0.09, 0.052, upright))
      .add(traverse.mul(0.035))
      .add(stumbleFall.mul(0.06));
    const baseHip = vec2(
      lean,
      float(-0.01).sub(boarderMask.mul(0.03)).sub(compression.mul(0.055)),
    );
    const baseChest = vec2(
      lean.mul(float(1.38).add(boarderMask.mul(0.14))),
      float(0.115).add(upright.mul(0.035)).sub(compression.mul(0.09)),
    );
    const baseHead = vec2(
      lean.mul(1.62),
      float(0.225).add(upright.mul(0.05)).sub(compression.mul(0.12)),
    );
    const fallDirection = mix(-1, 1, typeMask(fallKind, 2));
    const fallHip = vec2(fallDirection.mul(-0.08), -0.085);
    const fallChest = vec2(fallDirection.mul(0.105), -0.015);
    const fallHead = vec2(fallDirection.mul(0.245), -0.035);
    const hip = mix(baseHip, fallHip, fullFall);
    const chest = mix(baseChest, fallChest, fullFall);
    const head = mix(baseHead, fallHead, fullFall);
    const bootSpread = speedMask.mul(0.052).add(beginnerMask.mul(0.12)).add(boarderMask.mul(0.105));
    const outside = carve.mul(0.075);
    const baseLeftBoot = vec2(
      lean.sub(bootSpread).sub(max(0, outside)),
      float(-0.205).add(max(0, carve).mul(0.035)),
    );
    const baseRightBoot = vec2(
      lean.add(bootSpread).sub(max(0, outside.mul(-1))),
      float(-0.205).add(max(0, carve.mul(-1)).mul(0.035)),
    );
    const leftBoot = mix(baseLeftBoot, vec2(-0.22, -0.03), fullFall);
    const rightBoot = mix(baseRightBoot, vec2(0.11, 0.16), fullFall);
    const body = capsule(p, hip, chest, float(0.082).add(upright.mul(0.016)).add(boarderMask.mul(0.008)));
    const helmet = ellipse(p, head, vec2(0.074, 0.08));
    const goggles = capsule(p, head.add(vec2(-0.055, -0.008)), head.add(vec2(0.055, -0.008)), 0.019);
    const leftKnee = mix(
      hip.sub(vec2(0.025, 0)),
      leftBoot,
      0.52,
    ).add(vec2(carve.mul(-0.035), float(0.025).add(compression.mul(0.055))));
    const rightKnee = mix(
      hip.add(vec2(0.025, 0)),
      rightBoot,
      0.52,
    ).add(vec2(carve.mul(-0.035), float(0.025).add(compression.mul(0.055))));
    const legs = max(
      max(
        capsule(p, hip.sub(vec2(0.027, 0)), leftKnee, float(0.034).add(upright.mul(0.007))),
        capsule(p, leftKnee, leftBoot, 0.032),
      ),
      max(
        capsule(p, hip.add(vec2(0.027, 0)), rightKnee, float(0.034).add(upright.mul(0.007))),
        capsule(p, rightKnee, rightBoot, 0.032),
      ),
    );
    const handWidth = speedMask.mul(0.13).add(beginnerMask.mul(0.22)).add(boarderMask.mul(0.235));
    const airSpread = airborne.mul(0.07);
    const baseLeftHand = vec2(
      handWidth.mul(-1).sub(airSpread),
      float(0.02).add(upright.mul(0.055)).add(airborne.mul(0.09)),
    );
    const baseRightHand = vec2(
      handWidth.add(airSpread),
      float(0.02).add(upright.mul(0.055)).add(boarderMask.mul(0.075)).add(airborne.mul(0.09)),
    );
    const leftHand = mix(baseLeftHand, vec2(-0.29, 0.13), fullFall);
    const rightHand = mix(baseRightHand, vec2(0.28, -0.13), fullFall);
    const leftElbow = mix(chest.sub(vec2(0.035, 0)), leftHand, 0.52)
      .add(vec2(-0.025, compression.mul(0.025)));
    const rightElbow = mix(chest.add(vec2(0.035, 0)), rightHand, 0.52)
      .add(vec2(0.025, compression.mul(0.025)));
    const arms = max(
      max(
        capsule(p, chest.sub(vec2(0.04, 0)), leftElbow, 0.03),
        capsule(p, leftElbow, leftHand, 0.027),
      ),
      max(
        capsule(p, chest.add(vec2(0.04, 0)), rightElbow, 0.03),
        capsule(p, rightElbow, rightHand, 0.027),
      ),
    );
    const skiHeading = carve.mul(0.1);
    const wedge = beginnerMask.mul(0.13);
    const skis = max(
      capsule(p, leftBoot.sub(vec2(wedge, 0.14)), leftBoot.add(vec2(float(0.1).add(wedge).add(skiHeading), 0.17)), 0.02),
      capsule(p, rightBoot.add(vec2(wedge, -0.14)), rightBoot.add(vec2(float(-0.1).sub(wedge).add(skiHeading), 0.17)), 0.02),
    ).mul(skierMask);
    const snowboard = capsule(p, vec2(-0.3, -0.27), vec2(0.3, -0.245), 0.033).mul(boarderMask);
    const poles = max(
      capsule(p, leftHand, vec2(-0.28, -0.3), 0.01),
      capsule(p, rightHand, vec2(0.28, -0.3), 0.01),
    ).mul(skierMask);
    const equipment = max(max(skis, snowboard), poles);
    const shadow = ellipse(p, vec2(0, -0.31), vec2(float(0.22).add(abs(carve).mul(0.05)), 0.035))
      .mul(float(1).sub(clamp(airborne, 0, 1)));
    const powder = ellipse(
      p,
      vec2(carve.mul(-0.16), -0.29),
      vec2(float(0.09).add(abs(carve).mul(0.09)), 0.055),
    ).mul(abs(carve).mul(0.65));

    const hatColor = paletteColor(clothing.x);
    const topColor = paletteColor(clothing.y);
    const bottomColor = paletteColor(clothing.z);
    const accessoryColor = paletteColor(clothing.w);
    let color: Node<'vec3'> = vec3(0.12, 0.24, 0.27);
    color = mix(color, vec3(0.83, 0.91, 0.94), shadow.mul(0.22));
    color = mix(color, bottomColor, legs);
    color = mix(color, topColor, max(body, arms));
    color = mix(color, hatColor, helmet);
    color = mix(color, vec3(0.1, 0.13, 0.15), equipment);
    color = mix(
      color,
      mix(vec3(0.11, 0.69, 0.84), accessoryColor, boarderMask),
      goggles,
    );
    color = mix(color, vec3(0.97, 0.995, 1), powder);
    const shape = max(max(body, helmet), max(legs, arms));
    const alpha = max(max(shape, equipment), max(goggles, max(shadow.mul(0.24), powder.mul(0.74))));
    const material = new MeshBasicNodeMaterial();
    material.colorNode = color;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    this.mesh = new InstancedMesh(new PlaneGeometry(3.7, 4.5), material, MAX_NPCS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.position.z = 0.44;
  }

  update(states: readonly Readonly<NpcState>[], cameraX: number, cameraY: number): void {
    for (let index = 0; index < MAX_NPCS; index += 1) {
      const npc = states[index]!;
      const offset = index * 4;
      this.poseData[offset] = typeIndex(npc.type);
      this.poseData[offset + 1] = npc.carve;
      this.poseData[offset + 2] = npc.fall === 'none'
        ? 0
        : Math.min(1, npc.fallTime / Math.max(0.01, npc.fallDuration));
      this.poseData[offset + 3] = npc.recovery;
      this.motionData[offset] = npc.compression;
      this.motionData[offset + 1] = npc.traverse;
      this.motionData[offset + 2] =
        npc.fall === 'stumble' ? 1 : npc.fall === 'spin' ? 2 : npc.fall === 'tumble' ? 3 : 0;
      this.motionData[offset + 3] = npc.airborne;
      this.clothingData[offset] = npc.hatColor;
      this.clothingData[offset + 1] = npc.topColor;
      this.clothingData[offset + 2] = npc.bottomColor;
      this.clothingData[offset + 3] = npc.accessoryColor;
      this.position.set(npc.x - cameraX, cameraY - npc.y - npc.airborne * 1.25, 0);
      const fallRotation = npc.fall === 'spin'
        ? npc.fallTime * 5.2
        : npc.fall === 'tumble'
          ? npc.fallTime * 3.6
          : npc.facing * 0.1;
      this.rotation.setFromAxisAngle(this.axis, fallRotation);
      const visible = npc.active ? 1 : 0;
      this.scale.set(visible, visible, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.poseAttribute.needsUpdate = true;
    this.motionAttribute.needsUpdate = true;
    this.clothingAttribute.needsUpdate = true;
  }
}
