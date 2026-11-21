import type { SkiState } from '../simulation/SkiPhysics';
import type { MountainRun } from '../simulation/MountainRun';
import {
  FORK_BANNER_OFFSET, FORK_COLORS, FORK_ENTRANCE_OFFSET, FORK_GUIDE_OFFSET, LANE_SPACING,
  TRAILS, pathCenter, type Section,
} from '../world/EndlessMountain';

interface MountainView { x: number; y: number; width: number; height: number }

function placeBoard(board: HTMLElement, x: number, y: number, width: number, view: MountainView): void {
  const row = (y - view.y) / view.height + 0.5;
  const column = (x - view.x) / view.width + 0.5;
  board.hidden = row < -0.1 || row > 1.09 || column < -0.25 || column > 1.25;
  if (board.hidden) return;
  board.style.transform = `translate3d(${column * 100}vw, ${row * 100}dvh, 0) translate(-50%, -77%)`;
  const projectedWidth = `${width / view.width * 100}%`;
  if (board.style.width !== projectedWidth) board.style.width = projectedWidth;
}

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
    placeBoard(this.banner, section.center, section.end - FORK_BANNER_OFFSET, 33, view);
    for (let i = 0; i < 3; i += 1) {
      const x = section.center + (i - 1) * LANE_SPACING;
      placeBoard(this.guide[i]!, x, section.end - FORK_GUIDE_OFFSET, 16.7, view);
      placeBoard(this.mouths[i]!, x, section.end - FORK_ENTRANCE_OFFSET, 16.7, view);
    }
  }

}

export class MountainHUD {
  private readonly trail: HTMLElement;
  private readonly line: HTMLElement;
  private readonly seed: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private readonly signs: TrailSigns;
  private readonly previousSigns: TrailSigns;
  private readonly timedBoards: HTMLElement[];
  private readonly patrolBoards: HTMLElement[];
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
    const boards = root.appendChild(document.createElement('section'));
    boards.className = 'trail-signs';
    boards.setAttribute('aria-label', 'Course signs');
    this.timedBoards = ['START', 'FINISH'].map((label) => this.makeBoard(boards, label, '#a53a48', true));
    this.patrolBoards = ['Patrol split', '↙ Tight bend', '↘ Wide line'].map((label, index) =>
      this.makeBoard(boards, label, '#4b625d', index === 0));
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

  private makeBoard(host: HTMLElement, label: string, paint: string, large: boolean): HTMLElement {
    const board = document.createElement('div');
    board.className = `trail-sign ${large ? 'trail-instruction' : 'trail-destination'}`;
    board.style.setProperty('--paint', paint);
    board.textContent = label;
    board.hidden = true;
    host.append(board);
    return board;
  }

  update(state: Readonly<SkiState>): void {
    const { section, avalanche, gateIndex, gateStreak, gateOutcome, wave, wavesCleared } = this.run;
    this.signs.update(section, this.view);
    this.previousSigns.update(this.run.previous, this.view);
    this.updateCourseBoards(section);
    const trail = TRAILS[section.trail];
    if (this.section !== section.id) {
      this.section = section.id;
      this.trail.querySelector('strong')!.textContent = trail.name;
      this.trail.style.setProperty('--trail-color', trail.color);
      this.seed.textContent = `Seed ${this.run.seed}`;
    }
    const nextGate = section.gates[gateIndex];
    const race = this.run.expansion;
    const timed = section.expansion.timed;
    const nextFlag = timed?.flags[race.flagIndex];
    const timedInfo = race.timer === 'running'
      ? `${race.time.toFixed(1)} s · ${race.flagMisses} missed${nextFlag ? ` · Pass ${nextFlag.passSide < 0 ? 'left' : 'right'} in ${Math.max(0, Math.ceil(nextFlag.y - state.position.y))} m` : ''}`
      : race.timer === 'finished' ? this.finishText() : '';
    const info = timedInfo || (nextGate ? `Streak ${gateStreak} · ${gateOutcome === 'missed' ? 'Missed · ' : ''}Gate in ${Math.max(0, Math.ceil(nextGate.y - state.position.y))} m`
      : `${trail.difficulty} · ${trail.cue}`);
    if (this.line.textContent !== info) this.line.textContent = info;
    const direction = wave?.safeSide === -1 ? 'left' : 'right';
    const slideNotice = avalanche === 'warning' ? `Snow shifting · cross ${direction}` :
      avalanche === 'chasing' ? `Avalanche · stay ${direction} of the crossing flags` :
      avalanche === 'escaped' && wavesCleared === section.waves.length ? 'Clear of the slide path' : '';
    const upcomingRock = section.expansion.boulders.find((line) =>
      line.start > state.position.y && line.start - state.position.y < 65);
    const hazardNotice = race.ice && race.iceTime > 0
      ? (race.boulder ? 'Rock behind · dodge the ice shadow' : 'Falling ice · dodge the shadow')
      : race.boulder ? 'Rolling boulder · move off its line' : upcomingRock ? 'Rolling-rock track ahead' : '';
    const raceNotice = timed && race.timer === 'waiting' && state.position.y >= timed.start - 92
      ? 'Pass on each arrow side · misses cancel the time'
      : timed && race.timer === 'finished' && state.position.y < timed.finish + 115 ? this.finishText() : '';
    const notice = slideNotice || hazardNotice || raceNotice;
    this.notice.hidden = !notice || state.crashed ||
      (avalanche === 'escaped' && state.position.y > (wave?.trigger ?? 0) + 180);
    if (this.notice.textContent !== notice) this.notice.textContent = notice;
    this.notice.dataset.state = hazardNotice ? 'warning' : raceNotice ? 'race' : avalanche;
  }

  private finishText(): string {
    const race = this.run.expansion;
    if (race.outsideCourse) return 'No clean time · outside course';
    if (race.flagMisses) return `No clean time · ${race.flagMisses} missed`;
    return `Clean finish · ${race.time.toFixed(3)} s`;
  }

  private updateCourseBoards(section: Section): void {
    const timed = section.expansion.timed;
    for (const [index, board] of this.timedBoards.entries()) {
      if (!timed) board.hidden = true;
      else placeBoard(board, section.center, index === 0 ? timed.start : timed.finish,
        timed.startHalfWidth * 2, this.view);
    }
    const split = section.expansion.patrol.find((item) => Math.abs(item.entry - this.view.y) < 91);
    for (const [index, board] of this.patrolBoards.entries()) {
      if (!split) board.hidden = true;
      else placeBoard(board, pathCenter(section, split.entry - 17) + (index === 0 ? 0 : (index === 1 ? -7.4 : 7.4)),
        split.entry - (index === 0 ? 32 : 14), index === 0 ? 23 : 13.6, this.view);
    }
  }
}
