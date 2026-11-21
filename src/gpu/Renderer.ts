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
import { createCollisionDebugShader } from './shaders/collisionDebug';
import type { CrashReaction, ImpactContext } from '../simulation/CrashReaction';
import { createCrashTrailShader } from './shaders/crashTrail';
import { createTreeForegroundShader } from './shaders/treeForeground';
import { TrackTrailBuffer } from './TrackTrailBuffer';
import { NpcRenderer } from './NpcRenderer';
import type { NpcState } from '../simulation/NpcSystem';
import type { PerformanceConfig } from '../app/config';
import { TimingCounter } from '../instrumentation/PerformanceCounters';
import { WorldFeatureRenderer } from './WorldFeatureRenderer';
import { MountainRenderer } from './MountainRenderer';
import type { MountainRun } from '../simulation/MountainRun';

const BASE_VIEW_HEIGHT = 80;

export class GameRenderer {
  readonly view = { x: 0, y: 0, width: BASE_VIEW_HEIGHT, height: BASE_VIEW_HEIGHT };
  readonly renderer: WebGPURenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly snow;
  private readonly markers;
  private readonly features: WorldFeatureRenderer;
  private readonly mountainRenderer: MountainRenderer | undefined;
  private readonly skier;
  private readonly collisionDebug;
  private readonly crashTrail;
  private readonly treeForeground;
  private readonly tracks = new TrackTrailBuffer();
  private readonly npcs = new NpcRenderer();
  private readonly snowMesh: Mesh;
  private readonly markerMesh: Mesh;
  private readonly skierMesh: Mesh;
  private readonly collisionDebugMesh: Mesh;
  private readonly crashTrailMesh: Mesh;
  private readonly treeForegroundMesh: Mesh;
  private viewWidth = BASE_VIEW_HEIGHT;
  private viewHeight = BASE_VIEW_HEIGHT;
  private cameraWorldX = 0;
  private cameraWorldY = 0;
  private snowWarmth = 0;
  private markersVisible: boolean;
  private poseOverride: SkierPoseName | null = null;
  private readonly pose = createPoseParameters();
  private shakeTime = 0;
  private shakeStrength = 0;
  private debugWorldX = 0;
  private debugWorldY = 0;
  private debugContactWorldX = 0;
  private debugContactWorldY = 0;
  private appliedPixelRatio = 1;
  private landscapeMobileComposition = false;
  private lastPlayerWorldY = 0;
  readonly preparationTiming = new TimingCounter();
  readonly submissionTiming = new TimingCounter();
  readonly npcRenderTiming = new TimingCounter();

  constructor(
    canvas: HTMLCanvasElement,
    seed: number,
    cameraTestMode: boolean,
    private readonly performanceConfig: PerformanceConfig,
    private readonly mobileCameraMode: 'landscape' | 'legacy' = 'landscape',
    private readonly mountain?: MountainRun,
  ) {
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.camera.position.z = 2;
    this.markersVisible = cameraTestMode;
    this.snow = createSnowShader(seed);
    this.markers = createCameraMarkerShader(seed);
    this.features = new WorldFeatureRenderer(seed, mountain);
    this.mountainRenderer = mountain && !performanceConfig.disabled.has('mountain') ? new MountainRenderer() : undefined;
    if (this.mountainRenderer) this.scene.add(...this.mountainRenderer.meshes);
    this.skier = createSkierShader();
    this.collisionDebug = createCollisionDebugShader();
    this.crashTrail = createCrashTrailShader();
    this.treeForeground = createTreeForegroundShader(seed);
    this.snowMesh = new Mesh(new PlaneGeometry(1, 1), this.snow.material);
    this.snowMesh.position.z = -0.5;
    this.scene.add(this.snowMesh);
    this.markerMesh = new Mesh(new PlaneGeometry(1, 1), this.markers.material);
    this.markerMesh.position.z = 0;
    this.markerMesh.visible = this.markersVisible;
    this.scene.add(this.markerMesh);
    this.scene.add(this.features.mesh);
    this.scene.add(this.tracks.mesh);
    this.scene.add(this.npcs.mesh);
    this.crashTrailMesh = new Mesh(new PlaneGeometry(1, 1), this.crashTrail.material);
    this.crashTrailMesh.position.z = 0.38;
    this.crashTrailMesh.visible = false;
    this.scene.add(this.crashTrailMesh);
    this.skierMesh = new Mesh(new PlaneGeometry(4.6, 5.8), this.skier.material);
    this.skierMesh.position.z = 0.5;
    this.scene.add(this.skierMesh);
    this.treeForegroundMesh = new Mesh(new PlaneGeometry(1, 1), this.treeForeground.material);
    this.treeForegroundMesh.position.z = 0.65;
    this.treeForegroundMesh.visible = false;
    this.scene.add(this.treeForegroundMesh);
    this.collisionDebugMesh = new Mesh(new PlaneGeometry(1, 1), this.collisionDebug.material);
    this.collisionDebugMesh.position.z = 0.8;
    this.collisionDebugMesh.visible = false;
    this.scene.add(this.collisionDebugMesh);
    const disabled = performanceConfig.disabled;
    this.snowMesh.visible = !disabled.has('snow');
    this.features.mesh.visible = !disabled.has('obstacles');
    this.tracks.mesh.visible = !disabled.has('trails');
    this.npcs.mesh.visible = !disabled.has('npcRender');
    this.skierMesh.visible = !disabled.has('player');
  }

  async initialize(): Promise<void> {
    await this.renderer.init();
    this.resize();
    // Compile optional crash pipelines during startup instead of hitching on
    // the first collision/tree slam in the middle of a run.
    const crashTrailVisible = this.crashTrailMesh.visible;
    const treeForegroundVisible = this.treeForegroundMesh.visible;
    this.crashTrailMesh.visible = true;
    this.treeForegroundMesh.visible = true;
    await this.renderer.compileAsync(this.scene, this.camera);
    this.crashTrailMesh.visible = crashTrailVisible;
    this.treeForegroundMesh.visible = treeForegroundVisible;
    addEventListener('resize', this.resize);
  }

  updateCamera(state: Readonly<SkiState>, deltaSeconds: number): void {
    this.lastPlayerWorldY = state.position.y;
    const speed = Math.hypot(state.velocityX, state.velocityY);
    this.cameraWorldX +=
      (state.position.x - this.cameraWorldX) * (1 - Math.exp(-deltaSeconds * 4.2));
    const speedLookAhead = Math.max(0, Math.min(1, (speed - 10) / 24));
    const baseLookAhead = this.landscapeMobileComposition ? 0.32 : 0.19;
    const speedLookAheadRange = this.landscapeMobileComposition ? 0.025 : 0.055;
    const timed = this.mountain?.section.expansion.timed;
    const courseLookAhead = timed && state.position.y >= timed.start - 45 &&
      state.position.y <= timed.finish + 25 ? 0.13 : 0;
    const targetY = state.position.y + this.viewHeight *
      (baseLookAhead + speedLookAhead * speedLookAheadRange + courseLookAhead);
    const sun = this.mountain?.section.expansion.bowlReveal;
    const light = sun != null ? Math.max(0, Math.min(1, (state.position.y - sun + 38) / 57)) : 0;
    this.snowWarmth += (light - this.snowWarmth) * Math.min(1, deltaSeconds * 3.8);
    this.snow.warmth.value = this.snowWarmth;
    this.cameraWorldY +=
      (targetY - this.cameraWorldY) * (1 - Math.exp(-deltaSeconds * 5.5));
    this.view.x = this.cameraWorldX;
    this.view.y = this.cameraWorldY;
    this.shakeTime = Math.max(0, this.shakeTime - deltaSeconds);
  }

  draw(
    state: Readonly<SkiState>,
    input: Readonly<InputState>,
    origin: Readonly<WorldPosition>,
    npcs: readonly Readonly<NpcState>[],
  ): void {
    this.view.x = this.cameraWorldX;
    this.view.y = this.cameraWorldY;
    this.view.width = this.viewWidth;
    this.view.height = this.viewHeight;
    const preparationStarted = performance.now();
    resolveSkierPose(state, input, this.poseOverride, this.pose);
    const pose = this.pose;
    this.snow.worldX.value = this.cameraWorldX - origin.x;
    this.snow.worldY.value = this.cameraWorldY - origin.y;
    this.markers.worldX.value = this.cameraWorldX - origin.x;
    this.markers.worldY.value = this.cameraWorldY - origin.y;
    this.mountainRenderer?.update(this.mountain!, this.cameraWorldX, this.cameraWorldY, this.viewHeight);
    if (this.features.mesh.visible) {
      this.features.update(this.cameraWorldX, this.cameraWorldY, this.viewWidth, this.viewHeight);
    }
    this.tracks.updateCamera(this.cameraWorldX, this.cameraWorldY);
    if (this.npcs.mesh.visible) {
      const npcStarted = performance.now();
      this.npcs.update(
        npcs,
        this.cameraWorldX,
        this.cameraWorldY,
        this.viewWidth,
        this.viewHeight,
        this.performanceConfig.disabled,
      );
      this.npcRenderTiming.push(performance.now() - npcStarted);
    }
    this.treeForeground.worldX.value = this.cameraWorldX;
    this.treeForeground.worldY.value = this.cameraWorldY;
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
    this.treeForegroundMesh.visible = !this.performanceConfig.disabled.has('crashEffects') &&
      crash.active &&
      crash.family === 'obstacle-slam' &&
      crash.phase !== 'rest';
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
    // Terrain deformation is rendered in world space by crashTrail. Keep the
    // legacy skier-local groove disabled so the mark does not move with the rig.
    this.skier.slideTrail.value = 0;
    this.skier.slideSpray.value = crash.slideTrail;
    this.skier.jumpLift.value = Math.min(0.19, state.airborneHeight * 0.052);
    this.crashTrailMesh.visible =
      !this.performanceConfig.disabled.has('crashEffects') && crash.active && crash.trailActive;
    this.crashTrail.startX.value = crash.trailStartX;
    this.crashTrail.startY.value = crash.trailStartY;
    this.crashTrail.endX.value = state.position.x;
    this.crashTrail.endY.value = state.position.y;
    this.crashTrail.intensity.value =
      crash.active && crash.trailActive ? 0.45 + crash.severity * 0.55 : 0;
    this.crashTrail.family.value =
      crash.family === 'face-plant' ? 0 : crash.family === 'side-spin' ? 1 : crash.family === 'rolling-tumble' ? 2 : 3;
    const trailMargin = 2.4;
    const trailWidth = Math.abs(state.position.x - crash.trailStartX) + trailMargin * 2;
    const trailHeight = Math.abs(state.position.y - crash.trailStartY) + trailMargin * 2;
    const trailCenterX = (state.position.x + crash.trailStartX) * 0.5;
    const trailCenterY = (state.position.y + crash.trailStartY) * 0.5;
    this.crashTrail.boundsCenterX.value = trailCenterX;
    this.crashTrail.boundsCenterY.value = trailCenterY;
    this.crashTrail.boundsWidth.value = trailWidth;
    this.crashTrail.boundsHeight.value = trailHeight;
    this.crashTrailMesh.scale.set(trailWidth, trailHeight, 1);
    this.crashTrailMesh.position.x = trailCenterX - this.cameraWorldX;
    this.crashTrailMesh.position.y = this.cameraWorldY - trailCenterY;
    const shake = !this.performanceConfig.disabled.has('cameraEffects') &&
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
    this.preparationTiming.push(performance.now() - preparationStarted);
    const submissionStarted = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.submissionTiming.push(performance.now() - submissionStarted);
  }

  setPoseOverride(pose: SkierPoseName | null): void {
    this.poseOverride = pose;
  }

  resetCamera(state: Readonly<SkiState>): void {
    this.cameraWorldX = state.position.x;
    this.cameraWorldY = state.position.y + this.viewHeight *
      (this.landscapeMobileComposition ? 0.32 : 0.19);
  }

  recordTrail(state: Readonly<SkiState>, deltaSeconds: number): void {
    this.tracks.record(state, deltaSeconds);
  }

  resetTrail(state: Readonly<SkiState>): void {
    this.tracks.reset(state);
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
    return (this.mountainRenderer?.drawCalls ?? 0) +
      Number(this.snowMesh.visible) + Number(this.features.mesh.visible) +
      Number(this.tracks.mesh.visible) + Number(this.npcs.mesh.visible) +
      Number(this.skierMesh.visible) + Number(this.treeForegroundMesh.visible) +
      Number(this.crashTrailMesh.visible) +
      Number(this.markersVisible) +
      Number(this.collisionDebugMesh.visible);
  }

  get visibleRiders(): number {
    return this.npcs.mesh.visible ? this.npcs.mesh.count : 0;
  }

  get visibleFeatureEstimate(): number {
    return this.features.count;
  }

  get trackSampleCount(): number {
    return this.tracks.sampleCount;
  }

  get canvasPixelWidth(): number {
    return this.renderer.domElement.width;
  }

  get canvasPixelHeight(): number {
    return this.renderer.domElement.height;
  }

  get pixelRatio(): number {
    return this.appliedPixelRatio;
  }

  get effectiveCameraScale(): number {
    return this.viewHeight;
  }

  get mobileComposition(): string {
    return this.landscapeMobileComposition ? 'landscape-lookahead' : 'responsive-default';
  }

  skierScreenYPercent(state: Readonly<SkiState>): number {
    return (0.5 - (this.cameraWorldY - state.position.y) / this.viewHeight) * 100;
  }

  resizeToViewport(): void {
    this.resize();
  }

  private readonly resize = (): void => {
    const canvas = this.renderer.domElement;
    const size = new Vector2(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
    const requestedRatio = this.performanceConfig.renderScale ?? Math.min(devicePixelRatio, 1.5);
    const budgetRatio = Math.sqrt(
      this.performanceConfig.maxCanvasPixels / Math.max(1, size.x * size.y),
    );
    this.appliedPixelRatio = Math.max(0.5, Math.min(requestedRatio, budgetRatio));
    this.renderer.setPixelRatio(this.appliedPixelRatio);
    this.renderer.setSize(size.x, size.y, false);
    const aspect = size.x / size.y;
    const previousLandscapeComposition = this.landscapeMobileComposition;
    this.landscapeMobileComposition = this.mobileCameraMode === 'landscape' &&
      matchMedia('(pointer: coarse)').matches && aspect > 1.15;
    this.viewHeight = this.landscapeMobileComposition
      ? 88
      : aspect < 0.72 ? 94 : aspect < 1.15 ? 86 : BASE_VIEW_HEIGHT;
    if (previousLandscapeComposition !== this.landscapeMobileComposition) {
      this.cameraWorldY = this.lastPlayerWorldY + this.viewHeight *
        (this.landscapeMobileComposition ? 0.32 : 0.19);
    }
    this.viewWidth = this.viewHeight * aspect;
    this.snowMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.markerMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.treeForegroundMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.collisionDebugMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.snow.viewWidth.value = this.viewWidth;
    this.snow.viewHeight.value = this.viewHeight;
    this.markers.viewWidth.value = this.viewWidth;
    this.markers.viewHeight.value = this.viewHeight;
    this.treeForeground.viewWidth.value = this.viewWidth;
    this.treeForeground.viewHeight.value = this.viewHeight;
    this.collisionDebug.viewWidth.value = this.viewWidth;
    this.collisionDebug.viewHeight.value = this.viewHeight;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
  };
}
