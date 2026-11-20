import type { WorldPosition } from '../core/WorldCoordinates';
import {
  inShelter, interpolateX, laneAt, openingSection, slideEdge, spawnPoint, takeRoute,
  WORLD_LOOK_BEHIND, type Lane, type MountainStart, type Section,
} from '../world/EndlessMountain';

export type AvalancheState = 'quiet' | 'warning' | 'chasing' | 'escaped' | 'caught';

export class MountainRun {
  section: Section;
  previous: Section | null = null;
  revision = 0;
  lastLane: Lane | null = null;
  gateIndex = 0;
  gateStreak = 0;
  gateOutcome: 'waiting' | 'clean' | 'missed' = 'waiting';
  cleanGates = 0;
  avalanche: AvalancheState = 'quiet';
  front = 0;
  private checkpointGates = 0;

  constructor(readonly seed: number, readonly start: MountainStart) {
    this.section = openingSection(seed, start.trail);
  }

  get spawn(): WorldPosition {
    return spawnPoint(this.section, this.start.scenario);
  }

  retry(): void {
    this.gateIndex = 0;
    this.gateStreak = 0;
    this.gateOutcome = 'waiting';
    this.cleanGates = this.checkpointGates;
    this.avalanche = 'quiet';
    this.front = 0;
  }

  sectionAt(y: number): Section | null {
    if (y >= this.section.start && y < this.section.end) return this.section;
    if (this.previous && y >= this.previous.start && y >= this.section.start - WORLD_LOOK_BEHIND && y < this.previous.end) {
      return this.previous;
    }
    return null;
  }

  advance(before: Readonly<WorldPosition>, after: Readonly<WorldPosition>, airborne: boolean, delta: number): 'transition' | 'caught' | undefined {
    const section = this.section;
    while (this.gateIndex < section.gates.length) {
      const gate = section.gates[this.gateIndex]!;
      if (gate.y > after.y) break;
      if (gate.y >= before.y) {
        const clean = !airborne && Math.abs(interpolateX(before, after, gate.y) - gate.x) < gate.halfWidth - 0.62;
        this.gateStreak = clean ? this.gateStreak + 1 : 0;
        this.cleanGates += Number(clean);
        this.gateOutcome = clean ? 'clean' : 'missed';
      }
      this.gateIndex += 1;
    }
    const slide = section.slide;
    if (slide) {
      if (this.avalanche === 'quiet' && after.y >= slide.warningAt) this.avalanche = 'warning';
      if (this.avalanche === 'warning' && after.y >= slide.trigger) {
        this.avalanche = 'chasing';
        this.front = slide.trigger - slide.lead;
      }
      if (this.avalanche === 'escaped' && this.front < slide.shelterEnd + 80) this.front += slide.speed * delta;
      if (this.avalanche === 'chasing') {
        this.front += slide.speed * delta;
        // Once inside the marked lee, the skier is clear for this encounter.
        if (inShelter(section, after)) this.avalanche = 'escaped';
        else if (Math.abs(after.x - section.center) < slide.shelterEdge &&
          slideEdge(section.center, after.x, this.front) >= after.y) {
          this.avalanche = 'caught';
          return 'caught';
        }
      }
    }
    if (after.y < section.end) return;
    this.lastLane = laneAt(section, interpolateX(before, after, section.end));
    this.previous = section;
    this.section = takeRoute(section, this.lastLane);
    this.checkpointGates = this.cleanGates;
    this.retry();
    this.revision += 1;
    return 'transition';
  }
}
