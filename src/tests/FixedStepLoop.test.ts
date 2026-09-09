import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepLoop } from '../core/FixedStepLoop';

describe('fixed-step lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resets elapsed time when restarting after a long suspension', () => {
    let now = 1_000;
    let nextHandle = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextHandle += 1;
      frames.set(nextHandle, callback);
      return nextHandle;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
    const update = vi.fn();
    const loop = new FixedStepLoop(1 / 60, 0.2, update, vi.fn());

    loop.start();
    frames.get(1)?.(1_017);
    expect(update).toHaveBeenCalledTimes(1);
    loop.stop();

    now = 31_000;
    loop.start();
    frames.get(3)?.(31_017);
    expect(update).toHaveBeenCalledTimes(2);
    expect(loop.latestStepCount).toBe(1);
  });
});
