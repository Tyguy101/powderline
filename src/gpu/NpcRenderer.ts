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

export class NpcRenderer {
  readonly mesh: InstancedMesh;
  private readonly poseData = new Float32Array(MAX_NPCS * 4);
  private readonly colorData = new Float32Array(MAX_NPCS * 4);
  private readonly poseAttribute: StorageInstancedBufferAttribute;
  private readonly colorAttribute: StorageInstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly axis = new Vector3(0, 0, 1);

  constructor() {
    this.poseAttribute = new StorageInstancedBufferAttribute(this.poseData, 4);
    this.colorAttribute = new StorageInstancedBufferAttribute(this.colorData, 4);
    this.poseAttribute.setUsage(DynamicDrawUsage);
    this.colorAttribute.setUsage(DynamicDrawUsage);
    const pose = varying(
      storage(this.poseAttribute, 'vec4', MAX_NPCS).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const colors = varying(
      storage(this.colorAttribute, 'vec4', MAX_NPCS).toReadOnly().element(instanceIndex),
    ) as Node<'vec4'>;
    const p = uv().sub(0.5);
    const speedMask = typeMask(pose.x, 0);
    const beginnerMask = typeMask(pose.x, 1);
    const boarderMask = typeMask(pose.x, 2);
    const skierMask = max(speedMask, beginnerMask);
    const carve = pose.y;
    const fall = pose.z;
    const recovery = pose.w;
    const fallCurl = sin(fall.mul(3.14159)).mul(float(1).sub(recovery.mul(0.4)));
    const upright = beginnerMask;
    const lean = carve.mul(mix(0.075, 0.045, upright)).add(fallCurl.mul(0.11));
    const hip = vec2(lean, float(-0.01).sub(boarderMask.mul(0.03)));
    const chest = vec2(
      lean.mul(float(1.38).add(boarderMask.mul(0.14))),
      float(0.115).add(upright.mul(0.035)).sub(abs(carve).mul(0.03)),
    );
    const head = vec2(lean.mul(1.58), float(0.225).add(upright.mul(0.05)));
    const bootSpread = speedMask.mul(0.052).add(beginnerMask.mul(0.12)).add(boarderMask.mul(0.105));
    const leftBoot = vec2(lean.sub(bootSpread), -0.205);
    const rightBoot = vec2(lean.add(bootSpread), -0.205);
    const body = capsule(p, hip, chest, float(0.082).add(upright.mul(0.016)).add(boarderMask.mul(0.008)));
    const helmet = ellipse(p, head, vec2(0.074, 0.08));
    const goggles = capsule(p, head.add(vec2(-0.055, -0.008)), head.add(vec2(0.055, -0.008)), 0.019);
    const legs = max(
      capsule(p, hip.sub(vec2(0.027, 0)), leftBoot, float(0.033).add(upright.mul(0.007))),
      capsule(p, hip.add(vec2(0.027, 0)), rightBoot, float(0.033).add(upright.mul(0.007))),
    );
    const handWidth = speedMask.mul(0.13).add(beginnerMask.mul(0.22)).add(boarderMask.mul(0.235));
    const leftHand = vec2(handWidth.mul(-1), float(0.02).add(upright.mul(0.055)));
    const rightHand = vec2(handWidth, float(0.02).add(upright.mul(0.055)).add(boarderMask.mul(0.075)));
    const arms = max(
      capsule(p, chest.sub(vec2(0.04, 0)), leftHand, 0.029),
      capsule(p, chest.add(vec2(0.04, 0)), rightHand, 0.029),
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
    const shape = max(max(body, helmet), max(legs, arms));
    const equipment = max(max(skis, snowboard), poles);
    const shadow = ellipse(p, vec2(0, -0.31), vec2(float(0.22).add(abs(carve).mul(0.05)), 0.035))
      .mul(float(1).sub(clamp(colors.w, 0, 1)));
    const powder = ellipse(
      p,
      vec2(carve.mul(-0.16), -0.29),
      vec2(float(0.09).add(abs(carve).mul(0.09)), 0.055),
    ).mul(abs(carve).mul(0.65));

    let color: Node<'vec3'> = vec3(0.12, 0.24, 0.27);
    color = mix(color, vec3(0.83, 0.91, 0.94), shadow.mul(0.22));
    color = mix(color, vec3(colors.x, colors.y, colors.z), shape);
    color = mix(color, vec3(0.1, 0.13, 0.15), equipment);
    color = mix(color, vec3(0.11, 0.69, 0.84), goggles);
    color = mix(color, vec3(0.97, 0.995, 1), powder);
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
      const palette = typeIndex(npc.type);
      this.colorData[offset] = palette === 0 ? 0.84 : palette === 1 ? 0.98 : 0.19;
      this.colorData[offset + 1] = palette === 0 ? 0.17 : palette === 1 ? 0.56 : 0.38;
      this.colorData[offset + 2] = palette === 0 ? 0.14 : palette === 1 ? 0.12 : 0.82;
      this.colorData[offset + 3] = npc.airborne;
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
    this.colorAttribute.needsUpdate = true;
  }
}
