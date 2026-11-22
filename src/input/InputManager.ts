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

export interface TouchActionElements {
  brake: HTMLElement;
  tuck: HTMLElement;
}

export interface TouchDiagnostics {
  scheme: 'split' | 'drag';
  steeringActive: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  steer: number;
  action: 'brake' | 'tuck' | 'neutral';
}

export type InputMethod = 'keyboard' | 'pointer' | 'touch' | 'gamepad';

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

export function resolveTouchSteering(deltaX: number, viewportWidth: number): number {
  const deadZone = 8;
  const maximumDistance = Math.max(76, Math.min(112, viewportWidth * 0.18));
  const magnitude = Math.abs(deltaX);
  if (magnitude <= deadZone) return 0;
  const normalized = Math.min(1, (magnitude - deadZone) / (maximumDistance - deadZone));
  const curved = normalized ** 0.82;
  return Math.sign(deltaX) * curved;
}

export class InputManager {
  readonly state: InputState = { steer: 0, brake: false, tuck: false };
  private left = false;
  private right = false;
  private brakeKey = false;
  private tuckKey = false;
  private pointerActive = false;
  private activePointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerSteer = 0;
  private pointerBrake = false;
  private pointerTuck = false;
  private steeringTouchId: number | null = null;
  private steeringOriginX = 0;
  private steeringOriginY = 0;
  private steeringCurrentX = 0;
  private steeringCurrentY = 0;
  private steeringTouchSteer = 0;
  private actionTouchId: number | null = null;
  private touchBrake = false;
  private touchTuck = false;
  private readonly touchDiagnosticState: TouchDiagnostics = {
    scheme: 'split',
    steeringActive: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    steer: 0,
    action: 'neutral',
  };
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
    private readonly onInputMethodChange: (method: InputMethod) => void = () => undefined,
    private readonly gamepads: () => readonly (Gamepad | null)[] =
      () => navigator.getGamepads?.() ?? [],
    private readonly touchActions: TouchActionElements | null = null,
    private readonly mobileTouchScheme: 'split' | 'drag' = 'split',
  ) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('gamepadconnected', this.onGamepadConnected);
    addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('lostpointercapture', this.onPointerUp);
    touchActions?.brake.addEventListener('pointerdown', this.onActionPointerDown);
    touchActions?.tuck.addEventListener('pointerdown', this.onActionPointerDown);
    touchActions?.brake.addEventListener('pointermove', this.onActionPointerMove);
    touchActions?.tuck.addEventListener('pointermove', this.onActionPointerMove);
    touchActions?.brake.addEventListener('pointerup', this.onActionPointerUp);
    touchActions?.tuck.addEventListener('pointerup', this.onActionPointerUp);
    touchActions?.brake.addEventListener('pointercancel', this.onActionPointerUp);
    touchActions?.tuck.addEventListener('pointercancel', this.onActionPointerUp);
    touchActions?.brake.addEventListener('lostpointercapture', this.onActionPointerUp);
    touchActions?.tuck.addEventListener('lostpointercapture', this.onActionPointerUp);
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
    this.surface.removeEventListener('lostpointercapture', this.onPointerUp);
    this.touchActions?.brake.removeEventListener('pointerdown', this.onActionPointerDown);
    this.touchActions?.tuck.removeEventListener('pointerdown', this.onActionPointerDown);
    this.touchActions?.brake.removeEventListener('pointermove', this.onActionPointerMove);
    this.touchActions?.tuck.removeEventListener('pointermove', this.onActionPointerMove);
    this.touchActions?.brake.removeEventListener('pointerup', this.onActionPointerUp);
    this.touchActions?.tuck.removeEventListener('pointerup', this.onActionPointerUp);
    this.touchActions?.brake.removeEventListener('pointercancel', this.onActionPointerUp);
    this.touchActions?.tuck.removeEventListener('pointercancel', this.onActionPointerUp);
    this.touchActions?.brake.removeEventListener('lostpointercapture', this.onActionPointerUp);
    this.touchActions?.tuck.removeEventListener('lostpointercapture', this.onActionPointerUp);
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

  get touchDiagnostics(): TouchDiagnostics {
    const diagnostics = this.touchDiagnosticState;
    diagnostics.scheme = this.mobileTouchScheme;
    diagnostics.steeringActive = this.steeringTouchId !== null;
    diagnostics.originX = this.steeringOriginX;
    diagnostics.originY = this.steeringOriginY;
    diagnostics.currentX = this.steeringCurrentX;
    diagnostics.currentY = this.steeringCurrentY;
    diagnostics.steer = this.steeringTouchSteer;
    diagnostics.action = this.touchBrake ? 'brake' : this.touchTuck ? 'tuck' : 'neutral';
    return diagnostics;
  }

  resetTransientState(): void {
    this.left = false;
    this.right = false;
    this.brakeKey = false;
    this.tuckKey = false;
    this.pointerActive = false;
    this.activePointerId = null;
    this.pointerSteer = 0;
    this.pointerBrake = false;
    this.pointerTuck = false;
    this.steeringTouchId = null;
    this.steeringTouchSteer = 0;
    this.actionTouchId = null;
    this.touchBrake = false;
    this.touchTuck = false;
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
  }

  private updateState(): void {
    const keyboardSteer = Number(this.right) - Number(this.left);
    this.state.steer = this.steeringTouchId !== null
      ? this.steeringTouchSteer
      : this.pointerActive
      ? this.pointerSteer
      : keyboardSteer !== 0
        ? keyboardSteer
        : this.gamepadSteer;
    this.state.brake = this.brakeKey || this.pointerBrake || this.touchBrake || this.gamepadBrake;
    this.state.tuck =
      !this.state.brake && (this.tuckKey || this.pointerTuck || this.touchTuck || this.gamepadTuck);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.onInputMethodChange('keyboard');
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.brakeKey = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this.tuckKey = true;
    if (event.code === 'KeyR' && !event.repeat) this.restartRequested = true;
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) {
      this.pauseRequested = true;
    }
    if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat &&
      !(event.target instanceof HTMLElement && event.target.closest('button, a[href], input, select, textarea, summary'))) {
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
    if (event.pointerType === 'touch' && this.mobileTouchScheme === 'split') {
      if (this.steeringTouchId !== null) return;
      const bounds = this.surface.getBoundingClientRect();
      if (event.clientX < bounds.left + bounds.width * 0.3) return;
      this.steeringTouchId = event.pointerId;
      this.steeringOriginX = event.clientX;
      this.steeringOriginY = event.clientY;
      this.steeringCurrentX = event.clientX;
      this.steeringCurrentY = event.clientY;
      this.steeringTouchSteer = 0;
      this.updateState();
      this.onInputMethodChange('touch');
      if (event.cancelable) event.preventDefault();
      this.surface.setPointerCapture(event.pointerId);
      return;
    }
    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.pointerActive = true;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerSteer = 0;
    this.pointerBrake = false;
    this.pointerTuck = false;
    this.updateState();
    this.onInputMethodChange(event.pointerType === 'touch' ? 'touch' : 'pointer');
    if (event.cancelable) event.preventDefault();
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.steeringTouchId) {
      const bounds = this.surface.getBoundingClientRect();
      this.steeringCurrentX = event.clientX;
      this.steeringCurrentY = event.clientY;
      const deltaX = event.clientX - this.steeringOriginX;
      this.steeringTouchSteer = resolveTouchSteering(deltaX, bounds.width);
      if (Math.abs(deltaX) < 12) {
        this.steeringOriginX += deltaX * 0.18;
      }
      this.updateState();
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (!this.pointerActive || event.pointerId !== this.activePointerId) return;
    const bounds = this.surface.getBoundingClientRect();
    const gesture = resolvePointerGesture(
      event.clientX - this.pointerStartX,
      event.clientY - this.pointerStartY,
      bounds.width,
      bounds.height,
    );
    this.pointerSteer = gesture.steer;
    this.pointerBrake = gesture.brake;
    this.pointerTuck = gesture.tuck;
    this.updateState();
    if (event.cancelable) event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.steeringTouchId) {
      this.steeringTouchId = null;
      this.steeringTouchSteer = 0;
      this.updateState();
      return;
    }
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.pointerActive = false;
    this.pointerSteer = 0;
    this.pointerBrake = false;
    this.pointerTuck = false;
    this.updateState();
  };

  private readonly onActionPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || this.mobileTouchScheme !== 'split') return;
    if (this.actionTouchId !== null) return;
    this.actionTouchId = event.pointerId;
    this.updateTouchAction(event.clientX, event.clientY);
    this.onInputMethodChange('touch');
    if (event.cancelable) event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  private readonly onActionPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.actionTouchId) return;
    this.updateTouchAction(event.clientX, event.clientY);
    if (event.cancelable) event.preventDefault();
  };

  private readonly onActionPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.actionTouchId) return;
    this.actionTouchId = null;
    this.touchBrake = false;
    this.touchTuck = false;
    this.updateState();
  };

  private updateTouchAction(clientX: number, clientY: number): void {
    const brakeBounds = this.touchActions?.brake.getBoundingClientRect();
    const tuckBounds = this.touchActions?.tuck.getBoundingClientRect();
    const inside = (bounds: DOMRect | undefined): boolean => Boolean(bounds &&
      clientX >= bounds.left && clientX <= bounds.right &&
      clientY >= bounds.top && clientY <= bounds.bottom);
    this.touchBrake = inside(brakeBounds);
    this.touchTuck = !this.touchBrake && inside(tuckBounds);
    this.updateState();
  }

  private readonly onGamepadConnected = (event: GamepadEvent): void => {
    if (this.gamepadIndex === null) this.gamepadIndex = event.gamepad.index;
    this.setControllerConnected(true);
    this.onInputMethodChange('gamepad');
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
