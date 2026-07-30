import type { InputState } from './InputState';

export const GAMEPAD_DEAD_ZONE = 0.16;
export const GAMEPAD_STEER_RESPONSE = 0.28;

export interface GamepadSnapshot extends InputState {
  confirm: boolean;
  pause: boolean;
  restart: boolean;
}

interface ButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface StandardGamepadLike {
  readonly axes: readonly number[];
  readonly buttons: readonly ButtonLike[];
}

export interface ConnectedGamepadLike {
  readonly connected: boolean;
  readonly index: number;
}

function buttonDown(gamepad: StandardGamepadLike, index: number): boolean {
  const button = gamepad.buttons[index];
  return Boolean(button && (button.pressed || button.value > 0.35));
}

export function applyGamepadDeadZone(
  value: number,
  deadZone = GAMEPAD_DEAD_ZONE,
): number {
  const magnitude = Math.abs(Math.max(-1, Math.min(1, value)));
  if (magnitude <= deadZone) return 0;
  const normalized = (magnitude - deadZone) / (1 - deadZone);
  const shaped = normalized * normalized * (3 - 2 * normalized);
  return Math.sign(value) * shaped;
}

export function smoothGamepadSteer(
  current: number,
  target: number,
  response = GAMEPAD_STEER_RESPONSE,
): number {
  const next = current + (target - current) * response;
  return Math.abs(next) < 0.0001 ? 0 : next;
}

export function selectConnectedGamepad<T extends ConnectedGamepadLike>(
  gamepads: readonly (T | null)[],
  preferredIndex: number | null,
): T | null {
  const preferred = preferredIndex === null ? null : gamepads[preferredIndex];
  if (preferred?.connected) return preferred;
  return gamepads.find((candidate): candidate is T => Boolean(candidate?.connected)) ?? null;
}

export function resolveStandardGamepad(gamepad: StandardGamepadLike): GamepadSnapshot {
  const vertical = gamepad.axes[1] ?? 0;
  const brake = vertical < -0.55 || buttonDown(gamepad, 6) || buttonDown(gamepad, 4);
  return {
    steer: applyGamepadDeadZone(gamepad.axes[0] ?? 0),
    brake,
    tuck: !brake && (vertical > 0.55 || buttonDown(gamepad, 7) || buttonDown(gamepad, 5)),
    confirm: buttonDown(gamepad, 0),
    restart: buttonDown(gamepad, 3),
    pause: buttonDown(gamepad, 9),
  };
}
