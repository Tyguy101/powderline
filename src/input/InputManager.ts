import type { InputState } from './InputState';

export class InputManager {
  readonly state: InputState = { steer: 0, brake: false, tuck: false };
  private left = false;
  private right = false;
  private pointerActive = false;
  private pointerStartX = 0;

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

  private updateKeyboard(): void {
    this.state.steer = Number(this.right) - Number(this.left);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.state.brake = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.state.tuck = true;
    this.updateKeyboard();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.state.brake = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.state.tuck = false;
    this.updateKeyboard();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerActive = true;
    this.pointerStartX = event.clientX;
    this.state.brake = event.clientY > innerHeight * 0.78;
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerActive) return;
    this.state.steer = Math.max(-1, Math.min(1, (event.clientX - this.pointerStartX) / 90));
  };

  private readonly onPointerUp = (): void => {
    this.pointerActive = false;
    this.state.steer = 0;
    this.state.brake = false;
  };
}
