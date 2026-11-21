import type { WorldPosition } from '../core/WorldCoordinates';
import type { InputState } from '../input/InputState';
import { interpolateX, patrolMedian, type Section } from '../world/EndlessMountain';
import {
  BASE_TUCK_SPEED, BOULDER_LEAD, BOULDER_RADIUS, BOULDER_SPEED, ICE_LINGER_SECONDS, boulderX,
  type BoulderLine, type IceTarget,
} from '../world/RouteExpansion';

export type HazardImpact = 'ice' | 'boulder';

export class ExpansionRun {
  timer: 'waiting' | 'running' | 'finished' = 'waiting';
  time = 0;
  flagIndex = 0;
  flagMisses = 0;
  outsideCourse = false;
  patrolLane = 0;
  patrolMerges = 0;
  boulder: BoulderLine | undefined;
  rockX = 0;
  rockY = 0;
  boulderPasses = 0;
  ice: IceTarget | undefined;
  iceTime = 0;
  icePasses = 0;
  impact: HazardImpact | undefined;

  reset(): void {
    this.timer = 'waiting';
    this.time = 0;
    this.flagIndex = 0;
    this.flagMisses = 0;
    this.outsideCourse = false;
    this.patrolLane = 0;
    this.patrolMerges = 0;
    this.boulder = undefined;
    this.rockX = 0;
    this.rockY = 0;
    this.boulderPasses = 0;
    this.ice = undefined;
    this.iceTime = 0;
    this.icePasses = 0;
    this.impact = undefined;
  }

  advance(section: Section, before: Readonly<WorldPosition>, after: Readonly<WorldPosition>,
    speed: number, airborne: boolean, delta: number, input?: Readonly<InputState>): HazardImpact | undefined {
    const { timed, patrol, boulders, ice } = section.expansion;
    if (timed) this.advanceTimer(section, before, after, airborne, delta);
    for (const split of patrol) {
      const choice = split.entry + 39;
      if (crossed(before, after, choice)) {
        this.patrolLane = interpolateX(before, after, choice) < patrolMedian(section, choice)!.x ? -1 : 1;
      }
      if (crossed(before, after, split.merge)) this.patrolMerges += 1;
    }
    if (boulders.length === 0) return;
    if (!this.boulder) {
      const launch = boulders.find((line) => crossed(before, after, line.start));
      if (launch) {
        this.boulder = launch;
        this.rockY = launch.start - BOULDER_LEAD;
      }
    }
    if (!this.ice) {
      this.ice = ice.find((target) => crossed(before, after, target.warningAt));
      if (this.ice) {
        // The warning starts at a fixed place. The fall meets the skier's entry
        // pace, and changing speed after seeing the shadow remains a valid dodge.
        this.iceTime = iceArrival(this.ice.y - after.y, speed, input) - 0.1;
      }
    }
    if (this.boulder) {
      this.rockY += BOULDER_SPEED * delta;
      this.rockX = boulderX(this.boulder, this.rockY);
      if (this.rockY > this.boulder.end) {
        this.boulder = undefined;
        this.boulderPasses += 1;
      } else if (Math.hypot(after.x - this.rockX, after.y - this.rockY) < BOULDER_RADIUS + 0.62) {
        this.impact = 'boulder';
      }
    }
    if (this.ice) {
      this.iceTime -= delta;
      if (this.iceTime < -ICE_LINGER_SECONDS) {
        this.ice = undefined;
        this.icePasses += 1;
      } else if (this.iceTime <= 0 &&
        Math.hypot(after.x - this.ice.x, after.y - this.ice.y) < this.ice.radius + 0.62) {
        this.impact = 'ice';
      }
    }
    return this.impact;
  }

  private advanceTimer(section: Section, before: Readonly<WorldPosition>,
    after: Readonly<WorldPosition>, airborne: boolean, delta: number): void {
    const timed = section.expansion.timed!;
    if (this.timer === 'waiting' && crossed(before, after, timed.start)) {
      this.timer = 'running';
      this.outsideCourse = airborne ||
        Math.abs(interpolateX(before, after, timed.start) - section.center) > timed.startHalfWidth;
    }
    if (this.timer !== 'running') return;
    const distance = after.y - before.y;
    if (distance <= 0) return;
    const inSegment = Math.max(0, Math.min(after.y, timed.finish) - Math.max(before.y, timed.start));
    this.time += delta * inSegment / distance;
    while (this.flagIndex < timed.flags.length && timed.flags[this.flagIndex]!.y <= after.y) {
      const flag = timed.flags[this.flagIndex++]!;
      const offset = (interpolateX(before, after, flag.y) - flag.x) * flag.passSide;
      if (airborne || offset < 1.05 || offset > flag.maxOffset) this.flagMisses += 1;
    }
    if (crossed(before, after, timed.finish)) {
      if (airborne ||
        Math.abs(interpolateX(before, after, timed.finish) - section.center) > timed.startHalfWidth) {
        this.outsideCourse = true;
      }
      this.timer = 'finished';
    }
  }
}

function crossed(before: Readonly<WorldPosition>, after: Readonly<WorldPosition>, line: number): boolean {
  return before.y < line && after.y >= line;
}

function iceArrival(distance: number, speed: number, input: Readonly<InputState> | undefined): number {
  const tucked = input?.tuck && !input.brake;
  const response = tucked ? 0.95 : 1.15;
  const target = tucked ? BASE_TUCK_SPEED : 22;
  let low = 0;
  let high = distance / 12;
  for (let i = 0; i < 9; i += 1) {
    const time = (low + high) / 2;
    const travel = target * time + (speed - target) * (1 - Math.exp(-response * time)) / response;
    if (travel < distance) low = time;
    else high = time;
  }
  return (low + high) / 2;
}
