import type { InputState } from '../input/InputState';
import type { WorldPosition } from '../core/WorldCoordinates';

export interface SkiState {
  readonly position: WorldPosition;
  velocityX: number;
  velocityY: number;
  facing: number;
  carve: number;
  crashed: boolean;
}

export class SkiPhysics {
  readonly state: SkiState = {
    position: { x: 0, y: 0 },
    velocityX: 0,
    velocityY: 12,
    facing: 0,
    carve: 0,
    crashed: false,
  };

  step(delta: number, input: Readonly<InputState>): void {
    const state = this.state;
    if (state.crashed) return;
    const targetCarve = input.steer;
    state.carve += (targetCarve - state.carve) * Math.min(1, delta * 7);
    const speed = Math.hypot(state.velocityX, state.velocityY);
    const steeringForce = 17 / (1 + speed * 0.018);
    state.velocityX += state.carve * steeringForce * delta;
    state.velocityX *= Math.exp(-1.65 * delta);
    state.velocityY += 8.4 * delta;
    if (input.tuck) state.velocityY += 4.8 * delta;
    const traverseDrag = 1 + Math.abs(state.carve) * 0.38;
    state.velocityY *= Math.exp(-0.22 * traverseDrag * delta);
    if (input.brake) state.velocityY *= Math.exp(-2.4 * delta);
    state.velocityY = Math.max(4, Math.min(34, state.velocityY));
    state.position.x += state.velocityX * delta;
    state.position.y += state.velocityY * delta;
    state.facing += (state.carve * 0.55 - state.facing) * Math.min(1, delta * 6);
  }

  crash(): void {
    this.state.crashed = true;
    this.state.velocityX = 0;
    this.state.velocityY = 0;
    this.state.carve = 0;
  }

  reset(): void {
    this.state.position.x = 0;
    this.state.position.y = 0;
    this.state.velocityX = 0;
    this.state.velocityY = 12;
    this.state.facing = 0;
    this.state.carve = 0;
    this.state.crashed = false;
  }
}
