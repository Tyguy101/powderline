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

const BASE_VIEW_HEIGHT = 80;

export class GameRenderer {
  readonly renderer: WebGPURenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly snow;
  private readonly markers;
  private readonly skier;
  private readonly snowMesh: Mesh;
  private readonly markerMesh: Mesh;
  private readonly skierMesh: Mesh;
  private viewWidth = BASE_VIEW_HEIGHT;
  private viewHeight = BASE_VIEW_HEIGHT;
  private cameraWorldX = 0;
  private cameraWorldY = 0;
  private markersVisible: boolean;
  private poseOverride: SkierPoseName | null = null;
  private readonly pose = createPoseParameters();

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
    this.skier = createSkierShader();
    this.snowMesh = new Mesh(new PlaneGeometry(1, 1), this.snow.material);
    this.snowMesh.position.z = -0.5;
    this.scene.add(this.snowMesh);
    this.markerMesh = new Mesh(new PlaneGeometry(1, 1), this.markers.material);
    this.markerMesh.position.z = 0;
    this.markerMesh.visible = this.markersVisible;
    this.scene.add(this.markerMesh);
    this.skierMesh = new Mesh(new PlaneGeometry(4.6, 5.8), this.skier.material);
    this.skierMesh.position.z = 0.5;
    this.scene.add(this.skierMesh);
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
    this.skierMesh.position.x = state.position.x - this.cameraWorldX;
    this.skierMesh.position.y = this.cameraWorldY - state.position.y;
    this.renderer.render(this.scene, this.camera);
  }

  setPoseOverride(pose: SkierPoseName | null): void {
    this.poseOverride = pose;
  }

  setMarkersVisible(visible: boolean): void {
    this.markersVisible = visible;
    this.markerMesh.visible = visible;
  }

  get markersEnabled(): boolean {
    return this.markersVisible;
  }

  get drawCalls(): number {
    return this.markersVisible ? 3 : 2;
  }

  private readonly resize = (): void => {
    const size = new Vector2(innerWidth, innerHeight);
    this.renderer.setSize(size.x, size.y, false);
    const aspect = size.x / size.y;
    this.viewHeight = aspect < 0.72 ? 94 : aspect < 1.15 ? 86 : BASE_VIEW_HEIGHT;
    this.viewWidth = this.viewHeight * aspect;
    this.snowMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.markerMesh.scale.set(this.viewWidth, this.viewHeight, 1);
    this.snow.viewWidth.value = this.viewWidth;
    this.snow.viewHeight.value = this.viewHeight;
    this.markers.viewWidth.value = this.viewWidth;
    this.markers.viewHeight.value = this.viewHeight;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
  };
}
