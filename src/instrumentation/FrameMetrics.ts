export interface MetricsSnapshot {
  fps: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  onePercentLowFps: number;
  maxMs: number;
  longFrames25ms: number;
  longFrames50ms: number;
  sampleCount: number;
}

const SAMPLE_CAPACITY = 600;
const PERCENTILE_REFRESH_FRAMES = 30;

/** Allocation-free rolling frame metrics. Percentiles refresh twice per second. */
export class FrameMetrics {
  private readonly samples = new Float32Array(SAMPLE_CAPACITY);
  private readonly ordered = new Float32Array(SAMPLE_CAPACITY);
  private readonly current: MetricsSnapshot = {
    fps: 0,
    averageMs: 0,
    medianMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    onePercentLowFps: 0,
    maxMs: 0,
    longFrames25ms: 0,
    longFrames50ms: 0,
    sampleCount: 0,
  };
  private cursor = 0;
  private count = 0;
  private sum = 0;
  private framesUntilRefresh = 0;

  push(frameMs: number): Readonly<MetricsSnapshot> {
    if (this.count === SAMPLE_CAPACITY) this.sum -= this.samples[this.cursor] ?? 0;
    else this.count += 1;
    this.samples[this.cursor] = frameMs;
    this.sum += frameMs;
    this.cursor = (this.cursor + 1) % SAMPLE_CAPACITY;
    this.current.sampleCount = this.count;
    this.current.averageMs = this.sum / this.count;
    this.current.fps = 1000 / this.current.averageMs;
    this.framesUntilRefresh -= 1;
    if (this.framesUntilRefresh <= 0) {
      this.refreshPercentiles();
      this.framesUntilRefresh = PERCENTILE_REFRESH_FRAMES;
    }
    return this.current;
  }

  snapshot(): Readonly<MetricsSnapshot> {
    return this.current;
  }

  private refreshPercentiles(): void {
    if (this.count === 0) return;
    this.ordered.set(this.samples.subarray(0, this.count), 0);
    const sorted = this.ordered.subarray(0, this.count);
    sorted.sort();
    this.current.medianMs = sorted[Math.floor((this.count - 1) * 0.5)] ?? 0;
    this.current.p95Ms = sorted[Math.floor((this.count - 1) * 0.95)] ?? 0;
    this.current.p99Ms = sorted[Math.floor((this.count - 1) * 0.99)] ?? 0;
    this.current.onePercentLowFps = 1000 / Math.max(0.001, this.current.p99Ms);
    this.current.maxMs = sorted[this.count - 1] ?? 0;
    let long25 = 0;
    let long50 = 0;
    for (let index = 0; index < this.count; index += 1) {
      const value = sorted[index] ?? 0;
      if (value > 25) long25 += 1;
      if (value > 50) long50 += 1;
    }
    this.current.longFrames25ms = long25;
    this.current.longFrames50ms = long50;
  }
}
