import type { InputState } from './InputState';

export interface PointerGesture {
  steer: number;
  brake: boolean;
  tuck: boolean;
}

export function resolvePointerGesture(
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): PointerGesture {
  const horizontalRange = Math.max(80, Math.min(180, viewportWidth * 0.22));
  const verticalThreshold = Math.max(44, Math.min(58, viewportHeight * 0.065));
  return {
    steer: Math.max(-1, Math.min(1, deltaX / horizontalRange)),
    brake: deltaY < -verticalThreshold,
    tuck: deltaY > verticalThreshold,
  };
}

export class InputManager {
  readonly state: InputState = { steer: 0, brake: false, tuck: false };
  private left = false;
  private right = false;
  private brakeKey = false;
  private tuckKey = false;
  private pointerActive = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerSteer = 0;
  private pointerBrake = false;
  private pointerTuck = false;
  private restartRequested = false;

  constructor(private readonly surface: HTMLElement) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
  }

  consumeRestart(): boolean {
    const requested = this.restartRequested;
    this.restartRequested = false;
    return requested;
  }

  private updateState(): void {
    this.state.steer = this.pointerActive
      ? this.pointerSteer
      : Number(this.right) - Number(this.left);
    this.state.brake = this.brakeKey || this.pointerBrake;
    this.state.tuck = !this.state.brake && (this.tuckKey || this.pointerTuck);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.brakeKey = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.tuckKey = true;
    if (event.code === 'KeyR') this.restartRequested = true;
    this.updateState();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.brakeKey = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.tuckKey = false;
    this.updateState();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerActive = true;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerSteer = 0;
    this.pointerBrake = false;
    this.pointerTuck = false;
    this.updateState();
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerActive) return;
    const gesture = resolvePointerGesture(
      event.clientX - this.pointerStartX,
      event.clientY - this.pointerStartY,
      innerWidth,
      innerHeight,
    );
    this.pointerSteer = gesture.steer;
    this.pointerBrake = gesture.brake;
    this.pointerTuck = gesture.tuck;
    this.updateState();
  };

  private readonly onPointerUp = (): void => {
    this.pointerActive = false;
    this.pointerSteer = 0;
    this.pointerBrake = false;
    this.pointerTuck = false;
    this.updateState();
  };
}
