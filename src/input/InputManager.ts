import type { InputState } from './InputState';
import {
  resolveStandardGamepad,
  selectConnectedGamepad,
  smoothGamepadSteer,
  type GamepadSnapshot,
} from './GamepadInput';

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
  private gamepadSteer = 0;
  private gamepadBrake = false;
  private gamepadTuck = false;
  private gamepadIndex: number | null = null;
  private gamepadConnected = false;
  private previousGamepad: GamepadSnapshot = {
    steer: 0,
    brake: false,
    tuck: false,
    confirm: false,
    pause: false,
    restart: false,
  };
  private restartRequested = false;
  private pauseRequested = false;
  private confirmRequested = false;

  constructor(
    private readonly surface: HTMLElement,
    private readonly onControllerChange: (connected: boolean) => void = () => undefined,
    private readonly gamepads: () => readonly (Gamepad | null)[] =
      () => navigator.getGamepads?.() ?? [],
  ) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('gamepadconnected', this.onGamepadConnected);
    addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('gamepadconnected', this.onGamepadConnected);
    removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
  }

  consumeRestart(): boolean {
    const requested = this.restartRequested;
    this.restartRequested = false;
    return requested;
  }

  consumePause(): boolean {
    const requested = this.pauseRequested;
    this.pauseRequested = false;
    return requested;
  }

  consumeConfirm(): boolean {
    const requested = this.confirmRequested;
    this.confirmRequested = false;
    return requested;
  }

  pollGamepads(): void {
    const available = this.gamepads();
    const gamepad = selectConnectedGamepad(available, this.gamepadIndex);
    this.gamepadIndex = gamepad?.index ?? null;
    this.setControllerConnected(Boolean(gamepad));
    if (!gamepad) {
      this.gamepadSteer = 0;
      this.gamepadBrake = false;
      this.gamepadTuck = false;
      this.previousGamepad = {
        steer: 0,
        brake: false,
        tuck: false,
        confirm: false,
        pause: false,
        restart: false,
      };
      this.updateState();
      return;
    }
    const snapshot = resolveStandardGamepad(gamepad);
    this.gamepadSteer = smoothGamepadSteer(this.gamepadSteer, snapshot.steer);
    this.gamepadBrake = snapshot.brake;
    this.gamepadTuck = snapshot.tuck;
    if (snapshot.restart && !this.previousGamepad.restart) this.restartRequested = true;
    if (snapshot.pause && !this.previousGamepad.pause) this.pauseRequested = true;
    if (snapshot.confirm && !this.previousGamepad.confirm) this.confirmRequested = true;
    this.previousGamepad = snapshot;
    this.updateState();
  }

  get controllerConnected(): boolean {
    return this.gamepadConnected;
  }

  private updateState(): void {
    const keyboardSteer = Number(this.right) - Number(this.left);
    this.state.steer = this.pointerActive
      ? this.pointerSteer
      : keyboardSteer !== 0
        ? keyboardSteer
        : this.gamepadSteer;
    this.state.brake = this.brakeKey || this.pointerBrake || this.gamepadBrake;
    this.state.tuck =
      !this.state.brake && (this.tuckKey || this.pointerTuck || this.gamepadTuck);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.brakeKey = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.tuckKey = true;
    if (event.code === 'KeyR' && !event.repeat) this.restartRequested = true;
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      this.pauseRequested = true;
    }
    if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) {
      this.confirmRequested = true;
    }
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

  private readonly onGamepadConnected = (event: GamepadEvent): void => {
    if (this.gamepadIndex === null) this.gamepadIndex = event.gamepad.index;
    this.setControllerConnected(true);
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.index === this.gamepadIndex) this.gamepadIndex = null;
    const replacement = selectConnectedGamepad(this.gamepads(), this.gamepadIndex);
    this.gamepadIndex = replacement?.index ?? null;
    this.setControllerConnected(Boolean(replacement));
  };

  private setControllerConnected(connected: boolean): void {
    if (connected === this.gamepadConnected) return;
    this.gamepadConnected = connected;
    this.onControllerChange(connected);
  }
}
