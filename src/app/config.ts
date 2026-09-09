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
  readonly performance: PerformanceConfig;
}

export interface PerformanceConfig {
  readonly disabled: ReadonlySet<string>;
  readonly renderScale: number | null;
  readonly maxCanvasPixels: number;
}

const query = new URLSearchParams(location.search);
const quality = query.get('quality');
const replay = query.get('replay');
const replayWorldSeed = replaySeed(replay);
const disabled = new Set((query.get('disable') ?? '').split(',').filter(Boolean));
const developmentMode = import.meta.env.DEV || query.has('dev');

export const GAME_CONFIG: GameConfig = {
  seed: replayWorldSeed ?? Number(query.get('seed') ?? 0x51f15e),
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
  replay: replayWorldSeed === null ? null : replay,
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
import { replaySeed } from '../simulation/ReplaySystem';
