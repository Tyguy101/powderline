export class FixedStepLoop {
  private accumulator = 0;
  private previous = 0;
  private frameHandle = 0;
  private stepsLastFrame = 0;
  private maxStepsObserved = 0;
  private running = false;

  constructor(
    private readonly stepSeconds: number,
    private readonly maxFrameSeconds: number,
    private readonly update: (deltaSeconds: number) => void,
    private readonly render: (alpha: number, frameMs: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.stepsLastFrame = 0;
    this.previous = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.accumulator = 0;
    this.stepsLastFrame = 0;
  }

  resetClock(): void {
    this.accumulator = 0;
    this.previous = performance.now();
    this.stepsLastFrame = 0;
  }

  get latestStepCount(): number {
    return this.stepsLastFrame;
  }

  get peakStepCount(): number {
    return this.maxStepsObserved;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const frameSeconds = Math.min((now - this.previous) / 1000, this.maxFrameSeconds);
    this.previous = now;
    this.accumulator += frameSeconds;

    let steps = 0;
    while (this.accumulator >= this.stepSeconds) {
      this.update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }
    this.stepsLastFrame = steps;
    this.maxStepsObserved = Math.max(this.maxStepsObserved, steps);

    this.render(this.accumulator / this.stepSeconds, frameSeconds * 1000);
    if (this.running) this.frameHandle = requestAnimationFrame(this.tick);
  };
}
