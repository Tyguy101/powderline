import type { MetricsSnapshot } from '../instrumentation/FrameMetrics';
import type { SkiState } from '../simulation/SkiPhysics';
import type { GameConfig } from '../app/config';
import { BUILD_ID } from '../app/build';
import type { NpcMetrics } from '../simulation/NpcSystem';
import type { InputMethod, TouchActionElements, TouchDiagnostics } from '../input/InputManager';
import type { MountainRun } from '../simulation/MountainRun';
import { TRAILS } from '../world/EndlessMountain';

export interface RunCue {
  text: string;
  tone: 'warning' | 'race' | 'clock';
}

export class HUD {
  private readonly debug: HTMLElement;
  private readonly cue: HTMLElement;
  private readonly cueText: HTMLElement;
  private readonly pauseOverlay: HTMLDialogElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly brakeButton: HTMLButtonElement;
  private readonly tuckButton: HTMLButtonElement;
  private readonly touchDebug: HTMLElement;
  private readonly touchDebugOrigin: HTMLElement;
  private readonly touchDebugCurrent: HTMLElement;
  private readonly touchDebugVector: HTMLElement;
  private inputMethod: InputMethod = navigator.maxTouchPoints > 0 ? 'touch' : 'keyboard';
  private debugCountdown = 0;
  private debugVisible = new URLSearchParams(location.search).has('debug');
  private currentTone = '';

  constructor(root: HTMLElement, private readonly config: GameConfig, onPauseToggle: () => void) {
    root.classList.toggle('touch-controls-legacy', config.mobileTouchScheme === 'drag');
    root.insertAdjacentHTML(
      'beforeend',
      `<button class="mobile-pause" type="button" aria-label="Pause game" title="Pause game">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12M14 4v12"/></svg>
      </button>
      <div class="run-cue" hidden><span data-run-cue></span></div>
      <div class="touch-actions" aria-label="Touch speed controls">
        <button class="touch-action touch-action--brake" type="button">Brake</button>
        <button class="touch-action touch-action--tuck" type="button">Tuck</button>
      </div>
      <div class="touch-debug${config.touchDebugMode ? ' visible' : ''}" aria-hidden="true">
        <i data-touch-origin></i><i data-touch-current></i><b data-touch-vector></b>
      </div>
      <dialog class="pause-overlay" aria-labelledby="pause-title">
        <div class="pause-card">
          <header class="pause-header"><h1 id="pause-title">Paused</h1><button class="resume" data-resume type="button" autofocus>Resume</button></header>
          <section class="pause-run" aria-label="Current trail">
            <h2 data-pause-trail></h2>
            <p data-pause-details></p>
            <dl><div><dt>Descent</dt><dd data-pause-distance></dd></div>
              <div><dt>Speed</dt><dd data-pause-speed></dd></div>
              <div data-pause-race hidden><dt>Race</dt><dd></dd></div></dl>
            <button class="seed-share" type="button" data-seed></button>
            <span data-seed-status role="status"></span>
          </section>
          <section class="pause-controls" aria-labelledby="controls-title">
            <h2 id="controls-title">Controls</h2>
            <div role="group" aria-label="Input method">
              <button type="button" data-control="touch">Touch</button>
              <button type="button" data-control="keyboard">Keyboard &amp; mouse</button>
              <button type="button" data-control="gamepad">Controller</button>
            </div>
            <dl data-reference="touch">
              <div><dt>Carve</dt><dd>${config.mobileTouchScheme === 'split' ? 'Drag with your right thumb' : 'Drag sideways'}</dd></div>
              <div><dt>Slow or tuck</dt><dd>${config.mobileTouchScheme === 'split' ? 'Hold Brake or Tuck with your left thumb' : 'Drag up to brake or down to tuck'}</dd></div>
              <div><dt>Pause</dt><dd>Pause icon</dd></div>
            </dl>
            <dl data-reference="keyboard">
              <div><dt>Carve</dt><dd>A / D or ← / →</dd></div>
              <div><dt>Brake / tuck</dt><dd>W / S or ↑ / ↓</dd></div>
              <div><dt>Mouse</dt><dd>Drag sideways to carve, up to brake, down to tuck</dd></div>
              <div><dt>Pause / retry</dt><dd>P or Esc / R</dd></div>
              <div><dt>Diagnostics</dt><dd>F3${config.developmentMode ? ' · G for poses' : ''}</dd></div>
            </dl>
            <dl data-reference="gamepad">
              <div><dt>Carve</dt><dd>Left stick sideways</dd></div>
              <div><dt>Brake / tuck</dt><dd>Left / right trigger or bumper, or stick up / down</dd></div>
              <div><dt>Pause / resume</dt><dd>Menu / primary face button</dd></div>
              <div><dt>Retry</dt><dd>Top face button</dd></div>
            </dl>
          </section>
          <small class="pause-build">Build ${BUILD_ID}</small>
        </div>
      </dialog>
      <aside id="debug" class="debug"></aside>`,
    );
    this.debug = root.querySelector('#debug')!;
    this.cue = root.querySelector('.run-cue')!;
    this.cueText = root.querySelector('[data-run-cue]')!;
    this.pauseOverlay = root.querySelector('.pause-overlay')!;
    this.pauseButton = root.querySelector('.mobile-pause')!;
    this.brakeButton = root.querySelector('.touch-action--brake')!;
    this.tuckButton = root.querySelector('.touch-action--tuck')!;
    this.touchDebug = root.querySelector('.touch-debug')!;
    this.touchDebugOrigin = root.querySelector('[data-touch-origin]')!;
    this.touchDebugCurrent = root.querySelector('[data-touch-current]')!;
    this.touchDebugVector = root.querySelector('[data-touch-vector]')!;
    this.pauseButton.addEventListener('click', onPauseToggle);
    this.pauseOverlay.querySelector('[data-resume]')!.addEventListener('click', onPauseToggle);
    this.pauseOverlay.addEventListener('cancel', (event) => event.preventDefault());
    for (const button of this.pauseOverlay.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.addEventListener('click', () => this.showReference(button.dataset.control!));
    }
    this.pauseOverlay.querySelector('[data-seed]')!.addEventListener('click', () => void this.copySeed());
    addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
        this.debugCountdown = 0;
      }
    });
    this.debug.dataset.seed = String(config.seed);
  }

  setInputMethod(method: InputMethod): void {
    this.inputMethod = method;
  }

  updateCue(encounter: RunCue | null): void {
    const tone = encounter?.tone ?? '';
    if (tone !== this.currentTone) {
      this.currentTone = tone;
      this.cue.hidden = !tone;
      this.cue.dataset.tone = tone;
      this.cueText.setAttribute('aria-live', tone === 'clock' ? 'off' : 'polite');
    }
    if (encounter && this.cueText.textContent !== encounter.text) this.cueText.textContent = encounter.text;
  }

  setPaused(paused: boolean, state: Readonly<SkiState>, run?: MountainRun): void {
    if (paused === this.pauseOverlay.open) return;
    if (!paused) {
      this.pauseOverlay.classList.remove('visible');
      this.pauseOverlay.close();
      return;
    }
    this.updateCue(null);
    this.showReference(this.inputMethod === 'pointer' ? 'keyboard' : this.inputMethod);
    const trail = run ? TRAILS[run.section.trail] : null;
    this.pauseOverlay.querySelector('[data-pause-trail]')!.textContent = trail?.name ?? 'Classic descent';
    this.pauseOverlay.querySelector('[data-pause-details]')!.textContent = trail ? `${trail.difficulty} · ${trail.cue}` : '';
    this.pauseOverlay.querySelector('[data-pause-distance]')!.textContent = `${Math.floor(state.position.y)} m`;
    this.pauseOverlay.querySelector('[data-pause-speed]')!.textContent = `${Math.round(Math.hypot(state.velocityX, state.velocityY) * 3.6)} km/h`;
    const race = run?.expansion;
    const row = this.pauseOverlay.querySelector<HTMLElement>('[data-pause-race]')!;
    row.hidden = !race || race.timer === 'waiting';
    if (race && !row.hidden) {
      row.querySelector('dd')!.textContent = `${race.time.toFixed(3)} s · ${race.outsideCourse ? 'outside course' : `${race.flagMisses} missed`}`;
    }
    this.pauseOverlay.querySelector('[data-seed]')!.textContent = `Copy seed ${run?.seed ?? this.config.seed}`;
    this.pauseOverlay.querySelector('[data-seed-status]')!.textContent = '';
    this.pauseOverlay.classList.add('visible');
    this.pauseOverlay.showModal();
  }

  private showReference(method: string): void {
    for (const button of this.pauseOverlay.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.setAttribute('aria-pressed', String(button.dataset.control === method));
    }
    for (const reference of this.pauseOverlay.querySelectorAll<HTMLElement>('[data-reference]')) {
      reference.hidden = reference.dataset.reference !== method;
    }
  }

  private async copySeed(): Promise<void> {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('seed', String(this.config.seed));
    if (!this.config.mountain) url.searchParams.set('course', 'classic');
    else {
      const { trail, scenario } = this.config.mountain;
      if (trail !== 'pine') url.searchParams.set('section', trail);
      if (scenario !== 'summit') url.searchParams.set('scenario', scenario);
    }
    const status = this.pauseOverlay.querySelector('[data-seed-status]')!;
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Link copied';
    } catch {
      status.textContent = 'Could not copy the link';
    }
  }

  get touchActionElements(): TouchActionElements {
    return { brake: this.brakeButton, tuck: this.tuckButton };
  }

  updateTouchDiagnostics(diagnostics: Readonly<TouchDiagnostics>): void {
    const brake = diagnostics.action === 'brake';
    const tuck = diagnostics.action === 'tuck';
    if (this.brakeButton.hasAttribute('data-held') !== brake) this.brakeButton.toggleAttribute('data-held', brake);
    if (this.tuckButton.hasAttribute('data-held') !== tuck) this.tuckButton.toggleAttribute('data-held', tuck);
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

  update(
    state: Readonly<SkiState>,
    metrics: Readonly<MetricsSnapshot>,
    config: GameConfig,
    drawCalls: number,
    visibleFeatures: number,
    npcMetrics: Readonly<NpcMetrics>,
    diagnostics: Readonly<Record<string, number | string>>,
  ): void {
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
NPCS <em>${npcMetrics.active} active</em>
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
BUILD <em>${BUILD_ID}</em>
SEED <em>${config.seed}</em>${diagnostics.section ? `
TRAIL <em>${diagnostics.section} · ${Number(diagnostics.sectionIndex) + 1}</em>
GATES <em>${diagnostics.cleanGates} clean · ${diagnostics.gateStreak} streak</em>
AVALANCHE <em>${diagnostics.avalanche}</em>` : ''}`;
    this.debug.dataset.build = BUILD_ID;
  }
}
