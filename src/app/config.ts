import { deserializeReplay, type MountainReplaySettings } from '../simulation/ReplaySystem';
import { isScenario, isTrail } from '../world/EndlessMountain';

export type QualityPreset = 'potato' | 'low' | 'medium' | 'high';

export interface GameConfig {
  readonly seed: number;
  readonly fixedStepSeconds: number;
  readonly maxFrameSeconds: number;
  readonly rebaseDistance: number;
  readonly quality: QualityPreset;
  readonly developmentMode: boolean;
  readonly cameraTestMode: boolean;
  readonly poseGalleryMode: boolean;
  readonly crashLabMode: boolean;
  readonly npcLabMode: boolean;
  readonly touchDebugMode: boolean;
  readonly mobileTouchScheme: 'split' | 'drag';
  readonly mobileCameraMode: 'landscape' | 'legacy';
  readonly replay: string | null;
  readonly replayError: string | null;
  readonly mountain: MountainReplaySettings | null;
  readonly performance: PerformanceConfig;
}

export interface PerformanceConfig {
  readonly disabled: ReadonlySet<string>;
  readonly renderScale: number | null;
  readonly maxCanvasPixels: number;
}

const query = new URLSearchParams(location.search);
const quality = query.get('quality');
export function replayFromHash(hash: string): string | null {
  return new URLSearchParams(hash.slice(1)).get('replay');
}

const replay = query.get('replay') ?? replayFromHash(location.hash);
const replayData = readReplay(replay);
const disabled = new Set((query.get('disable') ?? '').split(',').filter(Boolean));
const developmentMode = import.meta.env.DEV || query.has('dev');

function readReplay(value: string | null) {
  if (!value) return null;
  try {
    return deserializeReplay(value);
  } catch {
    return null;
  }
}

export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

const requestedSeed = query.get('seed');
const explicitSeed = requestedSeed !== null && /^\d+$/.test(requestedSeed) && Number(requestedSeed) <= 0xffffffff;
const requestedTrail = query.get('section');
const requestedScenario = query.get('scenario');
const classic = replayData ? !replayData.mountain : query.get('course') === 'classic';
const seed = replayData?.seed ?? (explicitSeed ? Number(requestedSeed) : classic ? 0x51f15e : newRunSeed());

export const GAME_CONFIG: GameConfig = {
  seed,
  fixedStepSeconds: 1 / 60,
  maxFrameSeconds: 0.2,
  rebaseDistance: 4096,
  developmentMode,
  cameraTestMode: query.has('cameraTest'),
  poseGalleryMode: query.has('poseGallery'),
  crashLabMode: query.has('crashLab'),
  npcLabMode: query.has('npcLab'),
  touchDebugMode: developmentMode && query.has('touchDebug'),
  mobileTouchScheme:
    developmentMode && query.get('mobileControls') === 'drag' ? 'drag' : 'split',
  mobileCameraMode:
    developmentMode && query.get('mobileCamera') === 'legacy' ? 'legacy' : 'landscape',
  replay: replayData ? replay : null,
  replayError: replay !== null && !replayData
    ? 'This replay is invalid or uses an older mountain layout. Version 6 replays play on the original Endless Mountain branch.'
    : null,
  mountain: classic ? null : replayData?.mountain ?? {
    trail: isTrail(requestedTrail) ? requestedTrail : 'pine',
    scenario: isScenario(requestedScenario) ? requestedScenario : 'summit',
    npcCount: quality === 'potato' || quality === 'low' ? 3 : 5,
    npcSimulation: !disabled.has('npcSim'),
    collisions: !disabled.has('collisions'),
  },
  performance: {
    disabled,
    renderScale: query.has('renderScale')
      ? Math.max(0.5, Math.min(2, Number(query.get('renderScale')) || 1))
      : null,
    maxCanvasPixels: Math.max(
      1_000_000,
      Number(query.get('maxCanvasPixels')) || 1_000_000,
    ),
  },
  quality:
    quality === 'potato' || quality === 'low' || quality === 'high'
      ? quality
      : 'medium',
};
