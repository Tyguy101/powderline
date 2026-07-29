import { FixedStepLoop } from '../core/FixedStepLoop';
import { CameraRelativeOrigin } from '../core/WorldCoordinates';
import { GameRenderer } from '../gpu/Renderer';
import { FrameMetrics } from '../instrumentation/FrameMetrics';
import { InputManager } from '../input/InputManager';
import { SkiPhysics } from '../simulation/SkiPhysics';
import { CollisionSystem } from '../simulation/CollisionSystem';
import { ReplaySystem } from '../simulation/ReplaySystem';
import { selectCrashReaction, type ImpactContext } from '../simulation/CrashReaction';
import { CrashOverlay } from '../ui/CrashOverlay';
import { HUD } from '../ui/HUD';
import { PoseGallery } from '../ui/PoseGallery';
import { CrashLab } from '../ui/CrashLab';
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
  private crashPromptShown = false;

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
      new CrashLab(
        root,
        (settings) => this.triggerLabCrash(settings),
        () => this.restart(),
        config.crashLabMode,
      );
    }
    this.origin = new CameraRelativeOrigin(config.rebaseDistance);
    this.loop = new FixedStepLoop(
      config.fixedStepSeconds,
      config.maxFrameSeconds,
      (delta) => {
        if (this.input.consumeRestart() && this.physics.state.crashed) this.restart();
        if (!this.poseInspectionActive) {
          const replayInput = this.physics.state.crashed
            ? this.input.state
            : this.replay.sample(this.input.state);
          this.physics.step(delta, replayInput);
          if (!this.physics.state.crashed && this.physics.canCollide()) {
            const hit = this.collision.query(this.physics.state);
            if (hit && hit.feature.type !== 'none') {
              const state = this.physics.state;
              const context: ImpactContext = {
                seed: this.config.seed,
                obstacleId: hit.feature.id,
                obstacleType: hit.feature.type,
                obstacleRadius: hit.feature.radius,
                speed: Math.hypot(state.velocityX, state.velocityY),
                velocityX: state.velocityX,
                velocityY: state.velocityY,
                facing: state.facing,
                carve: state.carve,
                airborneHeight: state.airborneHeight,
                normalX: hit.normalX,
                normalY: hit.normalY,
                contactX: hit.contactX,
                contactY: hit.contactY,
                contactOffset: hit.contactOffset,
              };
              const reaction = selectCrashReaction(context);
              this.renderer.setImpactDebug(context, reaction, this.config.developmentMode);
              if (reaction.outcome === 'crash') {
                this.physics.beginCrash(context, reaction);
              } else {
                this.physics.applyMinorImpact(context, reaction);
              }
            }
          }
          if (
            this.physics.state.crashed &&
            !this.crashPromptShown &&
            this.physics.state.crash.elapsed >= this.physics.state.crash.duration
          ) {
            this.crashPromptShown = true;
            this.crashOverlay.show(
              this.physics.state.position.y,
              this.replay.serialize(),
              this.physics.state.crash.family,
            );
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
    this.crashPromptShown = false;
    this.renderer.clearImpactDebug();
  }

  private triggerLabCrash(settings: {
    obstacleType: 'tree' | 'rock';
    speed: number;
    angle: number;
    contactOffset: number;
    airborne: boolean;
    severityBias: number;
    variation: number;
  }): string {
    this.restart();
    const radians = settings.angle * Math.PI / 180;
    const state = this.physics.state;
    state.velocityX = Math.sin(radians) * settings.speed;
    state.velocityY = Math.cos(radians) * settings.speed;
    state.airborneHeight = settings.airborne ? 1.4 : 0;
    const context: ImpactContext = {
      seed: this.config.seed,
      obstacleId: 0x1ab000 + settings.variation,
      obstacleType: settings.obstacleType,
      obstacleRadius: settings.obstacleType === 'tree' ? 1.12 : 0.9,
      speed: settings.speed * settings.severityBias,
      velocityX: state.velocityX,
      velocityY: state.velocityY,
      facing: state.facing,
      carve: state.carve,
      airborneHeight: state.airborneHeight,
      normalX: -Math.sin(radians) * (1 - Math.abs(settings.contactOffset) * 0.65) +
        settings.contactOffset * 0.65,
      normalY: -Math.cos(radians) * (1 - Math.abs(settings.contactOffset) * 0.65),
      contactX: state.position.x,
      contactY: state.position.y + 0.8,
      contactOffset: settings.contactOffset,
      variation: settings.variation,
    };
    const normalLength = Math.max(0.001, Math.hypot(context.normalX, context.normalY));
    context.normalX /= normalLength;
    context.normalY /= normalLength;
    const reaction = selectCrashReaction(context);
    this.renderer.setImpactDebug(context, reaction);
    if (reaction.outcome === 'crash') this.physics.beginCrash(context, reaction);
    else this.physics.applyMinorImpact(context, reaction);
    return `${reaction.outcome} · ${reaction.family} · strength ${reaction.strength.toFixed(2)}`;
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
