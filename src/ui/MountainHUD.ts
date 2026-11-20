import type { SkiState } from '../simulation/SkiPhysics';
import type { MountainRun } from '../simulation/MountainRun';
import { PREVIEW_DISTANCE, TRAILS, laneAt, type Trail } from '../world/EndlessMountain';

const VARIANTS: Record<Trail, readonly string[]> = {
  pine: ['Open groves and long sightlines', 'Tighter groves with a late clearing', 'Long gaps between thicker stands'],
  gate: ['Wide slalom rhythm', 'Quicker turns between gates', 'Tighter alternating gates'],
  air: ['Short traverses between jump lines', 'Wide gap to the side kickers', 'Longest traverse to the big kickers'],
  chute: ['Smoother turns between rock walls', 'Wider swings through the pinch points', 'Sharpest turns through the rock'],
  avalanche: ['Two shelters and a longer warning', 'Faster snow with two side exits', 'Quickest front and deepest traverse'],
};

export class MountainHUD {
  private readonly root: HTMLElement;
  private readonly trail: HTMLElement;
  private readonly line: HTMLElement;
  private readonly seed: HTMLButtonElement;
  private readonly fork: HTMLElement;
  private readonly forkDistance: HTMLElement;
  private readonly choices: HTMLElement[];
  private readonly notice: HTMLElement;
  private readonly outcomes = {
    quiet: '',
    warning: 'Avalanche warning · move toward either side',
    chasing: 'Avalanche! Reach a green shelter lane',
    escaped: 'Sheltered · keep skiing',
    caught: 'Avalanche caught you',
  };
  private section = -1;

  constructor(host: HTMLElement, private readonly run: MountainRun) {
    this.root = document.createElement('div');
    this.root.className = 'mountain-ui';
    this.root.innerHTML = `
      <section class="mountain-trail" aria-label="Current trail">
        <div><i></i><strong></strong></div><small></small>
        <button type="button" data-seed title="Copy a link to this descent">Seed <span></span></button>
      </section>
      <div class="mountain-notice" role="status" hidden></div>
      <section class="mountain-fork" aria-label="Upcoming trail choices" hidden>
        <header><b>Trail fork</b><span></span></header>
        <div class="mountain-choices">
          <div><small>↙ Left</small><strong></strong><b></b><span></span></div>
          <div><small>↓ Straight</small><strong></strong><b></b><span></span></div>
          <div><small>↘ Right</small><strong></strong><b></b><span></span></div>
        </div>
      </section>`;
    host.append(this.root);
    this.trail = this.root.querySelector('.mountain-trail')!;
    this.line = this.trail.querySelector('small')!;
    this.seed = this.trail.querySelector('button')!;
    this.fork = this.root.querySelector('.mountain-fork')!;
    this.forkDistance = this.fork.querySelector('header span')!;
    this.choices = [...this.fork.querySelectorAll<HTMLElement>('.mountain-choices > div')];
    this.notice = this.root.querySelector('.mountain-notice')!;
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
    const { section, avalanche, gateIndex, gateStreak, gateOutcome } = this.run;
    const distance = Math.max(0, Math.ceil(section.end - state.position.y));
    if (this.section !== section.id) {
      this.section = section.id;
      const trail = TRAILS[section.trail];
      this.trail.querySelector('strong')!.textContent = trail.name;
      this.trail.style.setProperty('--trail-color', trail.color);
      this.seed.textContent = `Seed ${this.run.seed}`;
      for (const offer of section.offers) {
        const choice = this.choices[offer.lane + 1]!;
        const target = TRAILS[offer.trail];
        choice.style.setProperty('--trail-color', target.color);
        choice.querySelector('strong')!.textContent = target.name;
        choice.querySelector('b')!.textContent = target.difficulty;
        choice.querySelector('span')!.textContent = VARIANTS[offer.trail][offer.variant]!;
      }
    }
    const trail = TRAILS[section.trail];
    const nextGate = section.gates[gateIndex];
    const gateDirection = nextGate && nextGate.x < section.center ? 'left' : 'right';
    const info = nextGate
      ? `Streak ${gateStreak} · ${gateOutcome === 'missed' ? 'Missed · ' : ''}Gate ${gateDirection} in ${Math.max(0, Math.ceil(nextGate.y - state.position.y))} m`
      : `${trail.difficulty} · ${trail.cue}`;
    if (this.line.textContent !== info) this.line.textContent = info;
    const notice = this.outcomes[avalanche];
    this.notice.hidden = !notice || state.crashed || (avalanche === 'escaped' && state.position.y > (section.slide?.shelterEnd ?? 0));
    if (this.notice.textContent !== notice) {
      this.notice.textContent = notice;
      this.notice.dataset.state = avalanche;
    }
    const showFork = !state.crashed && distance <= PREVIEW_DISTANCE;
    this.fork.hidden = !showFork;
    if (!showFork) return;
    const label = `Steer to choose · ${distance} m`;
    if (label !== this.forkDistance.textContent) this.forkDistance.textContent = label;
    const lane = laneAt(section, state.position.x);
    for (const [i, choice] of this.choices.entries()) {
      choice.classList.toggle('selected', distance <= 58 && lane + 1 === i);
    }
  }
}
