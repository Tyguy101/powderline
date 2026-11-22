import type { SkiState } from '../simulation/SkiPhysics';
import type { MountainRun } from '../simulation/MountainRun';
import type { RunCue } from './HUD';
import {
  FORK_COLORS, FORK_ENTRANCE_OFFSET, FORK_GUIDE_OFFSET, LANE_SPACING,
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
  private readonly guide: HTMLElement[] = [];
  private readonly mouths: HTMLElement[] = [];
  private sectionId = -1;

  constructor(host: HTMLElement) {
    this.root.className = 'trail-signs';
    this.root.setAttribute('aria-label', 'Trail signs');
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
    this.root.hidden = !section || Math.abs(section.end - view.y) > view.height / 2 + FORK_GUIDE_OFFSET + 8;
    if (this.root.hidden || !section) return;
    if (section.id !== this.sectionId) {
      this.sectionId = section.id;
      for (const [index, offer] of section.offers.entries()) {
        const name = TRAILS[offer.trail].name;
        this.guide[index]!.querySelector('strong')!.textContent = name;
        this.mouths[index]!.querySelector('strong')!.textContent = name;
      }
    }
    const mouthY = section.end - FORK_ENTRANCE_OFFSET;
    const showMouths = mouthY < view.y + view.height * 0.43;
    const row = showMouths ? this.mouths : this.guide;
    const hiddenRow = showMouths ? this.guide : this.mouths;
    for (let i = 0; i < 3; i += 1) {
      hiddenRow[i]!.hidden = true;
      const x = section.center + (i - 1) * LANE_SPACING;
      placeBoard(row[i]!, x, showMouths ? mouthY : section.end - FORK_GUIDE_OFFSET, 16.7, view);
    }
  }

}

export class MountainHUD {
  private readonly signs: TrailSigns;
  private readonly previousSigns: TrailSigns;
  private readonly timedBoards: HTMLElement[];
  private readonly patrolBoards: HTMLElement[];
  private finishSeenAt: number | undefined;

  constructor(host: HTMLElement, private readonly run: MountainRun, private readonly view: MountainView) {
    const root = document.createElement('div');
    root.className = 'mountain-ui';
    this.previousSigns = new TrailSigns(root);
    this.signs = new TrailSigns(root);
    const boards = root.appendChild(document.createElement('section'));
    boards.className = 'trail-signs';
    boards.setAttribute('aria-label', 'Course signs');
    this.timedBoards = ['START', 'FINISH'].map((label) => this.makeBoard(boards, label, '#a53a48', true));
    this.patrolBoards = ['Patrol split', '↙ Tight bend', '↘ Wide line'].map((label, index) =>
      this.makeBoard(boards, label, '#4b625d', index === 0));
    host.append(root);
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

  update(state: Readonly<SkiState>): RunCue | null {
    const { section, avalanche, wave, expansion } = this.run;
    this.signs.update(section, this.view);
    this.previousSigns.update(this.run.previous, this.view);
    this.updateCourseBoards(section);
    if (expansion.timer !== 'finished') this.finishSeenAt = undefined;
    if (state.crashed) return null;

    const direction = wave?.safeSide === -1 ? 'left' : 'right';
    if (avalanche === 'warning') return { text: 'Snow shifting · cross ' + direction, tone: 'warning' };
    if (avalanche === 'chasing') return { text: 'Avalanche · stay ' + direction + ' of the flags', tone: 'warning' };
    if (expansion.ice && expansion.iceTime > 0) {
      const text = expansion.boulder ? 'Rock behind · dodge the ice shadow' : 'Falling ice · dodge the shadow';
      return { text, tone: 'warning' };
    }
    if (expansion.boulder && expansion.rockY - state.position.y < 18) {
      return { text: 'Rolling boulder · leave its line', tone: 'warning' };
    }

    const timed = section.expansion.timed;
    if (!timed) return null;
    if (expansion.timer === 'running') {
      const time = expansion.time.toFixed(1) + ' s';
      const invalid = expansion.outsideCourse || expansion.flagMisses > 0;
      return { text: invalid ? time + ' · Invalid time' : time, tone: 'clock' };
    }
    if (expansion.timer === 'waiting' && state.position.y >= timed.start - 55) {
      return { text: 'Follow flag arrows · misses void the time', tone: 'race' };
    }
    if (expansion.timer === 'finished') {
      this.finishSeenAt ??= performance.now();
      if (performance.now() - this.finishSeenAt < 3600 && state.position.y < timed.finish + 115) {
        return { text: this.finishText(), tone: 'race' };
      }
    }
    return null;
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
