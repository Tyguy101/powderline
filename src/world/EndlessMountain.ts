import { hashCoordinates, hashUnit } from '../core/SeededHash';
import type { WorldPosition } from '../core/WorldCoordinates';
import type { FeatureDescriptor } from './FeatureGeneratorCPU';

export const TRAILS = {
  pine: { name: 'Pine Glades', difficulty: 'Normal', cue: 'Open lines through the pines', color: '#167866' },
  gate: { name: 'Gate Run', difficulty: 'Difficult', cue: 'Alternating slalom gates', color: '#2865b8' },
  air: { name: 'Big Air Park', difficulty: 'Extreme', cue: 'Jump lines and clear bypasses', color: '#9a4ab4' },
  chute: { name: 'Needle Chute', difficulty: 'Extreme', cue: 'Brake before the rock narrows', color: '#a65a26' },
  avalanche: { name: 'Avalanche Alley', difficulty: 'Dangerous', cue: 'Cut out of the slide path', color: '#b53e4d' },
} as const;

export type Trail = keyof typeof TRAILS;
export type MountainScenario = 'summit' | 'fork' | 'encounter';
export type Lane = -1 | 0 | 1;
export const LANES = [-1, 0, 1] as const;
export const FORK_LENGTH = 64;
export const LANE_SPACING = 18;
export const ENTRY_WIDTH = 37;
export const PREVIEW_DISTANCE = 145;
export const WORLD_LOOK_BEHIND = 100;
const MAIN_WIDTH: Record<Trail, number> = { pine: 43, gate: 36, air: 40, chute: 24, avalanche: 43 };

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

export interface SlidePath {
  trigger: number;
  shelterStart: number;
  shelterEnd: number;
  shelterEdge: number;
  speed: number;
  lead: number;
  warningAt: number;
}

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
  chute: readonly number[];
  slide: SlidePath | null;
}

export function isTrail(value: unknown): value is Trail {
  return typeof value === 'string' && Object.hasOwn(TRAILS, value);
}

export function isScenario(value: unknown): value is MountainScenario {
  return value === 'summit' || value === 'fork' || value === 'encounter';
}

function offersFor(trail: Trail, id: number, variant: number): RouteOffer[] {
  const left: Record<Trail, Trail> = {
    pine: 'gate',
    gate: variant === 1 ? 'chute' : 'air',
    air: 'avalanche',
    chute: 'avalanche',
    avalanche: variant === 1 ? 'air' : 'chute',
  };
  const right: Record<Trail, Trail> = {
    pine: 'pine',
    gate: 'pine',
    air: 'chute',
    chute: 'gate',
    avalanche: 'gate',
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
  const length = ({ pine: 1390, gate: 1430, air: 1560, chute: 1220, avalanche: 1460 })[trail] +
    variant * 95 + Math.floor(hashUnit(id, 1, 0) * 140);
  const end = start + length;
  const gates: CourseGate[] = [];
  const features: FeatureDescriptor[] = [];
  const chute: number[] = [0];
  const side = (id & 1) === 0 ? 1 : -1;
  if (trail === 'pine') {
    const y = start + 365 + variant * 44;
    const slabs = [[20, -4, 3.2], [26, 0, 4.0], [20, 4, 2.5], [30, 6, 2.2]] as const;
    for (const [offsetX, offsetY, scale] of slabs) {
      features.push({ id: hashCoordinates(id, offsetX, offsetY, 24), type: 'rock',
        x: center + side * offsetX, y: y + offsetY, scale, radius: 0.88 * scale });
    }
  }
  if (trail === 'gate') {
    let y = start + 112;
    while (y < end - FORK_LENGTH - 55) {
      const i = gates.length;
      const distance = (i % 5 === 4 ? 6 : 8) + hashUnit(id, i, 7) * (3 + variant);
      gates.push({ x: center + side * (i % 2 === 0 ? -distance : distance), y, halfWidth: i % 5 === 4 ? 6.5 : 5.5 });
      y += (i % 6 === 2 ? 58 : 42) + hashUnit(id, i, 9) * 12 - variant * 3;
    }
  }
  if (trail === 'air') {
    const sequences: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
      [[0, 0, 2.2], [70, 1, 2.8], [145, 1, 3.2]],
      [[0, 0, 3.2], [105, -1, 2.8]],
      [[0, 1, 3.1], [112, -1, 3.4]],
      [[0, 1, 2.25], [63, 1, 2.5], [132, 1, 3.2]],
      [[0, 0, 2.9], [95, -1, 3.55]],
    ];
    for (let group = 0; group < 5; group += 1) {
      const y = start + 126 + group * 235;
      const lateral = side * (group % 2 === 0 ? 1 : -1) * (11 + variant * 2);
      for (const [offset, lane, scale] of sequences[group]!) {
        features.push({
          id: hashCoordinates(id, group, offset, 81), type: 'ramp',
          x: center + lane * lateral, y: y + offset, radius: 0.72 * scale, scale,
        });
      }
    }
  }
  if (trail === 'chute') {
    for (let i = 1; i < Math.ceil(length / 82); i += 1) {
      const rhythm = Math.sin(i * 1.13) * 0.72 + Math.sin(i * 0.53) * 0.28;
      chute.push(side * rhythm * (15 + variant * 3));
    }
    chute.push(0);
  }
  const trigger = start + 305 + variant * 38;
  const slide = trail === 'avalanche' ? {
    trigger, warningAt: trigger - 142,
    shelterStart: trigger + 26, shelterEnd: trigger + 375,
    shelterEdge: 22 + variant, speed: 38 + variant * 0.5, lead: 54 - variant * 4,
  } : null;
  return { id, index, trail, variant, center, entryLane: offer.lane, start, end, opening: index === 0,
    offers: offersFor(trail, id, variant), gates, features, chute, slide };
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
  const { start, end, center, trail, slide } = section;
  if (scenario === 'fork') return { x: center, y: end - PREVIEW_DISTANCE - 12 };
  if (scenario === 'summit') return { x: center, y: start };
  if (slide) return { x: center, y: slide.warningAt - 16 };
  return { x: center, y: start + (trail === 'pine' ? 295 : 63) };
}

function ease(t: number): number {
  const a = Math.max(0, Math.min(1, t));
  return a * a * (3 - 2 * a);
}

export function pathCenter(section: Section, y: number): number {
  const center = section.center - section.entryLane * LANE_SPACING *
    (1 - ease((y - section.start) / 76));
  if (section.trail !== 'chute') return center;
  const offset = y - section.start - 52;
  const segment = Math.max(0, Math.floor(offset / 82));
  const first = section.chute[segment] ?? 0;
  const next = section.chute[segment + 1] ?? 0;
  const exit = ease((section.end - FORK_LENGTH - y) / 94);
  return center + (first + (next - first) * ease(offset / 82 - segment)) * exit;
}

export function pathHalfWidth(section: Section, y: number): number {
  const distance = y - section.start;
  const finish = section.end - y;
  const entry = ease((distance - 30) / 95);
  const exit = ease((finish - FORK_LENGTH) / 68);
  const width = section.trail === 'chute'
    ? 7.8 + (1 - Math.sin((distance - 5) / 48) ** 2) * 10
    : MAIN_WIDTH[section.trail];
  return ENTRY_WIDTH + (width - ENTRY_WIDTH) * entry * exit;
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
  if (trail === 'pine') {
    const grove = Math.sin((y - start) / 57) * Math.cos((x - center) / 14 + section.variant) +
      Math.sin((y - start) / 143 + section.variant) * 0.44;
    const clearing = Math.abs((y - start) - (365 + section.variant * 44)) < 55;
    if (side < 7 || (clearing && side < 25) || pick > (side > width ? 0.81 : 0.43 + grove * 0.31)) return;
    target.type = pick > 0.73 ? 'rock' : 'tree';
  } else if (side > width + (trail === 'chute' ? 1 : 3) && pick < (trail === 'chute' ? 0.68 : 0.31)) {
    target.type = trail === 'chute' || trail === 'avalanche' || pick > 0.22 ? 'rock' : 'tree';
  } else {
    return;
  }
  const scale = trail === 'chute' ? 1.5 + hashUnit(id, cellX, cellY, 25) * 1.8
    : 0.8 + hashUnit(id, cellX, cellY, 25) * (trail === 'pine' ? 0.95 : 0.56);
  target.id = hashCoordinates(id, cellX, cellY, 24);
  target.x = x;
  target.y = y;
  target.scale = scale;
  target.radius = (target.type === 'tree' ? 1.05 : 0.88) * scale;
  if (trail !== 'pine' && side - target.radius < width + 0.8) target.type = 'none';
}

export function slideEdge(center: number, x: number, front: number): number {
  return front - Math.abs(x - center) * 0.32;
}

export function inShelter(section: Section, point: Readonly<WorldPosition>): boolean {
  const slide = section.slide;
  return !!slide && point.y >= slide.shelterStart && point.y <= slide.shelterEnd &&
    Math.abs(point.x - section.center) >= slide.shelterEdge;
}
