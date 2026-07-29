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
  readonly replay: string | null;
}

const query = new URLSearchParams(location.search);
const quality = query.get('quality');
const replay = query.get('replay');
const replayWorldSeed = replaySeed(replay);

export const GAME_CONFIG: GameConfig = {
  seed: replayWorldSeed ?? Number(query.get('seed') ?? 0x51f15e),
  fixedStepSeconds: 1 / 60,
  maxFrameSeconds: 0.2,
  rebaseDistance: 4096,
  developmentMode: import.meta.env.DEV || query.has('dev'),
  cameraTestMode: query.has('cameraTest'),
  poseGalleryMode: query.has('poseGallery'),
  crashLabMode: query.has('crashLab'),
  replay: replayWorldSeed === null ? null : replay,
  quality:
    quality === 'potato' || quality === 'low' || quality === 'high'
      ? quality
      : 'medium',
};
import { replaySeed } from '../simulation/ReplaySystem';
