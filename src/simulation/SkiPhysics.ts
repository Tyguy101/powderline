import type { InputState } from '../input/InputState';
import type { WorldPosition } from '../core/WorldCoordinates';

export interface SkiState {
  readonly position: WorldPosition;
  velocityX: number;
  velocityY: number;
  facing: number;
  carve: number;
  steeringHold: number;
  crashed: boolean;
}

export class SkiPhysics {
  readonly state: SkiState = {
    position: { x: 0, y: 0 },
    velocityX: 0,
    velocityY: 12,
    facing: 0,
    carve: 0,
    steeringHold: 0,
    crashed: false,
  };

  step(delta: number, input: Readonly<InputState>): void {
    const state = this.state;
    if (state.crashed) return;
    const targetCarve = input.steer;
    state.carve += (targetCarve - state.carve) * Math.min(1, delta * 7);
    const inputDirection = Math.sign(targetCarve);
    const heldDirection = Math.sign(state.steeringHold);
    if (Math.abs(targetCarve) > 0.08) {
      const heldSeconds = inputDirection === heldDirection ? Math.abs(state.steeringHold) : 0;
      state.steeringHold = inputDirection * Math.min(1.6, heldSeconds + delta);
    } else {
      state.steeringHold *= Math.exp(-5 * delta);
    }
    const holdStrength = Math.min(1, Math.abs(state.steeringHold) / 1.35);
    const edgeEngagement = 1 + holdStrength * 1.25;
    const stanceTurning = input.brake ? 1.55 : input.tuck ? 0.58 : 1;
    const steeringForce =
      (20 / (1 + state.velocityY * 0.014)) * edgeEngagement * stanceTurning;
    state.velocityX += state.carve * steeringForce * delta;
    state.velocityX *= Math.exp(-1.48 * delta);
    const lateralLimit = input.brake ? 10 : input.tuck ? 11 : 22;
    state.velocityX = Math.max(-lateralLimit, Math.min(lateralLimit, state.velocityX));

    const baseTargetSpeed = input.brake ? 7 : input.tuck ? 34 : 22;
    const traversePenalty = Math.abs(state.carve) * (input.tuck ? 0.1 : 0.22);
    const targetSpeed = baseTargetSpeed * (1 - traversePenalty);
    const speedResponse = input.brake ? 4.8 : input.tuck ? 0.95 : 1.15;
    state.velocityY +=
      (targetSpeed - state.velocityY) * (1 - Math.exp(-speedResponse * delta));
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
    this.state.steeringHold = 0;
  }

  reset(): void {
    this.state.position.x = 0;
    this.state.position.y = 0;
    this.state.velocityX = 0;
    this.state.velocityY = 12;
    this.state.facing = 0;
    this.state.carve = 0;
    this.state.steeringHold = 0;
    this.state.crashed = false;
  }
}
