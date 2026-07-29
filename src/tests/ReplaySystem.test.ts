import { describe, expect, it } from 'vitest';
import { deserializeReplay, ReplaySystem, replaySeed } from '../simulation/ReplaySystem';

describe('replay serialization', () => {
  it('round-trips quantized fixed-step inputs and seed', () => {
    const recorder = new ReplaySystem(424242, null);
    const liveFrames = [
      { steer: 0, brake: false, tuck: false },
      { steer: 0.5, brake: false, tuck: false },
      { steer: 0.5, brake: false, tuck: false },
      { steer: -1, brake: true, tuck: false },
      { steer: 0, brake: false, tuck: true },
    ];
    const recorded = liveFrames.map((input) => ({ ...recorder.sample(input) }));
    const serialized = recorder.serialize();
    const data = deserializeReplay(serialized);
    const player = new ReplaySystem(data.seed, serialized);
    const played = liveFrames.map(() => ({
      ...player.sample({ steer: 0, brake: false, tuck: false }),
    }));

    expect(replaySeed(serialized)).toBe(424242);
    expect(data.runs).toHaveLength(4);
    expect(played).toEqual(recorded);
  });
});
