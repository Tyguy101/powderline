import { FixedStepLoop } from '../core/FixedStepLoop';
import { CameraRelativeOrigin } from '../core/WorldCoordinates';
import { GameRenderer } from '../gpu/Renderer';
import { FrameMetrics } from '../instrumentation/FrameMetrics';
import { InputManager } from '../input/InputManager';
import type { InputState } from '../input/InputState';
import { SkiPhysics, type SkiCheckpoint } from '../simulation/SkiPhysics';
import { CollisionSystem, SKIER_COLLISION_RADIUS } from '../simulation/CollisionSystem';
import { ReplaySystem, type ReplayCheckpoint } from '../simulation/ReplaySystem';
import { selectCrashReaction, type ImpactContext } from '../simulation/CrashReaction';
import { CrashOverlay } from '../ui/CrashOverlay';
import { HUD } from '../ui/HUD';
import { PoseGallery } from '../ui/PoseGallery';
import { CrashLab } from '../ui/CrashLab';
import { NpcLab } from '../ui/NpcLab';
import { NpcSystem } from '../simulation/NpcSystem';
import { BUILD_ID } from './build';
import { newRunSeed, type GameConfig } from './config';
import { TimingCounter } from '../instrumentation/PerformanceCounters';
import { LifecycleManager } from './LifecycleManager';
import { MountainRun } from '../simulation/MountainRun';
import { MountainHUD } from '../ui/MountainHUD';
import { hitsJumpObstacle, jumpAtLip, laneAt, pathCenter, pathHalfWidth, patrolMedian, skiBand } from '../world/EndlessMountain';
import { BOULDER_SPEED, patrolSplitAt } from '../world/RouteExpansion';

export class Game {
  private readonly physics = new SkiPhysics();
  private readonly metrics = new FrameMetrics();
  private readonly origin: CameraRelativeOrigin;
  private readonly input: InputManager;
  private readonly hud: HUD;
  private readonly renderer: GameRenderer;
  private readonly collision: CollisionSystem;
  private readonly replay: ReplaySystem;
  private readonly npcs: NpcSystem;
  private readonly crashOverlay: CrashOverlay;
  private readonly loop: FixedStepLoop;
  private readonly mountain?: MountainRun;
  private readonly mountainHUD?: MountainHUD;
  private readonly before = { x: 0, y: 0 };
  private checkpoint?: {
    ski: SkiCheckpoint;
    npcs: ReturnType<NpcSystem['checkpoint']>;
    replay: ReplayCheckpoint;
  };
  private readonly collisionsEnabled: boolean;
  private readonly npcSimulationEnabled: boolean;
  private poseInspectionActive = false;
  private npcInspectionActive = false;
  private crashPromptShown = false;
  private labCrash = false;
  private paused = false;
  private renderWhilePaused = true;
  private readonly simulationTiming = new TimingCounter();
  private readonly collisionTiming = new TimingCounter();
  private readonly trailTiming = new TimingCounter();
  private readonly publicMetrics: Record<string, number | string> = {};
  private metricsPublishCountdown = 0;
  private simulationInput: Readonly<InputState> = {
    steer: 0,
    brake: false,
    tuck: false,
  };

  constructor(
    root: HTMLElement,
    private readonly config: GameConfig,
  ) {
    root.innerHTML = `<main class="game-shell">
      <canvas id="game-canvas" aria-label="Procedural downhill skiing game"></canvas>
      <div class="vignette"></div>
    </main>`;
    const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas')!;
    this.mountain = config.mountain ? new MountainRun(config.seed, config.mountain) : undefined;
    this.collisionsEnabled = config.mountain?.collisions ?? !config.performance.disabled.has('collisions');
    this.npcSimulationEnabled = config.mountain?.npcSimulation ?? !config.performance.disabled.has('npcSim');
    this.renderer = new GameRenderer(
      canvas,
      config.seed,
      config.cameraTestMode,
      config.performance,
      config.mobileCameraMode,
      this.mountain,
    );
    this.collision = new CollisionSystem(config.seed, this.mountain);
    this.replay = new ReplaySystem(config.seed, config.replay, config.mountain ?? undefined);
    this.npcs = new NpcSystem(
      config.seed,
      config.mountain?.npcCount ?? (config.quality === 'low' || config.quality === 'potato' ? 3 : 5),
      this.mountain,
    );
    this.hud = new HUD(root, config, () => this.setPaused(!this.paused));
    if (this.mountain) this.mountainHUD = new MountainHUD(root, this.mountain, this.renderer.view);
    this.input = new InputManager(
      canvas,
      undefined,
      (method) => this.hud.setInputMethod(method),
      undefined,
      this.hud.touchActionElements,
      config.mobileTouchScheme,
    );
    this.crashOverlay = new CrashOverlay(root, () => this.restartAtTop(),
      this.mountain ? () => this.retrySection() : undefined);
    root.classList.toggle('performance-ui-disabled', config.performance.disabled.has('ui'));
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
        () => this.retrySection(),
        config.crashLabMode,
      );
      new NpcLab(
        root,
        (settings) => {
          this.npcInspectionActive = settings.active;
          this.npcs.setLab(settings.active, settings.type, settings.pose, settings.fall);
        },
        config.npcLabMode,
      );
    }
    this.origin = new CameraRelativeOrigin(config.rebaseDistance);
    globalThis.__POWDERLINE_TRIGGER_JUMP__ = config.developmentMode
      ? () => this.physics.beginJump()
      : undefined;
    globalThis.__POWDERLINE_REPLAY__ = config.developmentMode ? () => this.replay.serialize() : undefined;
    globalThis.__POWDERLINE_RIDERS__ = config.developmentMode ? () => this.npcs.states.filter((npc) => npc.active)
      .map(({ x, y, velocityY, slot, type }) => ({ x, y, velocityY, slot, type })) : undefined;
    this.loop = new FixedStepLoop(
      config.fixedStepSeconds,
      config.maxFrameSeconds,
      (delta) => {
        const simulationStarted = performance.now();
        this.input.pollGamepads();
        if (this.input.consumePause()) this.setPaused(!this.paused);
        const confirm = this.input.consumeConfirm();
        if (confirm && this.paused) this.setPaused(false);
        if (
          (this.input.consumeRestart() || (confirm && this.physics.state.crashed)) &&
          this.physics.state.crashed
        ) {
          this.retrySection();
        }
        if (!this.paused && !this.poseInspectionActive) {
          const replayInput = this.physics.state.crashed || this.config.performance.disabled.has('replay')
            ? this.input.state
            : this.replay.sample(this.input.state);
          this.simulationInput = replayInput;
          const state = this.physics.state;
          if (this.mountain) {
            this.before.x = state.position.x;
            this.before.y = state.position.y;
          }
          if (!this.npcInspectionActive) {
            this.physics.step(delta, replayInput, this.mountain?.downhillMultiplier(state.position.y));
          }
          if (this.npcSimulationEnabled) {
            this.npcs.step(delta, this.physics.state);
          }
          const collisionStarted = performance.now();
          if (
            this.collisionsEnabled &&
            !this.physics.state.crashed &&
            !this.physics.state.airborne &&
            this.physics.canCollide()
          ) {
            const wall = this.collision.queryWall(state);
            const hit = wall ?? this.collision.query(state);
            if (!hit && this.mountain && jumpAtLip(this.mountain.section, this.before, state.position)) {
              this.physics.beginJump();
            } else if (hit && hit.feature.type !== 'none') {
              if (hit.feature.type === 'ramp') {
                this.physics.beginJump();
              } else {
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
          }
          if (
            this.collisionsEnabled &&
            !this.npcInspectionActive &&
            !this.physics.state.crashed &&
            this.physics.canCollide()
          ) {
            const npcHit = this.npcs.queryPlayerContact(this.physics.state);
            if (npcHit) {
              const state = this.physics.state;
              const context: ImpactContext = {
                seed: this.config.seed,
                obstacleId: 0x4e500000 + npcHit.npc.slot * 4096 + npcHit.npc.generation,
                obstacleType: 'rock',
                obstacleRadius: 0.66,
                speed: npcHit.relativeSpeed,
                velocityX: state.velocityX - npcHit.npc.velocityX,
                velocityY: state.velocityY - npcHit.npc.velocityY,
                facing: state.facing,
                carve: state.carve,
                airborneHeight: state.airborneHeight,
                normalX: npcHit.normalX,
                normalY: npcHit.normalY,
                contactX: npcHit.npc.x + npcHit.normalX * 0.66,
                contactY: npcHit.npc.y + npcHit.normalY * 0.66,
                contactOffset: npcHit.glancing ? Math.sign(state.carve || 1) * 0.78 : 0,
              };
              const reaction = selectCrashReaction(context);
              if (npcHit.severity > 0.62 && reaction.outcome === 'crash') {
                this.physics.beginCrash(context, reaction);
              } else {
                this.physics.applyMinorImpact(context, reaction);
              }
            }
          }
          this.collisionTiming.push(performance.now() - collisionStarted);
          if (this.mountain && !state.crashed && !this.npcInspectionActive) {
            if (this.mountain.expansion.timer === 'running' &&
                Math.abs(state.position.x - pathCenter(this.mountain.section, state.position.y)) >
                pathHalfWidth(this.mountain.section, state.position.y)) this.mountain.expansion.outsideCourse = true;
            this.keepInsidePiste();
            if (this.collisionsEnabled && hitsJumpObstacle(this.mountain.section, state.position, state.airborneHeight)) {
              this.physics.crash();
            } else {
              const outcome = this.mountain.advance(this.before, state.position, state.airborne, delta,
                state.velocityY, this.collisionsEnabled, replayInput);
              if (outcome === 'caught' || outcome === 'ice' || outcome === 'boulder') this.physics.crash();
              if (outcome === 'transition') this.saveCheckpoint();
            }
          } else {
            this.mountain?.driftAfterCrash(delta);
          }
          if (this.mountain && this.npcSimulationEnabled) this.npcs.engulf(this.mountain);
          if (
            this.physics.state.crashed &&
            !this.crashPromptShown &&
            this.physics.state.crash.elapsed >= this.physics.state.crash.duration
          ) {
            this.crashPromptShown = true;
            const replayAvailable = !this.labCrash && !this.config.performance.disabled.has('replay');
            this.crashOverlay.show(
              this.physics.state.position.y,
              replayAvailable ? this.replay.serialize() : '',
              this.physics.state.crash.family,
              this.mountain?.avalanche === 'caught',
              replayAvailable ? undefined : 'Replay unavailable for this run.',
              this.mountain?.expansion.impact,
            );
          }
          if (!this.config.performance.disabled.has('trails')) {
            const trailStarted = performance.now();
            this.renderer.recordTrail(this.physics.state, delta);
            this.trailTiming.push(performance.now() - trailStarted);
          }
        }
        this.renderer.updateCamera(this.physics.state, delta);
        this.simulationTiming.push(performance.now() - simulationStarted);
      },
      (_alpha, frameMs) => this.render(frameMs),
    );
  }

  private saveCheckpoint(): void {
    this.checkpoint = { ski: this.physics.checkpoint(), npcs: this.npcs.checkpoint(), replay: this.replay.checkpoint() };
  }

  private keepInsidePiste(): void {
    const { position } = this.physics.state;
    const section = this.mountain?.sectionAt(position.y) ?? this.mountain?.section;
    if (!section) return;
    const y = Math.min(position.y, section.end);
    const band = skiBand(section, position.x, y);
    const corrected = Math.max(band.left + SKIER_COLLISION_RADIUS,
      Math.min(band.right - SKIER_COLLISION_RADIUS, position.x));
    if (position.x !== corrected) {
      if ((position.x - corrected) * this.physics.state.velocityX > 0) this.physics.state.velocityX = 0;
      position.x = corrected;
    }
  }

  private restartAtTop(): void {
    if (!this.mountain) {
      this.retrySection();
      return;
    }
    const url = new URL(location.href);
    for (const key of ['replay', 'course', 'section', 'scenario']) url.searchParams.delete(key);
    url.hash = '';
    const candidate = newRunSeed();
    url.searchParams.set('seed', String(candidate === this.config.seed ? (candidate + 1) >>> 0 : candidate));
    location.assign(url);
  }

  private retrySection(): void {
    this.setPaused(false);
    this.input.resetTransientState();
    if (this.mountain && this.checkpoint) {
      this.mountain.retry();
      this.physics.restore(this.checkpoint.ski);
      this.replay.restore(this.checkpoint.replay);
      this.npcs.restore(this.checkpoint.npcs);
    } else {
      this.physics.reset();
      this.replay.reset();
      this.npcs.reset(this.physics.state);
    }
    this.origin.reset(this.physics.state.position);
    this.renderer.resetCamera(this.physics.state);
    this.renderer.resetTrail(this.physics.state);
    this.crashOverlay.hide();
    this.crashPromptShown = false;
    this.labCrash = false;
    this.renderer.clearImpactDebug();
  }

  private setPaused(paused: boolean): void {
    if (paused && this.crashPromptShown) return;
    this.paused = paused;
    this.renderWhilePaused = true;
    if (paused) this.input.resetTransientState();
    else this.loop.resetClock();
    this.hud.setPaused(paused, this.physics.state, this.mountain);
    this.publicMetrics.paused = String(paused);
    this.publicMetrics.worldX = this.physics.state.position.x;
    this.publicMetrics.worldY = this.physics.state.position.y;
    globalThis.__POWDERLINE_METRICS__ = this.publicMetrics;
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
    this.retrySection();
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
    if (reaction.outcome === 'crash') {
      this.labCrash = true;
      this.physics.beginCrash(context, reaction);
    }
    else this.physics.applyMinorImpact(context, reaction);
    return `${reaction.outcome} · ${reaction.family} · strength ${reaction.strength.toFixed(2)}`;
  }

  async start(): Promise<void> {
    await this.renderer.initialize();
    if (this.mountain) {
      Object.assign(this.physics.state.position, this.mountain.spawn);
      this.renderer.resetCamera(this.physics.state);
      this.renderer.resetTrail(this.physics.state);
      this.origin.reset(this.physics.state.position);
    }
    this.npcs.reset(this.physics.state);
    if (this.mountain) this.saveCheckpoint();
    document.body.classList.add('ready');
    this.loop.start();
    new LifecycleManager({
      clearInput: () => this.input.resetTransientState(),
      suspend: () => this.loop.stop(),
      resume: () => {
        this.loop.resetClock();
        this.loop.start();
        this.renderWhilePaused = true;
      },
      viewportChanged: () => {
        this.renderer.resizeToViewport();
        this.renderWhilePaused = true;
      },
    });
  }

  private render(frameMs: number): void {
    const state = this.physics.state;
    this.origin.update(state.position);
    const snapshot = this.metrics.push(frameMs);
    const touchDiagnostics = this.input.touchDiagnostics;
    this.hud.updateTouchDiagnostics(touchDiagnostics);
    if (!this.paused || this.renderWhilePaused) {
      this.renderer.draw(state, this.simulationInput, this.origin.origin, this.npcs.states);
      const encounter = this.mountainHUD?.update(state) ?? null;
      this.hud.updateCue(this.paused ? null : encounter);
      this.renderWhilePaused = false;
    }
    this.metricsPublishCountdown -= 1;
    if (this.metricsPublishCountdown <= 0) {
      this.metricsPublishCountdown = this.config.qaTelemetry ? 1 : 10;
      Object.assign(this.publicMetrics, snapshot, {
      worldX: state.position.x,
      worldY: state.position.y,
      seed: this.config.seed,
      quality: this.config.quality,
      build: BUILD_ID,
      crashed: String(state.crashed),
      crashFamily: state.crashed ? state.crash.family : 'none',
      drawCalls: this.renderer.drawCalls,
      airborne: String(state.airborne),
      jumpHeight: state.airborneHeight,
      jumpDistance: state.jump.distance,
      completedJumpDistance: state.jump.completedDistance,
      trackSamples: this.renderer.trackSampleCount,
      paused: String(this.paused),
      gamepad: String(this.input.controllerConnected),
      inputSteer: this.input.state.steer,
      inputBrake: String(this.input.state.brake),
      inputTuck: String(this.input.state.tuck),
      mobileControlScheme: touchDiagnostics.scheme,
      touchSteeringActive: String(touchDiagnostics.steeringActive),
      touchSteeringOriginX: touchDiagnostics.originX,
      touchSteeringOriginY: touchDiagnostics.originY,
      touchSteeringCurrentX: touchDiagnostics.currentX,
      touchSteeringCurrentY: touchDiagnostics.currentY,
      touchAction: touchDiagnostics.action,
      cameraComposition: this.renderer.mobileComposition,
      skierScreenYPercent: this.renderer.skierScreenYPercent(state),
      downhillSightMeters: this.renderer.view.y + this.renderer.view.height / 2 - state.position.y,
      effectiveCameraScale: this.renderer.effectiveCameraScale,
      visibility: document.visibilityState,
      orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
      npcActive: this.npcs.metrics.active,
      npcVisible: this.renderer.visibleRiders,
      npcRecycled: this.npcs.metrics.recycled,
      npcSimulationMs: this.npcs.metrics.simulationMs,
      simulationAverageMs: this.simulationTiming.snapshot.averageMs,
      collisionAverageMs: this.collisionTiming.snapshot.averageMs,
      trailAverageMs: this.trailTiming.snapshot.averageMs,
      renderPreparationAverageMs: this.renderer.preparationTiming.snapshot.averageMs,
      npcRenderPreparationAverageMs: this.renderer.npcRenderTiming.snapshot.averageMs,
      submissionCpuAverageMs: this.renderer.submissionTiming.snapshot.averageMs,
      canvasPixelWidth: this.renderer.canvasPixelWidth,
      canvasPixelHeight: this.renderer.canvasPixelHeight,
      canvasPixels: this.renderer.canvasPixelWidth * this.renderer.canvasPixelHeight,
      renderPixelRatio: this.renderer.pixelRatio,
      devicePixelRatio,
      disabledSubsystems: [...this.config.performance.disabled].join(',') || 'none',
      fixedStepsLastFrame: this.loop.latestStepCount,
      fixedStepsPeak: this.loop.peakStepCount,
      });
      if (this.mountain) {
        const { section, previous, lastLane, gateIndex, gateStreak, gateOutcome, cleanGates, avalanche, front } = this.mountain;
        const gate = section.gates[gateIndex];
        const expansion = this.mountain.expansion;
        const { timed, bowlReveal, boulders, ice } = section.expansion;
        const flag = timed?.flags[expansion.flagIndex];
        const split = patrolSplitAt(section, state.position.y);
        const nextSplit = split ?? section.expansion.patrol.find((item) => item.entry > state.position.y);
        const median = split ? patrolMedian(section, state.position.y) : null;
        const rolling = expansion.boulder ?? boulders.find((item) => item.start >= state.position.y);
        const iceTarget = expansion.ice ?? ice.find((item) => item.warningAt >= state.position.y);
        Object.assign(this.publicMetrics, {
          section: section.trail, sectionId: section.id, sectionIndex: section.index,
          sectionStart: section.start, sectionEnd: section.end, sectionCenter: section.center,
          sectionDistance: state.position.y - section.start, sectionVariant: section.variant,
          forkLane: laneAt(section, state.position.x), lastLane: lastLane ?? 'none',
          leftTrail: section.offers[0]!.trail, straightTrail: section.offers[1]!.trail, rightTrail: section.offers[2]!.trail,
          gateIndex, gateStreak, gateOutcome, cleanGates, nextGateX: gate?.x ?? 0, nextGateY: gate?.y ?? 0,
          avalanche, avalancheFront: front, wave: this.mountain.waveIndex, wavesCleared: this.mountain.wavesCleared,
          waveCount: section.waves.length, safeSide: this.mountain.wave?.safeSide ?? 0,
          safeEdge: this.mountain.wave?.safeEdge ?? 0, waveTrigger: this.mountain.wave?.trigger ?? 0,
          npcEngulfments: this.mountain.npcEngulfments,
          npcEngulfedVisible: String(this.npcs.states.some((npc) =>
            npc.active && npc.fall !== 'none' && npc.avalancheHit === this.mountain!.waveKey &&
            Math.abs(npc.y - this.renderer.view.y) < this.renderer.view.height / 2 - 4 &&
            Math.abs(npc.x - this.renderer.view.x) < this.renderer.view.width / 2 - 4)),
          gladeY: section.glade?.y ?? 0, gladeSide: section.glade?.relaxedSide ?? 0,
          pisteCenter: pathCenter(section, state.position.y), pisteHalfWidth: pathHalfWidth(section, state.position.y),
          pisteAheadX: pathCenter(section, state.position.y + 20),
          pisteGuideX: pathCenter(section, state.position.y + Math.min(16, state.velocityY * 0.59 + 3)),
          pisteAheadWidth: pathHalfWidth(section, state.position.y + 18),
          retainedSections: previous ? 2 : 1, replayRuns: this.replay.recordingRuns,
          velocityX: state.velocityX, velocityY: state.velocityY,
          jumpSequence: state.jump.sequence,
          bowlReveal: bowlReveal ?? 0,
          patrolLane: expansion.patrolLane, patrolMerges: expansion.patrolMerges,
          patrolEntryY: nextSplit?.entry ?? 0, patrolMergeY: nextSplit?.merge ?? 0,
          patrolMedianX: median?.x ?? section.center, patrolMedianWidth: median?.width ?? 0,
          timer: expansion.timer, timedMs: Math.round(expansion.time * 1000),
          timedStartY: timed?.start ?? 0, timedFinishY: timed?.finish ?? 0,
          timedFlags: expansion.flagIndex, timedFlagCount: timed?.flags.length ?? 0, timedMisses: expansion.flagMisses,
          timedOutside: String(expansion.outsideCourse),
          timedAim: flag ? flag.x + flag.passSide * 5.8 : section.center, timedFlagY: flag?.y ?? 0,
          boulderActive: String(!!expansion.boulder), boulderStartY: rolling?.start ?? 0,
          boulderSpeed: section.trail === 'hazards' ? BOULDER_SPEED : 0,
          boulderX: expansion.boulder ? expansion.rockX : rolling?.x ?? 0, boulderY: expansion.rockY,
          boulderPasses: expansion.boulderPasses, icePasses: expansion.icePasses,
          iceActive: String(!!expansion.ice), iceX: iceTarget?.x ?? 0, iceY: iceTarget?.y ?? 0,
          iceWarningY: iceTarget?.warningAt ?? 0, iceTime: expansion.iceTime, hazardImpact: expansion.impact ?? 'none',
        });
      }
      globalThis.__POWDERLINE_METRICS__ = this.publicMetrics;
    }
    this.hud.update(
      state,
      snapshot,
      this.config,
      this.renderer.drawCalls,
      this.renderer.visibleFeatureEstimate,
      this.npcs.metrics,
      this.publicMetrics,
    );
  }
}

declare global {
  var __POWDERLINE_METRICS__: Record<string, number | string> | undefined;
  var __POWDERLINE_TRIGGER_JUMP__: (() => void) | undefined;
  var __POWDERLINE_REPLAY__: (() => string) | undefined;
  var __POWDERLINE_RIDERS__: (() => Array<{ x: number; y: number; velocityY: number; slot: number; type: string }>) | undefined;
}
