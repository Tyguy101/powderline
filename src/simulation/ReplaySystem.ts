import type { InputState } from '../input/InputState';

// Increment whenever authoritative fixed-step physics changes.
const REPLAY_VERSION = 3;

interface ReplayRun {
  frames: number;
  steer: number;
  flags: number;
}

export interface ReplayData {
  version: number;
  seed: number;
  runs: ReplayRun[];
}

function encodeBase64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

export function deserializeReplay(serialized: string): ReplayData {
  const parsed = JSON.parse(decodeBase64Url(serialized)) as Partial<ReplayData>;
  if (
    parsed.version !== REPLAY_VERSION ||
    !Number.isInteger(parsed.seed) ||
    !Array.isArray(parsed.runs)
  ) {
    throw new Error('Unsupported or invalid Powderline replay.');
  }
  const runs = parsed.runs.map((run) => {
    if (
      !Number.isInteger(run.frames) ||
      run.frames < 1 ||
      !Number.isInteger(run.steer) ||
      run.steer < -127 ||
      run.steer > 127 ||
      !Number.isInteger(run.flags) ||
      run.flags < 0 ||
      run.flags > 3
    ) {
      throw new Error('Powderline replay contains invalid input data.');
    }
    return { frames: run.frames, steer: run.steer, flags: run.flags };
  });
  return { version: REPLAY_VERSION, seed: parsed.seed!, runs };
}

export function replaySeed(serialized: string | null): number | null {
  if (!serialized) return null;
  try {
    return deserializeReplay(serialized).seed;
  } catch {
    return null;
  }
}

export class ReplaySystem {
  private runs: ReplayRun[] = [];
  private playback: ReplayData | null;
  private playbackRun = 0;
  private playbackFrame = 0;
  private readonly sampled: InputState = { steer: 0, brake: false, tuck: false };
  private readonly source: string | null;

  constructor(
    private readonly seed: number,
    serialized: string | null,
  ) {
    this.source = serialized;
    this.playback = serialized ? deserializeReplay(serialized) : null;
  }

  get isPlayback(): boolean {
    return this.playback !== null;
  }

  sample(live: Readonly<InputState>): Readonly<InputState> {
    if (this.playback) return this.samplePlayback();
    const steer = Math.round(Math.max(-1, Math.min(1, live.steer)) * 127);
    const flags = Number(live.brake) | (Number(live.tuck) << 1);
    const last = this.runs.at(-1);
    if (last && last.steer === steer && last.flags === flags && last.frames < 65535) {
      last.frames += 1;
    } else {
      this.runs.push({ frames: 1, steer, flags });
    }
    this.writeSample(steer, flags);
    return this.sampled;
  }

  serialize(): string {
    if (this.source) return this.source;
    return encodeBase64Url(
      JSON.stringify({ version: REPLAY_VERSION, seed: this.seed >>> 0, runs: this.runs }),
    );
  }

  reset(): void {
    this.runs = [];
    this.playbackRun = 0;
    this.playbackFrame = 0;
  }

  private samplePlayback(): Readonly<InputState> {
    const run = this.playback?.runs[this.playbackRun];
    if (!run) {
      this.writeSample(0, 0);
      return this.sampled;
    }
    this.writeSample(run.steer, run.flags);
    this.playbackFrame += 1;
    if (this.playbackFrame >= run.frames) {
      this.playbackFrame = 0;
      this.playbackRun += 1;
    }
    return this.sampled;
  }

  private writeSample(steer: number, flags: number): void {
    this.sampled.steer = steer / 127;
    this.sampled.brake = (flags & 1) !== 0;
    this.sampled.tuck = (flags & 2) !== 0;
  }
}
