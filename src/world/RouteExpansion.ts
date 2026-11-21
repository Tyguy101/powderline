import { hashUnit } from '../core/SeededHash';
import type { Section, Trail } from './EndlessMountain';

export type Side = -1 | 1;
export const BASE_TUCK_SPEED = 34;
export const SPEED_RUN_MULTIPLIER = 1.5;
export const BOULDER_SPEED = 36.4;
export const BOULDER_RADIUS = 3.1;
export const BOULDER_LEAD = 9;
export const ICE_FALL_SECONDS = 0.42;
export const ICE_LINGER_SECONDS = 1.35;
export const NORMAL_NPCS = 5;
export const MAX_CROWD_NPCS = 16;
export const POTATO_CROWD_NPCS = 10;

export interface RoadSplit { entry: number; merge: number; radius: number }
export interface SpeedFlag { x: number; y: number; passSide: Side; maxOffset: number }
export interface TimedCourse {
  start: number;
  finish: number;
  startHalfWidth: number;
  flags: readonly SpeedFlag[];
}
export interface BoulderLine { start: number; end: number; x: number; drift: number }
export interface IceTarget { warningAt: number; x: number; y: number; radius: number }
export interface ExpansionLayout {
  bowlReveal: number | null;
  patrol: readonly RoadSplit[];
  traffic: readonly number[];
  timed: TimedCourse | null;
  boulders: readonly BoulderLine[];
  ice: readonly IceTarget[];
}

export function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function makeExpansion(trail: Trail, id: number, variant: number, start: number, center: number): ExpansionLayout {
  const bowl = trail === 'sun' || trail === 'busy';
  const direction: Side = id % 2 === 0 ? 1 : -1;
  const patrol: RoadSplit[] = [];
  const traffic: number[] = [];
  const boulders: BoulderLine[] = [];
  const ice: IceTarget[] = [];
  let timed: TimedCourse | null = null;
  if (trail === 'patrol') {
    for (let i = 0; i < 3; i += 1) {
      const entry = start + 169 + i * 332 + (i ? 15 * variant : 0);
      patrol.push({ entry, merge: entry + 156 + variant * 8, radius: 4.9 + variant * 0.45 });
    }
  }
  if (trail === 'busy') {
    for (let i = 0; i < 5; i += 1) traffic.push(start + 221 + i * 238 + Math.round(hashUnit(id, i, 0) * 17));
  }
  if (trail === 'speed') {
    const startLine = start + 115;
    const course = [-11, -16, 9, 15, -7, -15, 11, 16, -6, -13];
    let y = startLine + 95;
    const flags = course.map((offset, i): SpeedFlag => {
      const lane = offset * direction;
      const passSide: Side = lane > 0 ? -1 : 1;
      const flag = { x: center + lane + (hashUnit(id, i, variant, 4) - 0.5) * 3,
        y, passSide, maxOffset: i % 3 === 1 ? 10.5 : 12 };
      y += ([50, 108, 49, 98, 56, 111, 52, 93, 54, 90][i] ?? 90) + variant * 3;
      return flag;
    });
    timed = { start: startLine, finish: y + 26, startHalfWidth: 19, flags };
  }
  if (trail === 'hazards') {
    boulders.push({ start: start + 192, end: start + 393, x: center, drift: direction * 0.9 });
    ice.push({ warningAt: start + 440, x: center, y: start + 494, radius: 4.9 });
    for (let i = 0; i < 3; i += 1) {
      const at = start + 645 + i * (246 + variant * 5);
      const sign = i % 2 === 0 ? direction : -direction;
      const x = i === 0 ? center : center + sign * (13.25 + variant);
      const strike = at + 111 + Math.round(hashUnit(id, i, 47) * 9);
      boulders.push({ start: at, end: at + 200, x, drift: sign * (0.7 + variant * 0.45) });
      ice.push({ warningAt: strike - 54 - variant,
        x: x + sign * (i === 0 ? 10.3 + variant * 0.7 : 7.2 + variant * 0.4),
        y: strike, radius: 4.9 + variant * 0.36 });
    }
  }
  return { bowlReveal: bowl ? start + 136 + variant * 9 : null, patrol, traffic, timed, boulders, ice };
}

export function patrolSplitAt(section: Section, y: number): RoadSplit | undefined {
  return section.expansion.patrol.find((split) => y >= split.entry && y <= split.merge);
}

export function patrolMedianWidth(split: RoadSplit, y: number): number {
  return split.radius * smoothstep((y - split.entry) / 32) * smoothstep((split.merge - y) / 41);
}

export function patrolCenterOffset(section: Section, y: number): number {
  const distance = y - section.start;
  const entrance = smoothstep((distance - 50) / 95);
  const exit = smoothstep((section.end - 128 - y) / 75);
  return (Math.sin((distance - 46) / 54 + section.variant * 0.32) * 9 +
    Math.sin(distance / 88) * 4) * entrance * exit;
}

export function patrolOuterWidth(section: Section, y: number): number {
  const split = patrolSplitAt(section, y);
  return split ? 7.2 + 1.83 * patrolMedianWidth(split, y) : 7.6 + Math.sin((y - section.start) / 44) * 1.4;
}

export function boulderX(line: BoulderLine, y: number): number {
  return line.x + line.drift * Math.sin((y - line.start) / 48);
}

export function hazardWidth(section: Section, y: number): number {
  let pinch = 0;
  for (const target of section.expansion.ice) {
    const shoulder = Math.max(25, Math.abs(target.x - section.center) + target.radius + 4.5);
    pinch = Math.max(pinch, (38 - shoulder) * smoothstep(1 - Math.abs(y - target.y) / 82));
  }
  return 38 - pinch;
}

export function crowdLane(slot: number, clusterIndex: number): number {
  // Two staggered rows, with a through lane between the center and outer pack.
  const lanes = [-34, -24, -15, -5, 5, 14, 25, 34, -32, -20, -9, 1, 11, 21, 31, 38];
  return (clusterIndex % 2 === 0 ? 1 : -1) * lanes[slot]!;
}
