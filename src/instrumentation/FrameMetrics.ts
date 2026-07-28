export interface MetricsSnapshot {
  fps: number;
  averageMs: number;
  onePercentLowFps: number;
  sampleCount: number;
}

export class FrameMetrics {
  private readonly samples = new Float32Array(240);
  private cursor = 0;
  private count = 0;

  push(frameMs: number): MetricsSnapshot {
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    return this.snapshot();
  }

  snapshot(): MetricsSnapshot {
    if (this.count === 0) return { fps: 0, averageMs: 0, onePercentLowFps: 0, sampleCount: 0 };
    const ordered = Array.from(this.samples.slice(0, this.count)).sort((a, b) => a - b);
    const averageMs = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
    const tailIndex = Math.min(ordered.length - 1, Math.floor(ordered.length * 0.99));
    const lowFrameMs = ordered[tailIndex] ?? averageMs;
    return {
      fps: 1000 / averageMs,
      averageMs,
      onePercentLowFps: 1000 / lowFrameMs,
      sampleCount: this.count,
    };
  }
}
