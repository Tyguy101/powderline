export interface TimingSnapshot {
  latestMs: number;
  averageMs: number;
  maxMs: number;
  samples: number;
}

export class TimingCounter {
  readonly snapshot: TimingSnapshot = {
    latestMs: 0,
    averageMs: 0,
    maxMs: 0,
    samples: 0,
  };
  private sum = 0;

  push(milliseconds: number): void {
    this.snapshot.latestMs = milliseconds;
    this.snapshot.samples += 1;
    this.sum += milliseconds;
    this.snapshot.averageMs = this.sum / this.snapshot.samples;
    this.snapshot.maxMs = Math.max(this.snapshot.maxMs, milliseconds);
    if (this.snapshot.samples >= 600) {
      this.sum = this.snapshot.averageMs;
      this.snapshot.samples = 1;
    }
  }
}
