import type { MetricsSnapshot } from '../instrumentation/FrameMetrics';
import type { SkiState } from '../simulation/SkiPhysics';
import type { GameConfig } from '../app/config';
import { BUILD_ID } from '../app/build';
import type { NpcMetrics } from '../simulation/NpcSystem';
import type { InputMethod, TouchActionElements, TouchDiagnostics } from '../input/InputManager';

export class HUD {
  private readonly distance: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly keyboardHint: HTMLElement;
  private readonly controllerHint: HTMLElement;
  private readonly touchHint: HTMLElement;
  private readonly controllerToast: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly brakeButton: HTMLButtonElement;
  private readonly tuckButton: HTMLButtonElement;
  private readonly touchDebug: HTMLElement;
  private readonly touchDebugOrigin: HTMLElement;
  private readonly touchDebugCurrent: HTMLElement;
  private readonly touchDebugVector: HTMLElement;
  private controllerConnected = false;
  private inputMethod: InputMethod = navigator.maxTouchPoints > 0 ? 'touch' : 'keyboard';
  private toastTimer = 0;
  private lastDistance = -1;
  private lastSpeed = -1;
  private debugCountdown = 0;
  private debugVisible = new URLSearchParams(location.search).has('debug');

  constructor(root: HTMLElement, config: GameConfig, onPauseToggle: () => void) {
    root.classList.toggle('touch-controls-legacy', config.mobileTouchScheme === 'drag');
    root.insertAdjacentHTML(
      'beforeend',
      `<header class="hud" aria-label="Run information">
        <div class="brand"><span class="brand-mark">P</span><span>POWDERLINE</span></div>
        <div class="readouts">
          <div><span class="label">DESCENT</span><strong id="distance">0 m</strong></div>
          <div><span class="label">SPEED</span><strong id="speed">0 km/h</strong></div>
        </div>
      </header>
      <div class="hint">
        <span data-keyboard-help><kbd>A</kbd><kbd>D</kbd> carve <i>•</i> <kbd>W</kbd> brake <i>•</i> <kbd>S</kbd> tuck <i>•</i> drag in 8 directions${config.developmentMode ? ' <i>•</i> <kbd>G</kbd> poses' : ''}</span>
        <span data-touch-help hidden>${config.mobileTouchScheme === 'split'
          ? 'Left thumb carves <i>•</i> hold BRAKE or TUCK with your right thumb'
          : 'Drag sideways to carve <i>•</i> up to brake <i>•</i> down to tuck'}</span>
        <span data-controller-help hidden>Left stick steer/up brake/down tuck <i>•</i> triggers brake/tuck <i>•</i> Menu pause <i>•</i> primary confirm <i>•</i> top face restart</span>
      </div>
      <div class="touch-actions" aria-label="Touch speed controls">
        <button class="touch-action touch-action--brake" type="button"><span>BRAKE</span><small>SLOW / PLOW</small></button>
        <button class="touch-action touch-action--tuck" type="button"><span>TUCK</span><small>MAX SPEED</small></button>
      </div>
      <div class="touch-debug${config.touchDebugMode ? ' visible' : ''}" aria-hidden="true">
        <i data-touch-origin></i><i data-touch-current></i><b data-touch-vector></b>
      </div>
      <button class="mobile-pause" type="button" aria-label="Pause game">Pause</button>
      <div class="controller-toast" role="status" aria-live="polite"></div>
      <section class="pause-overlay" aria-label="Game paused">
        <div><span>PAUSED</span><strong>Fresh tracks, whenever you are.</strong>
        <p>Use the button below, a controller confirm, <kbd>P</kbd>, or <kbd>Esc</kbd> to continue.</p>
        <button data-resume type="button">Continue run</button></div>
      </section>
      <aside id="debug" class="debug" aria-live="polite"></aside>
      <div class="status-chip"><i></i> WEBGPU PROCEDURAL <span>BUILD ${BUILD_ID}</span></div>`,
    );
    this.distance = root.querySelector('#distance')!;
    this.speed = root.querySelector('#speed')!;
    this.debug = root.querySelector('#debug')!;
    this.keyboardHint = root.querySelector('[data-keyboard-help]')!;
    this.touchHint = root.querySelector('[data-touch-help]')!;
    this.controllerHint = root.querySelector('[data-controller-help]')!;
    this.controllerToast = root.querySelector('.controller-toast')!;
    this.pauseOverlay = root.querySelector('.pause-overlay')!;
    this.pauseButton = root.querySelector('.mobile-pause')!;
    this.brakeButton = root.querySelector('.touch-action--brake')!;
    this.tuckButton = root.querySelector('.touch-action--tuck')!;
    this.touchDebug = root.querySelector('.touch-debug')!;
    this.touchDebugOrigin = root.querySelector('[data-touch-origin]')!;
    this.touchDebugCurrent = root.querySelector('[data-touch-current]')!;
    this.touchDebugVector = root.querySelector('[data-touch-vector]')!;
    this.pauseButton.addEventListener('click', onPauseToggle);
    root.querySelector('[data-resume]')!.addEventListener('click', onPauseToggle);
    addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });
    this.debug.dataset.seed = String(config.seed);
    this.updateHelp();
  }

  setControllerConnected(connected: boolean): void {
    this.controllerConnected = connected;
    this.updateHelp();
    this.controllerToast.textContent = connected
      ? 'Controller connected'
      : 'Controller disconnected';
    this.controllerToast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.controllerToast.classList.remove('visible');
    }, 2200);
  }

  setInputMethod(method: InputMethod): void {
    this.inputMethod = method;
    this.updateHelp();
  }

  setPaused(paused: boolean): void {
    this.pauseOverlay.classList.toggle('visible', paused);
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  }

  get touchActionElements(): TouchActionElements {
    return { brake: this.brakeButton, tuck: this.tuckButton };
  }

  updateTouchDiagnostics(diagnostics: Readonly<TouchDiagnostics>): void {
    if (!this.touchDebug.classList.contains('visible')) return;
    this.touchDebug.classList.toggle('active', diagnostics.steeringActive);
    this.touchDebug.dataset.steer = diagnostics.steer.toFixed(2);
    this.touchDebug.dataset.action = diagnostics.action;
    this.touchDebugOrigin.style.transform = `translate3d(${diagnostics.originX}px, ${diagnostics.originY}px, 0)`;
    this.touchDebugCurrent.style.transform = `translate3d(${diagnostics.currentX}px, ${diagnostics.currentY}px, 0)`;
    const deltaX = diagnostics.currentX - diagnostics.originX;
    const deltaY = diagnostics.currentY - diagnostics.originY;
    const length = Math.hypot(deltaX, deltaY);
    const angle = Math.atan2(deltaY, deltaX);
    this.touchDebugVector.style.width = `${length}px`;
    this.touchDebugVector.style.transform = `translate3d(${diagnostics.originX}px, ${diagnostics.originY}px, 0) rotate(${angle}rad)`;
  }

  private updateHelp(): void {
    this.controllerHint.hidden = !this.controllerConnected;
    this.touchHint.hidden = this.controllerConnected || this.inputMethod !== 'touch';
    this.keyboardHint.hidden = this.controllerConnected || this.inputMethod === 'touch';
  }

  update(
    state: Readonly<SkiState>,
    metrics: Readonly<MetricsSnapshot>,
    config: GameConfig,
    drawCalls: number,
    visibleFeatures: number,
    npcMetrics: Readonly<NpcMetrics>,
    diagnostics: Readonly<Record<string, number | string>>,
  ): void {
    const distance = Math.floor(state.position.y);
    const speed = Math.round(Math.hypot(state.velocityX, state.velocityY) * 3.6);
    if (distance !== this.lastDistance) {
      this.distance.textContent = `${distance} m`;
      this.lastDistance = distance;
    }
    if (speed !== this.lastSpeed) {
      this.speed.textContent = `${speed} km/h`;
      this.lastSpeed = speed;
    }
    this.debug.classList.toggle('visible', this.debugVisible);
    if (!this.debugVisible) return;
    this.debugCountdown -= 1;
    if (this.debugCountdown > 0) return;
    this.debugCountdown = 12;
    this.debug.innerHTML = `<b>FRAME METRICS</b>
FPS <em>${metrics.fps.toFixed(1)}</em>
AVG <em>${metrics.averageMs.toFixed(2)} ms</em>
P95 / P99 <em>${metrics.p95Ms.toFixed(1)} / ${metrics.p99Ms.toFixed(1)} ms</em>
1% LOW <em>${metrics.onePercentLowFps.toFixed(1)} fps</em>
LONG &gt;25 / &gt;50 <em>${metrics.longFrames25ms} / ${metrics.longFrames50ms}</em>
SIM <em>${Number(diagnostics.simulationAverageMs ?? 0).toFixed(3)} ms</em>
COLLISION <em>${Number(diagnostics.collisionAverageMs ?? 0).toFixed(3)} ms</em>
TRAIL CPU <em>${Number(diagnostics.trailAverageMs ?? 0).toFixed(3)} ms</em>
RENDER PREP <em>${Number(diagnostics.renderPreparationAverageMs ?? 0).toFixed(3)} ms</em>
NPC PREP <em>${Number(diagnostics.npcRenderPreparationAverageMs ?? 0).toFixed(3)} ms</em>
SUBMIT CPU <em>${Number(diagnostics.submissionCpuAverageMs ?? 0).toFixed(3)} ms</em>
DRAWS <em>${drawCalls}</em>
FEATURES <em>~${visibleFeatures} visible</em>
NPCS <em>${npcMetrics.active} / 5 active</em>
NPC SIM <em>${npcMetrics.simulationMs.toFixed(3)} ms</em>
CANVAS <em>${diagnostics.canvasPixelWidth ?? 0} × ${diagnostics.canvasPixelHeight ?? 0}</em>
PIXELS <em>${(Number(diagnostics.canvasPixels ?? 0) / 1_000_000).toFixed(2)} MP</em>
DPR <em>${Number(diagnostics.devicePixelRatio ?? devicePixelRatio).toFixed(2)} → ${Number(diagnostics.renderPixelRatio ?? 1).toFixed(2)}</em>
INPUT <em>${Number(diagnostics.inputSteer ?? 0).toFixed(2)} / ${diagnostics.inputBrake ?? 'false'} / ${diagnostics.inputTuck ?? 'false'}</em>
TOUCH <em>${diagnostics.mobileControlScheme ?? 'n/a'} · ${diagnostics.touchAction ?? 'neutral'}</em>
TOUCH XY <em>${Number(diagnostics.touchSteeringOriginX ?? 0).toFixed(0)},${Number(diagnostics.touchSteeringOriginY ?? 0).toFixed(0)} → ${Number(diagnostics.touchSteeringCurrentX ?? 0).toFixed(0)},${Number(diagnostics.touchSteeringCurrentY ?? 0).toFixed(0)}</em>
CAMERA <em>${diagnostics.cameraComposition ?? 'default'} · ${Number(diagnostics.effectiveCameraScale ?? 0).toFixed(1)}</em>
SKIER Y <em>${Number(diagnostics.skierScreenYPercent ?? 0).toFixed(1)}%</em>
CLIPMAP Δ <em>0 cells</em>
RES <em>${innerWidth} × ${innerHeight}</em>
QUALITY <em>${config.quality}</em>
WORLD <em>${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}</em>
SEED <em>${config.seed}</em>${diagnostics.section ? `
TRAIL <em>${diagnostics.section} · ${Number(diagnostics.sectionIndex) + 1}</em>
GATES <em>${diagnostics.cleanGates} clean · ${diagnostics.gateStreak} streak</em>
AVALANCHE <em>${diagnostics.avalanche}</em>` : ''}`;
    this.debug.dataset.build = BUILD_ID;
  }
}
