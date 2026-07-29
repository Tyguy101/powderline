export interface WorldPosition {
  x: number;
  y: number;
}

export class CameraRelativeOrigin {
  readonly origin: WorldPosition = { x: 0, y: 0 };

  constructor(private readonly threshold: number) {}

  update(position: Readonly<WorldPosition>): boolean {
    const dx = position.x - this.origin.x;
    const dy = position.y - this.origin.y;
    if (Math.abs(dx) < this.threshold && Math.abs(dy) < this.threshold) return false;
    this.origin.x = Math.round(position.x / this.threshold) * this.threshold;
    this.origin.y = Math.round(position.y / this.threshold) * this.threshold;
    return true;
  }

  relative(position: Readonly<WorldPosition>): WorldPosition {
    return { x: position.x - this.origin.x, y: position.y - this.origin.y };
  }

  reset(position: Readonly<WorldPosition>): void {
    this.origin.x = position.x;
    this.origin.y = position.y;
  }
}
