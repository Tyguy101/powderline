import type { MetricsSnapshot } from '../instrumentation/FrameMetrics';
import type { SkiState } from '../simulation/SkiPhysics';
import type { GameConfig } from '../app/config';
import { BUILD_ID } from '../app/build';
import type { NpcMetrics } from '../simulation/NpcSystem';

export class HUD {
  private readonly distance: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly keyboardHint: HTMLElement;
  private readonly controllerHint: HTMLElement;
  private readonly controllerToast: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private toastTimer = 0;
  private debugVisible = new URLSearchParams(location.search).has('debug');

  constructor(root: HTMLElement, config: GameConfig) {
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
        <span data-controller-help hidden>Left stick steer/up brake/down tuck <i>•</i> triggers brake/tuck <i>•</i> Menu pause <i>•</i> primary confirm <i>•</i> top face restart</span>
      </div>
      <div class="controller-toast" role="status" aria-live="polite"></div>
      <section class="pause-overlay" aria-label="Game paused">
        <div><span>PAUSED</span><strong>Fresh tracks, whenever you are.</strong>
        <p>Press the Menu button, primary button, <kbd>P</kbd>, or <kbd>Esc</kbd> to continue.</p></div>
      </section>
      <aside id="debug" class="debug" aria-live="polite"></aside>
      <div class="status-chip"><i></i> WEBGPU PROCEDURAL <span>BUILD ${BUILD_ID}</span></div>`,
    );
    this.distance = root.querySelector('#distance')!;
    this.speed = root.querySelector('#speed')!;
    this.debug = root.querySelector('#debug')!;
    this.keyboardHint = root.querySelector('[data-keyboard-help]')!;
    this.controllerHint = root.querySelector('[data-controller-help]')!;
    this.controllerToast = root.querySelector('.controller-toast')!;
    this.pauseOverlay = root.querySelector('.pause-overlay')!;
    addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });
    this.debug.dataset.seed = String(config.seed);
  }

  setControllerConnected(connected: boolean): void {
    this.keyboardHint.hidden = connected;
    this.controllerHint.hidden = !connected;
    this.controllerToast.textContent = connected
      ? 'Controller connected'
      : 'Controller disconnected';
    this.controllerToast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.controllerToast.classList.remove('visible');
    }, 2200);
  }

  setPaused(paused: boolean): void {
    this.pauseOverlay.classList.toggle('visible', paused);
  }

  update(
    state: Readonly<SkiState>,
    metrics: Readonly<MetricsSnapshot>,
    config: GameConfig,
    drawCalls: number,
    visibleFeatures: number,
    npcMetrics: Readonly<NpcMetrics>,
  ): void {
    this.distance.textContent = `${Math.floor(state.position.y)} m`;
    this.speed.textContent = `${Math.round(Math.hypot(state.velocityX, state.velocityY) * 3.6)} km/h`;
    this.debug.classList.toggle('visible', this.debugVisible);
    if (!this.debugVisible) return;
    this.debug.innerHTML = `<b>FRAME METRICS</b>
FPS <em>${metrics.fps.toFixed(1)}</em>
AVG <em>${metrics.averageMs.toFixed(2)} ms</em>
1% LOW <em>${metrics.onePercentLowFps.toFixed(1)} fps</em>
SIM <em>60 Hz fixed</em>
SUBMIT <em>browser timed</em>
DRAWS <em>${drawCalls}</em>
FEATURES <em>~${visibleFeatures} visible</em>
NPCS <em>${npcMetrics.active} / 5 active</em>
NPC SIM <em>${npcMetrics.simulationMs.toFixed(3)} ms</em>
CLIPMAP Δ <em>0 cells</em>
RES <em>${innerWidth} × ${innerHeight}</em>
QUALITY <em>${config.quality}</em>
WORLD <em>${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}</em>
SEED <em>${config.seed}</em>`;
    this.debug.dataset.build = BUILD_ID;
  }
}
