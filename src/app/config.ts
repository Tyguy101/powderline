export type QualityPreset = 'potato' | 'low' | 'medium' | 'high';

export interface GameConfig {
  readonly seed: number;
  readonly fixedStepSeconds: number;
  readonly maxFrameSeconds: number;
  readonly rebaseDistance: number;
  readonly quality: QualityPreset;
}

const query = new URLSearchParams(location.search);
const quality = query.get('quality');

export const GAME_CONFIG: GameConfig = {
  seed: Number(query.get('seed') ?? 0x51f15e),
  fixedStepSeconds: 1 / 60,
  maxFrameSeconds: 0.2,
  rebaseDistance: 4096,
  quality:
    quality === 'potato' || quality === 'low' || quality === 'high'
      ? quality
      : 'medium',
};
