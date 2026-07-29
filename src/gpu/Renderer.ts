import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGPURenderer,
} from 'three/webgpu';
import type { InputState } from '../input/InputState';
import type { WorldPosition } from '../core/WorldCoordinates';
import {
  createPoseParameters,
  resolveSkierPose,
  type SkierPoseName,
} from '../simulation/SkierPose';
import type { SkiState } from '../simulation/SkiPhysics';
import { createCameraMarkerShader } from './shaders/cameraMarkers';
import { createSkierShader } from './shaders/skier';
import { createSnowShader } from './shaders/snowBackground';
import { createWorldFeatureShader } from './shaders/worldFeatures';
import { createCollisionDebugShader } from './shaders/collisionDebug';
import type { CrashReaction, ImpactContext } from '../simulation/CrashReaction';

const BASE_VIEW_HEIGHT = 80;

export class GameRenderer {
  readonly renderer: WebGPURenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly snow;
  private readonly markers;
  private readonly features;
  private readonly skier;
  private readonly collisionDebug;
  private readonly snowMesh: Mesh;
  private readonly markerMesh: Mesh;
  private readonly featureMesh: Mesh;
  private readonly skierMesh: Mesh;
  private readonly collisionDebugMesh: Mesh;
  private viewWidth = BASE_VIEW_HEIGHT;
  private viewHeight = BASE_VIEW_HEIGHT;
  private cameraWorldX = 0;
  private cameraWorldY = 0;
  private markersVisible: boolean;
  private poseOverride: SkierPoseName | null = null;
  private readonly pose = createPoseParameters();
  private shakeTime = 0;
  private shakeStrength = 0;
  private debugWorldX = 0;
  private debugWorldY = 0;
  private debugContactWorldX = 0;
  private debugContactWorldY = 0;

  constructor(
    canvas: HTMLCanvasElement,
    seed: number,
    cameraTestMode: boolean,
  ) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.camera.position.z = 2;
    this.markersVisible = cameraTestMode;
    this.snow = createSnowShader(seed);
    this.markers = createCameraMarkerShader(seed);
    this.features = createWorldFeatureShader(seed);
    this.skier = createSkierShader();
    this.collisionDebug = createCollisionDebugShader();
    this.snowMesh = new Mesh(new PlaneGeometry(1, 1), this.snow.material);
    this.snowMesh.position.z = -0.5;
    this.scene.add(this.snowMesh);
    this.markerMesh = new Mesh(new PlaneGeometry(1, 1), this.markers.material);
    this.markerMesh.position.z = 0;
    this.markerMesh.visible = this.markersVisible;
    this.scene.add(this.markerMesh);
    this.featureMesh = new Mesh(new PlaneGeometry(1, 1), this.features.material);
    this.featureMesh.position.z = 0.25;
    this.scene.add(this.featureMesh);
    this.skierMesh = new Mesh(new PlaneGeometry(4.6, 5.8), this.skier.material);
    this.skierMesh.position.z = 0.5;
    this.scene.add(this.skierMesh);
    this.collisionDebugMesh = new Mesh(new PlaneGeometry(1, 1), this.collisionDebug.material);
    this.collisionDebugMesh.position.z = 0.8;
    this.collisionDebugMesh.visible = false;
    this.scene.add(this.collisionDebugMesh);
  }

  async initialize(): Promise<void> {
    await this.renderer.init();
    this.resize();
    addEventListener('resize', this.resize);
  }

  updateCamera(state: Readonly<SkiState>, deltaSeconds: number): void {
    const speed = Math.hypot(state.velocityX, state.velocityY);
    this.cameraWorldX +=
      (state.position.x - this.cameraWorldX) * (1 - Math.exp(-deltaSeconds * 4.2));
    const speedLookAhead = Math.max(0, Math.min(1, (speed - 10) / 24));
    const targetY = state.position.y + this.viewHeight * (0.19 + speedLookAhead * 0.055);
    this.cameraWorldY +=
      (targetY - this.cameraWorldY) * (1 - Math.exp(-deltaSeconds * 5.5));
    this.shakeTime = Math.max(0, this.shakeTime - deltaSeconds);
  }

  draw(
    state: Readonly<SkiState>,
    input: Readonly<InputState>,
    origin: Readonly<WorldPosition>,
  ): void {
    resolveSkierPose(state, input, this.poseOverride, this.pose);
    const pose = this.pose;
    this.snow.worldX.value = this.cameraWorldX - origin.x;
    this.snow.worldY.value = this.cameraWorldY - origin.y;
    this.markers.worldX.value = this.cameraWorldX - origin.x;
    this.markers.worldY.value = this.cameraWorldY - origin.y;
    this.features.worldX.value = this.cameraWorldX;
    this.features.worldY.value = this.cameraWorldY;
    this.skier.lean.value = pose.lean;
    this.skier.traverse.value = pose.traverse;
    this.skier.crouch.value = pose.crouch;
    this.skier.wedge.value = pose.wedge;
    this.skier.tuck.value = pose.tuck;
    this.skier.air.value = pose.air;
    this.skier.landing.value = pose.landing;
    this.skier.crash.value = pose.crash;
    this.skier.spray.value = pose.spray;
    this.skier.stopped.value = pose.stopped;
    const crash = state.crash;
    this.skier.crashStyle.value =
      crash.family === 'side-spin' ? 1 : crash.family === 'rolling-tumble' ? 2 : crash.family === 'obstacle-slam' ? 3 : 0;
    this.skier.equipmentSpread.value = crash.equipmentSpread;
    this.skier.snowBurst.value = crash.snowBurst;
    this.skier.facePlant.value = crash.facePlant;
    this.skier.treeStick.value = crash.treeStick;
    this.skier.sideWipeout.value = crash.sideWipeout;
    this.skier.tumbleCurl.value = crash.tumbleCurl;
    this.skier.skiLift.value = crash.skiLift;
    this.skier.armSpread.value = crash.armSpread;
    this.skier.slideTrail.value = crash.slideTrail;
    const shake =
      this.shakeTime > 0
        ? Math.sin(this.shakeTime * 83) * this.shakeStrength * (this.shakeTime / 0.32)
        : 0;
    this.skierMesh.position.x = state.position.x - this.cameraWorldX + shake;
    this.skierMesh.position.y = this.cameraWorldY - state.position.y + crash.lift * 1.8 - shake * 0.45;
    this.skierMesh.rotation.z = crash.active
      ? crash.family === 'rolling-tumble'
        ? crash.rotation
        : crash.family === 'side-spin'
          ? crash.rotation * 0.72
          : crash.family === 'obstacle-slam'
            ? crash.phase === 'impact'
              ? 0
              : crash.rotation * 0.42
            : crash.rotation * 0.08
      : state.wobble * 0.12;
    this.skierMesh.scale.set(1 + crash.squash * 0.26, 1 - crash.squash * 0.34, 1);
    if (this.collisionDebugMesh.visible) {
      this.collisionDebug.skierX.value = state.position.x - this.cameraWorldX;
      this.collisionDebug.skierY.value = state.position.y - this.cameraWorldY;
      this.collisionDebug.obstacleX.value = this.debugWorldX - this.cameraWorldX;
      this.collisionDebug.obstacleY.value = this.debugWorldY - this.cameraWorldY;
      this.collisionDebug.contactX.value = this.debugContactWorldX - this.cameraWorldX;
      this.collisionDebug.contactY.value = this.debugContactWorldY - this.cameraWorldY;
      this.collisionDebugMesh.position.set(0, 0, 0.8);
    }
    this.renderer.render(this.scene, this.camera);
  }

  setPoseOverride(pose: SkierPoseName | null): void {
    this.poseOverride = pose;
  }

  resetCamera(state: Readonly<SkiState>): void {
    this.cameraWorldX = state.position.x;
    this.cameraWorldY = state.position.y + this.viewHeight * 0.19;
  }

  setMarkersVisible(visible: boolean): void {
    this.markersVisible = visible;
    this.markerMesh.visible = visible;
  }

  setImpactDebug(
    context: Readonly<ImpactContext>,
    reaction: Readonly<CrashReaction>,
    debugVisible = true,
  ): void {
    this.debugWorldX = context.contactX - context.normalX * context.obstacleRadius;
    this.debugWorldY = context.contactY - context.normalY * context.obstacleRadius;
    this.debugContactWorldX = context.contactX;
    this.debugContactWorldY = context.contactY;
    this.collisionDebug.obstacleRadius.value = context.obstacleRadius;
    this.collisionDebug.normalX.value = context.normalX;
    this.collisionDebug.normalY.value = context.normalY;
    this.collisionDebug.velocityX.value = context.velocityX;
    this.collisionDebug.velocityY.value = context.velocityY;
    this.collisionDebugMesh.visible = debugVisible;
    this.shakeTime = 0.32;
    this.shakeStrength = reaction.strength * 0.38;
  }

  clearImpactDebug(): void {
    this.collisionDebugMesh.visible = false;
  }

  get markersEnabled(): boolean {
    return this.markersVisible;
  }

  get drawCalls(): number {
    return 3 + Number(this.markersVisible) + Number(this.collisionDebugMesh.visible);
  }

  get visibleFeatureEstimate(): number {
    return Math.round((this.viewWidth / 12) * (this.viewHeight / 12) * 0.38);
  }

  private readonly resize = (): void => {
    const size = new Vector2(innerWidth, innerHeight);
    this.renderer.setSize(size.x, size.y, false);
    const aspect = size.x / size.y;
    this.viewHeight = aspect < 0.72 ? 94 : aspect < 1.15 ? 86 : BASE_VIEW_HEIGHT;
    this.viewWidth = this.viewHeight * aspect;
    this.snowMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.markerMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.featureMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.collisionDebugMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.snow.viewWidth.value = this.viewWidth;
    this.snow.viewHeight.value = this.viewHeight;
    this.markers.viewWidth.value = this.viewWidth;
    this.markers.viewHeight.value = this.viewHeight;
    this.features.viewWidth.value = this.viewWidth;
    this.features.viewHeight.value = this.viewHeight;
    this.collisionDebug.viewWidth.value = this.viewWidth;
    this.collisionDebug.viewHeight.value = this.viewHeight;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
  };
}
