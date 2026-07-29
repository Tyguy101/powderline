import type { MetricsSnapshot } from '../instrumentation/FrameMetrics';
import type { SkiState } from '../simulation/SkiPhysics';
import type { GameConfig } from '../app/config';

export class HUD {
  private readonly distance: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly debug: HTMLElement;
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
      <div class="hint"><kbd>A</kbd><kbd>D</kbd> carve <span>•</span> <kbd>W</kbd> brake <span>•</span> <kbd>S</kbd> tuck <span>•</span> drag in 8 directions${config.developmentMode ? ' <span>•</span> <kbd>G</kbd> poses' : ''}</div>
      <aside id="debug" class="debug" aria-live="polite"></aside>
      <div class="status-chip"><i></i> WEBGPU PROCEDURAL</div>`,
    );
    this.distance = root.querySelector('#distance')!;
    this.speed = root.querySelector('#speed')!;
    this.debug = root.querySelector('#debug')!;
    addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });
    this.debug.dataset.seed = String(config.seed);
  }

  update(
    state: Readonly<SkiState>,
    metrics: Readonly<MetricsSnapshot>,
    config: GameConfig,
    drawCalls: number,
    visibleFeatures: number,
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
CLIPMAP Δ <em>0 cells</em>
RES <em>${innerWidth} × ${innerHeight}</em>
QUALITY <em>${config.quality}</em>
WORLD <em>${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}</em>
SEED <em>${config.seed}</em>`;
  }
}
