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
  float,
  instanceIndex,
  length,
  max,
  mix,
  sin,
  smoothstep,
  storage,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import type { SkiState } from '../simulation/SkiPhysics';

const TRAIL_CAPACITY = 384;
const MIN_SAMPLE_DISTANCE = 0.28;

function band(value: Node<'float'>, center: number, width: Node<'float'>): Node<'float'> {
  return float(1).sub(smoothstep(width.mul(0.55), width, abs(value.sub(center))));
}

export class TrackTrailBuffer {
  readonly mesh: InstancedMesh;
  private readonly styleData = new Float32Array(TRAIL_CAPACITY * 4);
  private readonly styleAttribute: StorageInstancedBufferAttribute;
  private readonly currentTime = uniform(0);
  private readonly instanceMatrix = new Matrix4();
  private readonly instancePosition = new Vector3();
  private readonly instanceRotation = new Quaternion();
  private readonly instanceScale = new Vector3();
  private readonly rotationAxis = new Vector3(0, 0, 1);
  private writeIndex = 0;
  private elapsed = 0;
  private previousX = 0;
  private previousY = 0;
  private hasPrevious = false;
  private landingWasActive = false;
  private samples = 0;

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    this.styleAttribute = new StorageInstancedBufferAttribute(this.styleData, 4);
    this.styleAttribute.setUsage(DynamicDrawUsage);

    const styleStorage = storage(this.styleAttribute, 'vec4', TRAIL_CAPACITY)
      .toReadOnly()
      .element(instanceIndex) as Node<'vec4'>;
    // Carry per-instance style data out of the vertex stage. Reading
    // instanceIndex-backed storage directly in the fragment stage is not
    // portable across WebGPU implementations.
    const style = varying(styleStorage) as Node<'vec4'>;

    const age = max(0, this.currentTime.sub(style.y));
    const validity = style.w;
    const trackFade = clamp(float(1).sub(age.div(13)), 0, 1).mul(validity);
    const sprayFade = clamp(float(1).sub(age.div(1.15)), 0, 1).mul(validity);
    const p = uv();
    const grooveWidth = float(0.065).add(style.x.mul(0.018));
    const leftGroove = band(p.x, 0.3, grooveWidth);
    const rightGroove = band(p.x, 0.7, grooveWidth);
    const grooves = max(leftGroove, rightGroove)
      .mul(float(0.38).add(style.x.mul(0.62)))
      .mul(trackFade);
    const leftShoulder = band(p.x, 0.19, float(0.095));
    const rightShoulder = band(p.x, 0.81, float(0.095));
    const displacedSnow = max(leftShoulder, rightShoulder)
      .mul(float(0.25).add(style.x.mul(0.6)))
      .mul(trackFade);
    const flutter = sin(p.y.mul(38).add(style.y.mul(7))).mul(0.055);
    const sprayLeft = float(1).sub(
      smoothstep(0.12, 0.3, length(p.sub(vec2(float(0.18).add(flutter), 0.54)))),
    );
    const sprayRight = float(1).sub(
      smoothstep(0.1, 0.27, length(p.sub(vec2(float(0.82).sub(flutter), 0.48)))),
    );
    const carveSpray = max(sprayLeft, sprayRight)
      .mul(style.x)
      .mul(style.x)
      .mul(sprayFade);
    const landingDistance = length(p.sub(0.5));
    const landingCore = float(1).sub(smoothstep(0.05, 0.32, landingDistance));
    const landingRing = float(1).sub(
      smoothstep(0.035, 0.1, abs(landingDistance.sub(0.34))),
    );
    const landingBurst = max(landingCore.mul(0.45), landingRing)
      .mul(style.z)
      .mul(sprayFade);

    let color: Node<'vec3'> = vec3(0.31, 0.56, 0.62);
    color = mix(color, vec3(0.1, 0.29, 0.36), grooves.mul(0.86));
    color = mix(color, vec3(0.82, 0.95, 0.98), displacedSnow);
    color = mix(color, vec3(0.96, 0.995, 1), max(carveSpray, landingBurst));
    const alpha = max(
      max(grooves.mul(0.82), displacedSnow.mul(0.76)),
      max(carveSpray.mul(0.72), landingBurst.mul(0.88)),
    );
    const material = new MeshBasicNodeMaterial();
    material.colorNode = color;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    this.mesh = new InstancedMesh(geometry, material, TRAIL_CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.position.z = 0.32;
  }

  record(state: Readonly<SkiState>, delta: number): void {
    this.elapsed += delta;
    this.currentTime.value = this.elapsed;
    if (state.crashed) {
      this.landingWasActive = false;
      return;
    }
    if (state.airborne) {
      this.previousX = state.position.x;
      this.previousY = state.position.y;
      this.hasPrevious = true;
      this.landingWasActive = false;
      return;
    }
    const landing = state.landingAmount > 0.82 && !this.landingWasActive ? 1 : 0;
    this.landingWasActive = state.landingAmount > 0.18;
    if (!this.hasPrevious) {
      this.previousX = state.position.x;
      this.previousY = state.position.y;
      this.hasPrevious = true;
      return;
    }
    const dx = state.position.x - this.previousX;
    const dy = state.position.y - this.previousY;
    const distance = Math.hypot(dx, dy);
    if (distance < MIN_SAMPLE_DISTANCE && landing === 0) return;
    const offset = this.writeIndex * 4;
    const carve = Math.max(0.06, Math.min(1, Math.abs(state.carve)));
    const width = 1.35 + carve * 0.75 + landing * 1.5;
    this.instancePosition.set(
      (state.position.x + this.previousX) * 0.5,
      -(state.position.y + this.previousY) * 0.5,
      0,
    );
    this.instanceRotation.setFromAxisAngle(this.rotationAxis, Math.atan2(-dy, dx) - Math.PI * 0.5);
    this.instanceScale.set(width, distance + 0.42, 1);
    this.instanceMatrix.compose(
      this.instancePosition,
      this.instanceRotation,
      this.instanceScale,
    );
    this.mesh.setMatrixAt(this.writeIndex, this.instanceMatrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.styleData[offset] = carve;
    this.styleData[offset + 1] = this.elapsed;
    this.styleData[offset + 2] = landing;
    this.styleData[offset + 3] = 1;
    this.styleAttribute.needsUpdate = true;
    this.writeIndex = (this.writeIndex + 1) % TRAIL_CAPACITY;
    this.samples = Math.min(TRAIL_CAPACITY, this.samples + 1);
    this.previousX = state.position.x;
    this.previousY = state.position.y;
  }

  updateCamera(cameraX: number, cameraY: number): void {
    this.mesh.position.x = -cameraX;
    this.mesh.position.y = cameraY;
  }

  reset(state: Readonly<SkiState>): void {
    this.styleData.fill(0);
    this.styleAttribute.clearUpdateRanges();
    this.styleAttribute.needsUpdate = true;
    this.writeIndex = 0;
    this.elapsed = 0;
    this.currentTime.value = 0;
    this.previousX = state.position.x;
    this.previousY = state.position.y;
    this.hasPrevious = true;
    this.landingWasActive = false;
    this.samples = 0;
  }

  get sampleCount(): number {
    return this.samples;
  }
}
