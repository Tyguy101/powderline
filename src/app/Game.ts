import { FixedStepLoop } from '../core/FixedStepLoop';
import { CameraRelativeOrigin } from '../core/WorldCoordinates';
import { GameRenderer } from '../gpu/Renderer';
import { FrameMetrics } from '../instrumentation/FrameMetrics';
import { InputManager } from '../input/InputManager';
import { SkiPhysics } from '../simulation/SkiPhysics';
import { HUD } from '../ui/HUD';
import { PoseGallery } from '../ui/PoseGallery';
import type { GameConfig } from './config';

export class Game {
  private readonly physics = new SkiPhysics();
  private readonly metrics = new FrameMetrics();
  private readonly origin: CameraRelativeOrigin;
  private readonly input: InputManager;
  private readonly hud: HUD;
  private readonly renderer: GameRenderer;
  private readonly loop: FixedStepLoop;
  private poseInspectionActive = false;

  constructor(
    root: HTMLElement,
    private readonly config: GameConfig,
  ) {
    root.innerHTML = `<main class="game-shell">
      <canvas id="game-canvas" aria-label="Procedural downhill skiing game"></canvas>
      <div class="vignette"></div>
    </main>`;
    const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas')!;
    this.renderer = new GameRenderer(canvas, config.seed, config.cameraTestMode);
    this.input = new InputManager(canvas);
    this.hud = new HUD(root, config);
    if (config.developmentMode) {
      new PoseGallery(
        root,
        (pose) => {
          this.poseInspectionActive = pose !== null;
          this.renderer.setPoseOverride(pose);
        },
        (visible) => this.renderer.setMarkersVisible(visible),
        this.renderer.markersEnabled,
        config.poseGalleryMode,
      );
    }
    this.origin = new CameraRelativeOrigin(config.rebaseDistance);
    this.loop = new FixedStepLoop(
      config.fixedStepSeconds,
      config.maxFrameSeconds,
      (delta) => {
        if (!this.poseInspectionActive) this.physics.step(delta, this.input.state);
        this.renderer.updateCamera(this.physics.state, delta);
      },
      (_alpha, frameMs) => this.render(frameMs),
    );
  }

  async start(): Promise<void> {
    await this.renderer.initialize();
    document.body.classList.add('ready');
    this.loop.start();
  }

  private render(frameMs: number): void {
    const state = this.physics.state;
    this.origin.update(state.position);
    const snapshot = this.metrics.push(frameMs);
    this.renderer.draw(state, this.input.state, this.origin.origin);
    this.hud.update(state, snapshot, this.config, this.renderer.drawCalls);
    globalThis.__POWDERLINE_METRICS__ = {
      ...snapshot,
      worldX: state.position.x,
      worldY: state.position.y,
      seed: this.config.seed,
      quality: this.config.quality,
    };
  }
}

declare global {
  var __POWDERLINE_METRICS__: Record<string, number | string> | undefined;
}
