import { describe, expect, it } from 'vitest';
import { selectCrashReaction, type ImpactContext } from '../simulation/CrashReaction';

function impact(overrides: Partial<ImpactContext> = {}): ImpactContext {
  return {
    seed: 424242,
    obstacleId: 9182,
    obstacleType: 'tree',
    obstacleRadius: 1.1,
    speed: 26,
    velocityX: 0,
    velocityY: 26,
    facing: 0,
    carve: 0,
    airborneHeight: 0,
    normalX: 0,
    normalY: -1,
    contactX: 2.25,
    contactY: 90.5,
    contactOffset: 0,
    ...overrides,
  };
}

describe('deterministic crash selection', () => {
  it('reproduces the complete reaction for the same impact', () => {
    expect(selectCrashReaction(impact())).toEqual(selectCrashReaction(impact()));
  });

  it('classifies a centered tree hit as an obstacle slam', () => {
    const reaction = selectCrashReaction(impact());
    expect(reaction.outcome).toBe('crash');
    expect(reaction.family).toBe('obstacle-slam');
  });

  it('turns a fast glancing hit into a side spin', () => {
    const reaction = selectCrashReaction(
      impact({
        velocityX: 25,
        velocityY: 7,
        normalX: 0,
        normalY: -1,
        contactOffset: 0.9,
      }),
    );
    expect(reaction.family).toBe('side-spin');
    expect(['minor', 'stumble']).toContain(reaction.outcome);
  });

  it('uses rocks and speed to produce rolling tumbles and stronger launches', () => {
    const tree = selectCrashReaction(impact({ speed: 31, velocityY: 31 }));
    const rock = selectCrashReaction(
      impact({ obstacleType: 'rock', obstacleId: 7781, speed: 31, velocityY: 31 }),
    );
    expect(rock.family).toBe('rolling-tumble');
    expect(rock.launch).toBeGreaterThan(tree.launch);
    expect(rock.rolls).toBeGreaterThan(0);
  });

  it('changes controlled variation without frame-time randomness', () => {
    const first = selectCrashReaction(impact({ variation: 1 }));
    const second = selectCrashReaction(impact({ variation: 2 }));
    expect(first.variant).not.toBe(second.variant);
  });
});
