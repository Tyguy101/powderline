import { FixedStepLoop } from '../core/FixedStepLoop';
import { CameraRelativeOrigin } from '../core/WorldCoordinates';
import { GameRenderer } from '../gpu/Renderer';
import { FrameMetrics } from '../instrumentation/FrameMetrics';
import { InputManager } from '../input/InputManager';
import { SkiPhysics } from '../simulation/SkiPhysics';
import { CollisionSystem } from '../simulation/CollisionSystem';
import { ReplaySystem } from '../simulation/ReplaySystem';
import { CrashOverlay } from '../ui/CrashOverlay';
import { HUD } from '../ui/HUD';
import { PoseGallery } from '../ui/PoseGallery';
import { BUILD_ID } from './build';
import type { GameConfig } from './config';

export class Game {
  private readonly physics = new SkiPhysics();
  private readonly metrics = new FrameMetrics();
  private readonly origin: CameraRelativeOrigin;
  private readonly input: InputManager;
  private readonly hud: HUD;
  private readonly renderer: GameRenderer;
  private readonly collision: CollisionSystem;
  private readonly replay: ReplaySystem;
  private readonly crashOverlay: CrashOverlay;
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
    this.collision = new CollisionSystem(config.seed);
    this.replay = new ReplaySystem(config.seed, config.replay);
    this.input = new InputManager(canvas);
    this.hud = new HUD(root, config);
    this.crashOverlay = new CrashOverlay(root, () => this.restart());
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
        if (this.input.consumeRestart() && this.physics.state.crashed) this.restart();
        if (!this.poseInspectionActive && !this.physics.state.crashed) {
          const replayInput = this.replay.sample(this.input.state);
          this.physics.step(delta, replayInput);
          const hit = this.collision.query(this.physics.state);
          if (hit) {
            this.physics.crash();
            this.crashOverlay.show(this.physics.state.position.y, this.replay.serialize());
          }
        }
        this.renderer.updateCamera(this.physics.state, delta);
      },
      (_alpha, frameMs) => this.render(frameMs),
    );
  }

  private restart(): void {
    this.physics.reset();
    this.replay.reset();
    this.origin.reset(this.physics.state.position);
    this.renderer.resetCamera(this.physics.state);
    this.crashOverlay.hide();
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
    this.hud.update(
      state,
      snapshot,
      this.config,
      this.renderer.drawCalls,
      this.renderer.visibleFeatureEstimate,
    );
    globalThis.__POWDERLINE_METRICS__ = {
      ...snapshot,
      worldX: state.position.x,
      worldY: state.position.y,
      seed: this.config.seed,
      quality: this.config.quality,
      build: BUILD_ID,
    };
  }
}

declare global {
  var __POWDERLINE_METRICS__: Record<string, number | string> | undefined;
}
