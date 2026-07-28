export class FixedStepLoop {
  private accumulator = 0;
  private previous = 0;
  private frameHandle = 0;

  constructor(
    private readonly stepSeconds: number,
    private readonly maxFrameSeconds: number,
    private readonly update: (deltaSeconds: number) => void,
    private readonly render: (alpha: number, frameMs: number) => void,
  ) {}

  start(): void {
    this.previous = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frameHandle);
  }

  private readonly tick = (now: number): void => {
    const frameSeconds = Math.min((now - this.previous) / 1000, this.maxFrameSeconds);
    this.previous = now;
    this.accumulator += frameSeconds;

    while (this.accumulator >= this.stepSeconds) {
      this.update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }

    this.render(this.accumulator / this.stepSeconds, frameSeconds * 1000);
    this.frameHandle = requestAnimationFrame(this.tick);
  };
}
