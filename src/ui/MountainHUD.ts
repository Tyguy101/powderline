import type { SkiState } from '../simulation/SkiPhysics';
import type { MountainRun } from '../simulation/MountainRun';
import {
  FORK_BANNER_OFFSET, FORK_COLORS, FORK_ENTRANCE_OFFSET, FORK_GUIDE_OFFSET, LANE_SPACING,
  TRAILS, type Section,
} from '../world/EndlessMountain';

interface MountainView { x: number; y: number; width: number; height: number }

class TrailSigns {
  readonly root = document.createElement('section');
  private readonly banner = document.createElement('div');
  private readonly guide: HTMLElement[] = [];
  private readonly mouths: HTMLElement[] = [];
  private sectionId = -1;

  constructor(host: HTMLElement) {
    this.root.className = 'trail-signs';
    this.root.setAttribute('aria-label', 'Trail signs');
    this.banner.className = 'trail-sign trail-instruction';
    this.banner.textContent = 'Choose your next trail';
    this.root.append(this.banner);
    for (const row of [this.guide, this.mouths]) {
      for (const [index, arrow] of ['↙', '↓', '↘'].entries()) {
        const board = document.createElement('div');
        board.className = 'trail-sign trail-destination';
        board.style.setProperty('--paint', FORK_COLORS[index]!);
        if (index === 1) board.classList.add('trail-destination--yellow');
        const direction = document.createElement('i');
        direction.textContent = arrow;
        const name = document.createElement('strong');
        board.append(direction, name);
        this.root.append(board);
        row.push(board);
      }
    }
    host.append(this.root);
  }

  update(section: Section | null, view: MountainView): void {
    this.root.hidden = !section || Math.abs(section.end - view.y) > view.height / 2 + FORK_BANNER_OFFSET + 8;
    if (this.root.hidden || !section) return;
    if (section.id !== this.sectionId) {
      this.sectionId = section.id;
      for (const [index, offer] of section.offers.entries()) {
        const name = TRAILS[offer.trail].name;
        this.guide[index]!.querySelector('strong')!.textContent = name;
        this.mouths[index]!.querySelector('strong')!.textContent = name;
      }
    }
    this.place(this.banner, section.center, section.end - FORK_BANNER_OFFSET, 33, view);
    for (let i = 0; i < 3; i += 1) {
      const x = section.center + (i - 1) * LANE_SPACING;
      this.place(this.guide[i]!, x, section.end - FORK_GUIDE_OFFSET, 16.7, view);
      this.place(this.mouths[i]!, x, section.end - FORK_ENTRANCE_OFFSET, 16.7, view);
    }
  }

  private place(board: HTMLElement, x: number, y: number, width: number, view: MountainView): void {
    const row = (y - view.y) / view.height + 0.5;
    const column = (x - view.x) / view.width + 0.5;
    board.hidden = row < -0.1 || row > 1.09 || column < -0.25 || column > 1.25;
    if (board.hidden) return;
    board.style.transform = `translate3d(${column * 100}vw, ${row * 100}dvh, 0) translate(-50%, -77%)`;
    const projectedWidth = `${width / view.width * 100}%`;
    if (board.style.width !== projectedWidth) board.style.width = projectedWidth;
  }
}

export class MountainHUD {
  private readonly trail: HTMLElement;
  private readonly line: HTMLElement;
  private readonly seed: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private readonly signs: TrailSigns;
  private readonly previousSigns: TrailSigns;
  private section = -1;

  constructor(host: HTMLElement, private readonly run: MountainRun, private readonly view: MountainView) {
    const root = document.createElement('div');
    root.className = 'mountain-ui';
    root.innerHTML = `
      <section class="mountain-trail" aria-label="Current trail">
        <div><i></i><strong></strong></div><small></small>
        <button type="button" data-seed title="Copy a link to this descent">Seed <span></span></button>
      </section>
      <div class="mountain-notice" role="status" hidden></div>`;
    this.previousSigns = new TrailSigns(root);
    this.signs = new TrailSigns(root);
    host.append(root);
    this.trail = root.querySelector('.mountain-trail')!;
    this.line = this.trail.querySelector('small')!;
    this.seed = this.trail.querySelector('button')!;
    this.notice = root.querySelector('.mountain-notice')!;
    this.seed.addEventListener('click', async () => {
      const { trail, scenario } = this.run.start;
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set('seed', String(this.run.seed));
      if (trail !== 'pine') url.searchParams.set('section', trail);
      if (scenario !== 'summit') url.searchParams.set('scenario', scenario);
      try {
        await navigator.clipboard.writeText(url.href);
        this.seed.textContent = 'Seed link copied';
      } catch {
        this.seed.textContent = `Seed ${this.run.seed}`;
      }
    });
  }

  update(state: Readonly<SkiState>): void {
    const { section, avalanche, gateIndex, gateStreak, gateOutcome, wave, wavesCleared } = this.run;
    this.signs.update(section, this.view);
    this.previousSigns.update(this.run.previous, this.view);
    const trail = TRAILS[section.trail];
    if (this.section !== section.id) {
      this.section = section.id;
      this.trail.querySelector('strong')!.textContent = trail.name;
      this.trail.style.setProperty('--trail-color', trail.color);
      this.seed.textContent = `Seed ${this.run.seed}`;
    }
    const nextGate = section.gates[gateIndex];
    const info = nextGate ? `Streak ${gateStreak} · ${gateOutcome === 'missed' ? 'Missed · ' : ''}Gate in ${Math.max(0, Math.ceil(nextGate.y - state.position.y))} m`
      : `${trail.difficulty} · ${trail.cue}`;
    if (this.line.textContent !== info) this.line.textContent = info;
    const direction = wave?.safeSide === -1 ? 'left' : 'right';
    const notice = avalanche === 'warning' ? `Snow shifting · cross ${direction}` :
      avalanche === 'chasing' ? `Avalanche · stay ${direction} of the crossing flags` :
      avalanche === 'escaped' && wavesCleared === section.waves.length ? 'Clear of the slide path' : '';
    this.notice.hidden = !notice || state.crashed ||
      (avalanche === 'escaped' && state.position.y > (wave?.trigger ?? 0) + 180);
    if (this.notice.textContent !== notice) this.notice.textContent = notice;
    this.notice.dataset.state = avalanche;
  }
}
