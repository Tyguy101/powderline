import { hashCoordinates, hashUnit } from '../core/SeededHash';
import type { WorldPosition } from '../core/WorldCoordinates';
import type { FeatureDescriptor } from './FeatureGeneratorCPU';
import {
  hazardWidth, makeExpansion, patrolCenterOffset, patrolMedianWidth, patrolOuterWidth, patrolSplitAt, smoothstep as ease,
  type ExpansionLayout,
} from './RouteExpansion';

export const TRAILS = {
  pine: { name: 'Pine Glades', difficulty: 'Normal', cue: 'Open lines through the pines', color: '#167866' },
  gate: { name: 'Gate Run', difficulty: 'Difficult', cue: 'Link combinations and traverses', color: '#2865b8' },
  air: { name: 'Big Air Park', difficulty: 'Extreme', cue: 'Jump lines and clear bypasses', color: '#9a4ab4' },
  chute: { name: 'Needle Chute', difficulty: 'Extreme', cue: 'Brake before the rock narrows', color: '#a65a26' },
  avalanche: { name: 'Avalanche Alley', difficulty: 'Dangerous', cue: 'Follow the crossing markers', color: '#b53e4d' },
  sun: { name: 'Sun Bowl', difficulty: 'Normal', cue: 'Open snow below the sun ridge', color: '#9a661d' },
  patrol: { name: 'Patrol Road', difficulty: 'Difficult', cue: 'Brake early for the service-road bends', color: '#537d76' },
  busy: { name: 'Busy Weekend', difficulty: 'Difficult', cue: 'Watch the groups ahead and pick a gap', color: '#367795' },
  speed: { name: 'Down Hill Speed Run', difficulty: 'Extreme', cue: 'Follow the arrows around every flag', color: '#be5363' },
  hazards: { name: 'Falling Ice and Rolling Boulders', difficulty: 'Dangerous', cue: 'Leave the rolling line and watch for ice shadows', color: '#804753' },
} as const;

export type Trail = keyof typeof TRAILS;
export type MountainScenario = 'summit' | 'fork' | 'encounter' | 'ice' | 'boulder';
export type Lane = -1 | 0 | 1;
export const LANES = [-1, 0, 1] as const;
export const FORK_LENGTH = 104;
export const LANE_SPACING = 18;
export const ENTRY_WIDTH = 27;
export const PREVIEW_DISTANCE = 163;
export const FORK_BANNER_OFFSET = 106;
export const FORK_GUIDE_OFFSET = 89;
export const FORK_ENTRANCE_OFFSET = 3;
export const FORK_COLORS = ['#a02f32', '#e5b846', '#176344'] as const;
export const WORLD_LOOK_BEHIND = 100;
const MAIN_WIDTH: Record<Trail, number> = {
  pine: 43, gate: 36, air: 40, chute: 24, avalanche: 43,
  sun: 54, patrol: 9, busy: 54, speed: 32, hazards: 37,
};

export interface MountainStart {
  trail: Trail;
  scenario: MountainScenario;
}

export interface RouteOffer {
  lane: Lane;
  trail: Trail;
  id: number;
  variant: number;
}

export interface CourseGate {
  x: number;
  y: number;
  halfWidth: number;
}

export interface SlideWave {
  trigger: number;
  safeSide: -1 | 1;
  safeEdge: number;
  speed: number;
  lead: number;
  warningAt: number;
}

export interface JumpLine {
  x: number;
  lip: number;
  halfWidth: number;
  gapStart: number;
  gapEnd: number;
  gapHalfWidth: number;
  kind: 'crevice' | 'rocks' | 'timber';
}

interface ChuteKnot { y: number; x: number; width: number }
interface Glade { y: number; islandX: number; relaxedSide: -1 | 1 }

export interface Section {
  id: number;
  index: number;
  trail: Trail;
  variant: number;
  center: number;
  entryLane: Lane;
  start: number;
  end: number;
  opening: boolean;
  offers: readonly RouteOffer[];
  gates: readonly CourseGate[];
  features: readonly FeatureDescriptor[];
  chute: readonly ChuteKnot[];
  glade: Glade | null;
  jumps: readonly JumpLine[];
  waves: readonly SlideWave[];
  expansion: ExpansionLayout;
}

export function isTrail(value: unknown): value is Trail {
  return typeof value === 'string' && Object.hasOwn(TRAILS, value);
}

export function isScenario(value: unknown): value is MountainScenario {
  return value === 'summit' || value === 'fork' || value === 'encounter' || value === 'ice' || value === 'boulder';
}

function offersFor(trail: Trail, id: number, variant: number): RouteOffer[] {
  const left: Record<Trail, Trail> = {
    pine: 'gate',
    gate: variant === 1 ? 'chute' : 'air',
    air: 'avalanche',
    chute: 'avalanche',
    avalanche: 'hazards',
    sun: 'patrol',
    patrol: 'speed',
    busy: 'air',
    speed: 'hazards',
    hazards: 'avalanche',
  };
  const right: Record<Trail, Trail> = {
    pine: 'sun',
    gate: 'pine',
    air: 'chute',
    chute: 'gate',
    avalanche: 'gate',
    sun: 'pine',
    patrol: 'busy',
    busy: 'sun',
    speed: 'chute',
    hazards: 'busy',
  };
  const trails = [left[trail], trail, right[trail]];
  return LANES.map((lane, slot) => {
    const next = trails[slot]!;
    const nextId = hashCoordinates(id, lane, slot, 0x44ae);
    const nextVariant = next === trail
      ? (variant + (lane === 1 ? 2 : 1)) % 3
      : nextId % 3;
    return { lane, trail: next, id: nextId, variant: nextVariant };
  });
}

export function createSection(
  offer: RouteOffer,
  index: number,
  center: number,
  start: number,
): Section {
  const { id, trail, variant } = offer;
  const length = ({
    pine: 1390, gate: 1430, air: 1560, chute: 1220, avalanche: 1460,
    sun: 1230, patrol: 1220, busy: 1350, speed: 1320, hazards: 1470,
  })[trail] +
    variant * 95 + Math.floor(hashUnit(id, 1, 0) * 140);
  const end = start + length;
  const gates: CourseGate[] = [];
  const features: FeatureDescriptor[] = [];
  const chute: ChuteKnot[] = [];
  const jumps: JumpLine[] = [];
  const waves: SlideWave[] = [];
  const side = (id & 1) === 0 ? 1 : -1;
  const glade: Glade | null = trail === 'pine' ? {
    y: start + 396 + variant * 22,
    islandX: center + side * (5 + variant),
    relaxedSide: side === 1 ? -1 : 1,
  } : null;
  function obstacle(type: 'rock' | 'tree', x: number, y: number, scale: number, detail = 0): void {
    features.push({ id: hashCoordinates(id, Math.round(x * 8), Math.round(y * 8), 24 + detail),
      type, x, y, scale, radius: (type === 'rock' ? 0.88 : 1.05) * scale });
  }
  for (const divider of [-1, 1]) {
    const x = center + divider * LANE_SPACING / 2;
    obstacle('tree', x, end - 43, 1.9);
    obstacle('tree', x + divider * 0.7, end - 35, 1.56);
    obstacle('rock', x, end - 25, 1.68);
    obstacle('rock', center + divider * 29, end - 18, 2.14);
  }
  if (glade) {
    for (const [dx, dy, scale] of [[0, 0, 4.1], [4, -3, 2.5], [4, 5, 3.1], [1, 10, 2.2]] as const) {
      obstacle('rock', glade.islandX + side * dx, glade.y + dy, scale);
    }
    for (let row = 0; row < 7; row += 1) {
      for (const edge of [-1, 1]) {
        const x = center + edge * (11 + row * 1.35 + (edge === side ? 1.3 : 0));
        const y = glade.y - 101 + row * 8;
        for (let depth = 0; depth < 3; depth += 1) {
          obstacle('tree', x + edge * depth * 5.1,
            y + (hashUnit(id, row, depth, edge + 9) - 0.5) * 5 + depth * 2, 1.3 + depth * 0.27);
        }
      }
    }
    obstacle('tree', glade.islandX + side * 5, glade.y - 10, 2.0);
    obstacle('tree', glade.islandX + side * 7, glade.y + 10, 1.78);
    obstacle('tree', glade.islandX + side * 16, glade.y + 18, 1.58);
  }
  if (trail === 'gate') {
    const phrases = [
      [[-8, 43, 5.6], [-13, 28, 5.1], [8, 59, 5.7], [14, 31, 5.0], [0, 49, 6.4]],
      [[10, 48, 5.7], [-11, 60, 5.9], [-5, 24, 4.95], [5, 37, 5.15], [12, 35, 5.4], [0, 56, 6.4]],
      [[-12, 54, 5.5], [9, 61, 6.0], [15, 29, 5.1], [-6, 54, 5.6], [-12, 28, 5.0], [0, 48, 6.3]],
    ] as const;
    let y = start + 112;
    for (let phrase = 0; y < end - FORK_LENGTH - 36; phrase += 1) {
      const shape = phrases[(phrase + variant + (phrase > 1 ? id % 3 : 0)) % phrases.length]!;
      for (const [slot, [offset, spacing, width]] of shape.entries()) {
        if (y >= end - FORK_LENGTH - 36) break;
        const mirror = phrase % 2 === 0 ? side : -side;
        y += slot === 0 ? 0 : spacing + (hashUnit(id, phrase, slot, 9) - 0.5) * 5;
        if (y >= end - FORK_LENGTH - 36) break;
        const jitter = (hashUnit(id, phrase, slot, 7) - 0.5) * 2;
        gates.push({ x: center + (offset + jitter) * mirror, y, halfWidth: width });
      }
      y += 55 + variant * 3;
    }
  }
  if (trail === 'air') {
    const order = ['crevice', 'rocks', 'timber', 'crevice', 'timber', 'rocks'] as const;
    for (let i = 0; i < order.length; i += 1) {
      const lip = start + 130 + 197 * i + (i ? variant * 5 : 0);
      const kind = order[i]!;
      const x = center + (i === 0 ? 0 : (i % 2 ? side : -side) * (7 + variant * 2));
      const reach = kind === 'crevice' ? 39 + variant : kind === 'rocks' ? 25 : 21;
      jumps.push({ x, lip, halfWidth: kind === 'crevice' ? 5.2 : 4.3, gapStart: lip + 13,
        gapEnd: lip + reach, gapHalfWidth: kind === 'crevice' ? 9 : 6.2, kind });
    }
  }
  if (trail === 'chute') {
    chute.push({ y: start + 58, x: 0, width: 22 });
    const pattern = [[43, -7, 14], [41, -18, 9], [40, 1, 7.5], [42, 15, 8.9], [47, 8, 15], [50, -6, 18]] as const;
    let y = start + 58;
    for (let i = 0; y < end - FORK_LENGTH - 120; i += 1) {
      const [length, offset, width] = pattern[i % pattern.length]!;
      y += length + variant * 2;
      const mirror = Math.floor(i / pattern.length) % 2 ? -side : side;
      const x = offset * mirror * (1 + variant * 0.055);
      chute.push({ y, x, width: width - variant * 0.35 });
      if (i % 6 === 2 || i % 6 === 4) obstacle('rock', center + x + mirror * (width - 3.1),
        y + 3, i % 6 === 2 ? 1.88 : 2.4);
    }
    chute.push({ y: end - FORK_LENGTH - 20, x: 0, width: 25 });
  }
  if (trail === 'avalanche') {
    for (let i = 0; i < 3 + variant; i += 1) {
      const trigger = start + 245 + i * (225 + 5 * variant) + Math.floor(hashUnit(id, i, 12) * 16);
      const safeSide = (i % 2 ? -side : side) as -1 | 1;
      const safeEdge = 10 + variant;
      waves.push({ trigger, safeSide, safeEdge, speed: 48 + variant,
        lead: 59 - variant * 2, warningAt: trigger - 114 - (id % 11) });
      obstacle('rock', center + safeSide * 32, trigger - 28, 3.3);
      obstacle('tree', center + safeSide * 29, trigger - 19, 2.24);
      obstacle('rock', center - safeSide * 28, trigger + 14, 2.32);
    }
  }
  return { id, index, trail, variant, center, entryLane: offer.lane, start, end, opening: index === 0,
    offers: offersFor(trail, id, variant), gates, features, chute, glade, jumps, waves,
    expansion: makeExpansion(trail, id, variant, start, center) };
}

export function openingSection(seed: number, trail: Trail): Section {
  const id = hashCoordinates(seed, Object.keys(TRAILS).indexOf(trail), 0, 0x5afe);
  return createSection({ lane: 0, id, trail, variant: id % 3 }, 0, 0, 0);
}

export function takeRoute(section: Section, lane: Lane): Section {
  return createSection(section.offers[lane + 1]!, section.index + 1,
    section.center + lane * LANE_SPACING, section.end);
}

export function laneAt(section: Section, x: number): Lane {
  const relative = x - section.center;
  return relative < -LANE_SPACING / 2 ? -1 : relative > LANE_SPACING / 2 ? 1 : 0;
}

export function spawnPoint(section: Section, scenario: MountainScenario): WorldPosition {
  const { start, end, center, trail } = section;
  if (scenario === 'fork') return { x: center, y: end - PREVIEW_DISTANCE - 12 };
  if (scenario === 'summit') return { x: center, y: start };
  if (trail === 'hazards') {
    if (scenario === 'ice') return { x: center, y: section.expansion.ice[0]!.warningAt - 13 };
    if (scenario === 'boulder') return { x: center, y: section.expansion.boulders[0]!.start - 72 };
    return { x: center, y: section.expansion.boulders[1]!.start - 73 };
  }
  if (section.expansion.bowlReveal !== null) return { x: center, y: section.expansion.bowlReveal - 69 };
  if (trail === 'patrol') return { x: pathCenter(section, start + 102), y: start + 102 };
  const wave = section.waves[0];
  if (wave) return { x: center, y: wave.warningAt - 16 };
  return { x: center, y: section.glade ? section.glade.y - 106 : start + (trail === 'chute' ? 82 : 63) };
}

export function pathCenter(section: Section, y: number): number {
  const center = section.center - section.entryLane * LANE_SPACING *
    (1 - ease((y - section.start) / 76));
  if (section.trail === 'patrol') return center + patrolCenterOffset(section, y);
  if (section.trail !== 'chute') return center;
  const index = chuteSegment(section, y);
  const first = section.chute[index]!;
  const next = section.chute[index + 1]!;
  const exit = ease((section.end - FORK_LENGTH - y) / 94);
  return center + (first.x + (next.x - first.x) * ease((y - first.y) / (next.y - first.y))) * exit;
}

function chuteSegment(section: Section, y: number): number {
  const knots = section.chute;
  let i = 0;
  while (i < knots.length - 2 && y > knots[i + 1]!.y) i += 1;
  return i;
}

export function pathHalfWidth(section: Section, y: number): number {
  const distance = y - section.start;
  const finish = section.end - y;
  const entry = ease((distance - 30) / 95);
  const exit = ease((finish - FORK_LENGTH) / 68);
  let width = MAIN_WIDTH[section.trail];
  if (section.trail === 'patrol') width = patrolOuterWidth(section, y);
  if (section.trail === 'hazards') width = hazardWidth(section, y);
  if (section.trail === 'chute') {
    const index = chuteSegment(section, y);
    const first = section.chute[index]!;
    const next = section.chute[index + 1]!;
    width = first.width + (next.width - first.width) * ease((y - first.y) / (next.y - first.y));
  }
  return ENTRY_WIDTH + (width - ENTRY_WIDTH) * entry * exit;
}

export function patrolMedian(section: Section, y: number): { x: number; width: number } | null {
  const split = patrolSplitAt(section, y);
  if (!split) return null;
  const width = patrolMedianWidth(split, y);
  return { x: pathCenter(section, y) - width * 0.2, width };
}

export function skiBand(section: Section, x: number, y: number): { left: number; right: number } {
  const center = pathCenter(section, y);
  const width = pathHalfWidth(section, y);
  const median = patrolMedian(section, y);
  if (!median || median.width < 0.38) return { left: center - width, right: center + width };
  return x < median.x
    ? { left: center - width, right: median.x - median.width }
    : { left: median.x + median.width, right: center + width };
}

export function interpolateX(before: Readonly<WorldPosition>, after: Readonly<WorldPosition>, y: number): number {
  const progress = (y - before.y) / Math.max(0.00001, after.y - before.y);
  return before.x + (after.x - before.x) * progress;
}

export function describeSectionCell(section: Section | null, cellX: number, cellY: number, cellSize: number, target: FeatureDescriptor): void {
  target.type = 'none';
  if (!section) return;
  const { id, start, end, center, trail } = section;
  const gridY = (cellY + 0.5) * cellSize;
  const y = gridY + (hashUnit(id, cellX, cellY, 21) - 0.5) * cellSize * 0.72;
  const x = (cellX + 0.5 + (hashUnit(id, cellX, cellY, 22) - 0.5) * 0.8) * cellSize;
  if (y < start + (section.opening ? 38 : 78) || y > end - FORK_LENGTH - 26) return;
  const side = Math.abs(x - pathCenter(section, y));
  const width = pathHalfWidth(section, y);
  const pick = hashUnit(id, cellX, cellY, 23);
  if (trail === 'sun' || trail === 'busy') {
    if (side < width + 8 || pick > 0.17) return;
    target.type = pick < 0.08 ? 'rock' : 'tree';
  } else if (trail === 'patrol') {
    if (side < width + 4 || pick > 0.69) return;
    target.type = pick < 0.36 ? 'rock' : 'tree';
  } else if (trail === 'pine') {
    const grove = Math.sin((y - start) / 57) * Math.cos((x - center) / 14 + section.variant) +
      Math.sin((y - start) / 143 + section.variant) * 0.44;
    const gladeY = section.glade!.y;
    const signature = y > gladeY - 114 && y < gladeY + 62;
    if (side < 7 || (signature && side < 36) || pick > (side > width ? 0.81 : 0.43 + grove * 0.31)) return;
    target.type = pick > 0.73 ? 'rock' : 'tree';
  } else if (side > width + (trail === 'chute' ? 3 : 4) && pick < (trail === 'chute' ? 0.94 : 0.31)) {
    target.type = trail === 'chute' ? (side > width + 10 && pick > 0.11 ? 'tree' : 'rock')
      : trail === 'avalanche' || pick > 0.22 ? 'rock' : 'tree';
  } else {
    return;
  }
  const scale = trail === 'chute' ? 1.45 + hashUnit(id, cellX, cellY, 25) * 1.35
    : 0.8 + hashUnit(id, cellX, cellY, 25) * (trail === 'pine' ? 0.95 : 0.56);
  target.id = hashCoordinates(id, cellX, cellY, 24);
  target.x = x;
  target.y = y;
  target.scale = scale;
  target.radius = (target.type === 'tree' ? 1.05 : 0.88) * scale;
  if (trail !== 'pine' && side - target.radius < width + 0.8) target.type = 'none';
}

export function slideEdge(wave: SlideWave, center: number, x: number, front: number): number {
  const across = (x - center) * wave.safeSide;
  return front - Math.max(0, across + 12) * 0.27;
}

export function jumpAtLip(section: Section, before: Readonly<WorldPosition>, after: Readonly<WorldPosition>): boolean {
  return section.jumps.some((jump) => before.y < jump.lip && after.y >= jump.lip &&
    Math.abs(interpolateX(before, after, jump.lip) - jump.x) < jump.halfWidth);
}

export function hitsJumpObstacle(section: Section, point: Readonly<WorldPosition>, height: number): boolean {
  return section.jumps.some((jump) => point.y >= jump.gapStart && point.y < jump.gapEnd &&
    point.x > jumpGapEdge(jump, point.y, -1) && point.x < jumpGapEdge(jump, point.y, 1) &&
    height < (jump.kind === 'crevice' ? 0.24 : jump.kind === 'rocks' ? 0.7 : 0.55));
}

const GAP_PROFILES = [
  [-0.84, -1.03, -0.83, -1.03, -0.80],
  [0.76, 0.94, 0.89, 1.09, 0.82],
] as const;

export function jumpGapEdge(jump: JumpLine, y: number, side: -1 | 1): number {
  if (jump.kind !== 'crevice') return jump.x + side * jump.gapHalfWidth;
  const profile = GAP_PROFILES[side === -1 ? 0 : 1]!;
  const t = Math.max(0, Math.min(4, 4 * (y - jump.gapStart) / (jump.gapEnd - jump.gapStart)));
  const i = Math.min(3, Math.floor(t));
  const offset = profile[i]! + (profile[i + 1]! - profile[i]!) * (t - i);
  return jump.x + offset * jump.gapHalfWidth;
}
