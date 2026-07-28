import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGPURenderer,
} from 'three/webgpu';
import { createSnowShader } from './shaders/snowBackground';
import { createSkierShader } from './shaders/skier';
import type { SkiState } from '../simulation/SkiPhysics';
import type { WorldPosition } from '../core/WorldCoordinates';

export class GameRenderer {
  readonly renderer: WebGPURenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private readonly snow;
  private readonly skier;
  private readonly snowMesh: Mesh;
  private readonly skierMesh: Mesh;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.camera.position.z = 2;
    this.snow = createSnowShader(seed);
    this.skier = createSkierShader();
    this.snowMesh = new Mesh(new PlaneGeometry(2, 2), this.snow.material);
    this.scene.add(this.snowMesh);
    this.skierMesh = new Mesh(new PlaneGeometry(0.38, 0.5), this.skier.material);
    this.skierMesh.position.set(0, -0.28, 0.5);
    this.scene.add(this.skierMesh);
  }

  async initialize(): Promise<void> {
    await this.renderer.init();
    this.resize();
    addEventListener('resize', this.resize);
  }

  draw(state: Readonly<SkiState>, relative: Readonly<WorldPosition>): void {
    this.snow.worldX.value = state.position.x;
    this.snow.worldY.value = state.position.y;
    this.skier.carve.value = state.carve;
    this.skier.brake.value = state.velocityY < 9 ? 1 : 0;
    this.skierMesh.position.x = Math.max(-0.58, Math.min(0.58, relative.x * 0.035));
    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    const size = new Vector2(innerWidth, innerHeight);
    this.renderer.setSize(size.x, size.y, false);
    const aspect = size.x / size.y;
    this.snowMesh.scale.x = aspect;
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
  };
}
