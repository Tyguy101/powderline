import type { WorldPosition } from '../core/WorldCoordinates';
import {
  interpolateX, laneAt, openingSection, slideEdge, spawnPoint, takeRoute,
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
  waveIndex = 0;
  wavesCleared = 0;
  npcEngulfments = 0;
  private caughtFront = 0;
  private checkpointGates = 0;

  constructor(readonly seed: number, readonly start: MountainStart) {
    this.section = openingSection(seed, start.trail);
  }

  get spawn(): WorldPosition {
    return spawnPoint(this.section, this.start.scenario);
  }

  get wave() {
    return this.section.waves[this.waveIndex];
  }

  get waveKey(): number {
    return this.section.index * 8 + this.waveIndex;
  }

  engulfed(x: number, y: number): boolean {
    const wave = this.wave;
    if (!wave || (this.avalanche !== 'chasing' && this.avalanche !== 'caught' &&
      this.avalanche !== 'escaped')) return false;
    const depth = slideEdge(wave, this.section.center, x, this.front) - y;
    return (x - this.section.center) * wave.safeSide < wave.safeEdge && depth >= 0 && depth <= 45;
  }

  retry(): void {
    this.gateIndex = 0;
    this.gateStreak = 0;
    this.gateOutcome = 'waiting';
    this.cleanGates = this.checkpointGates;
    this.avalanche = 'quiet';
    this.front = 0;
    this.caughtFront = 0;
    this.waveIndex = 0;
    this.wavesCleared = 0;
    this.npcEngulfments = 0;
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
    if (this.advanceSlide(after, delta)) return 'caught';
    if (after.y < section.end) return;
    this.lastLane = laneAt(section, interpolateX(before, after, section.end));
    this.previous = section;
    this.section = takeRoute(section, this.lastLane);
    this.checkpointGates = this.cleanGates;
    this.retry();
    this.revision += 1;
    return 'transition';
  }

  driftAfterCrash(delta: number): void {
    if (this.avalanche !== 'caught' || !this.wave) return;
    // Let the snow roll over the fallen skier, then leave the wreck in view.
    this.front = Math.min(this.front + this.wave.speed * delta * 0.32, this.caughtFront + 23);
  }

  private catchSkier(): true {
    this.avalanche = 'caught';
    this.caughtFront = this.front;
    return true;
  }

  private advanceSlide(position: Readonly<WorldPosition>, delta: number): boolean {
    let wave = this.wave;
    if (!wave) return false;
    if (this.avalanche === 'escaped') {
      const next = this.section.waves[this.waveIndex + 1];
      if (!next || position.y < next.warningAt) {
        if (this.front < position.y + 160) this.front += wave.speed * delta;
        return this.engulfed(position.x, position.y) ? this.catchSkier() : false;
      }
      this.waveIndex += 1;
      this.front = 0;
      this.avalanche = 'quiet';
      wave = next;
    }
    if (this.avalanche === 'quiet' && position.y >= wave.warningAt) this.avalanche = 'warning';
    if (this.avalanche === 'warning' && position.y >= wave.trigger) {
      this.avalanche = 'chasing';
      this.front = wave.trigger - wave.lead;
    }
    if (this.avalanche !== 'chasing') return false;
    this.front += wave.speed * delta;
    if (this.engulfed(position.x, position.y)) return this.catchSkier();
    if (this.front >= position.y + 9 &&
      (position.x - this.section.center) * wave.safeSide >= wave.safeEdge) {
      this.wavesCleared += 1;
      this.avalanche = 'escaped';
    }
    return false;
  }
}
