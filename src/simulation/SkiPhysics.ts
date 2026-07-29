import type { InputState } from '../input/InputState';
import type { WorldPosition } from '../core/WorldCoordinates';
import {
  createCrashVisualState,
  type CrashReaction,
  type CrashVisualState,
  type ImpactContext,
} from './CrashReaction';

export interface SkiState {
  readonly position: WorldPosition;
  velocityX: number;
  velocityY: number;
  facing: number;
  carve: number;
  steeringHold: number;
  crashed: boolean;
  wobble: number;
  airborneHeight: number;
  airborne: boolean;
  airborneAmount: number;
  landingAmount: number;
  readonly jump: JumpState;
  readonly crash: CrashVisualState;
}

export interface JumpState {
  verticalVelocity: number;
  launchSpeed: number;
  airtime: number;
  distance: number;
  completedDistance: number;
  sequence: number;
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
    wobble: 0,
    airborneHeight: 0,
    airborne: false,
    airborneAmount: 0,
    landingAmount: 0,
    jump: {
      verticalVelocity: 0,
      launchSpeed: 0,
      airtime: 0,
      distance: 0,
      completedDistance: 0,
      sequence: 0,
    },
    crash: createCrashVisualState(),
  };
  private crashVelocityX = 0;
  private crashVelocityY = 0;
  private crashSpin = 0;
  private crashReaction: CrashReaction | null = null;
  private crashAnchorX = 0;
  private crashAnchorY = 0;
  private collisionCooldown = 0;

  step(delta: number, input: Readonly<InputState>): void {
    const state = this.state;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - delta);
    if (state.crashed) {
      this.stepCrash(delta);
      return;
    }
    if (state.airborne) {
      this.stepAirborne(delta, input);
      return;
    }
    state.wobble *= Math.exp(-4.2 * delta);
    state.airborneAmount *= Math.exp(-7 * delta);
    state.landingAmount *= Math.exp(-4.8 * delta);
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

  canCollide(): boolean {
    return this.collisionCooldown <= 0;
  }

  beginJump(): void {
    const state = this.state;
    if (state.crashed || state.airborne) return;
    const speed = Math.hypot(state.velocityX, state.velocityY);
    state.airborne = true;
    state.airborneHeight = 0.04;
    state.airborneAmount = Math.max(state.airborneAmount, 0.08);
    state.landingAmount = 0;
    state.jump.verticalVelocity = 5.8 + Math.min(5.2, speed * 0.16);
    state.jump.launchSpeed = speed;
    state.jump.airtime = 0;
    state.jump.distance = 0;
    state.jump.sequence += 1;
    this.collisionCooldown = 1;
  }

  applyMinorImpact(context: Readonly<ImpactContext>, reaction: Readonly<CrashReaction>): void {
    const state = this.state;
    const normalSpeed = state.velocityX * context.normalX + state.velocityY * context.normalY;
    if (normalSpeed < 0) {
      state.velocityX -= context.normalX * normalSpeed * (0.72 + reaction.strength * 0.18);
      state.velocityY -= context.normalY * normalSpeed * (0.72 + reaction.strength * 0.18);
    }
    state.velocityX += context.normalX * (1.8 + reaction.strength * 4);
    state.velocityY *= reaction.outcome === 'minor' ? 0.82 : 0.66;
    state.wobble = (reaction.spinDirection || 1) * (0.45 + reaction.strength * 0.8);
    state.carve *= -0.35;
    this.collisionCooldown = reaction.outcome === 'minor' ? 0.55 : 0.82;
  }

  beginCrash(context: Readonly<ImpactContext>, reaction: Readonly<CrashReaction>): void {
    const state = this.state;
    state.crashed = true;
    state.crash.active = true;
    state.crash.family = reaction.family;
    state.crash.phase = 'impact';
    state.crash.progress = 0;
    state.crash.severity = reaction.severity;
    state.crash.elapsed = 0;
    state.crash.duration = reaction.duration;
    state.crash.contactX = context.contactX;
    state.crash.contactY = context.contactY;
    state.crash.normalX = context.normalX;
    state.crash.normalY = context.normalY;
    state.crash.impactStrength = reaction.strength;
    state.crash.trailActive = reaction.family === 'face-plant';
    state.crash.trailStartX = context.contactX;
    state.crash.trailStartY = context.contactY;
    this.crashReaction = reaction;
    this.crashAnchorX = context.contactX - context.normalX * context.obstacleRadius;
    this.crashAnchorY = context.contactY - context.normalY * context.obstacleRadius;
    const tangentX = -context.normalY;
    const tangentY = context.normalX;
    const tangentSpeed = context.velocityX * tangentX + context.velocityY * tangentY;
    const retained = reaction.family === 'side-spin' ? 0.62 : reaction.family === 'rolling-tumble' ? 0.74 : 0.28;
    this.crashVelocityX =
      tangentX * tangentSpeed * retained + context.normalX * reaction.launch * 4;
    this.crashVelocityY =
      tangentY * tangentSpeed * retained + Math.max(1.5, context.speed * (0.16 + reaction.launch * 0.2));
    this.crashSpin =
      reaction.spinDirection *
      (reaction.family === 'rolling-tumble'
        ? 0
        : reaction.family === 'side-spin'
          ? 2.8 + reaction.severity * 2.4
          : reaction.family === 'obstacle-slam'
            ? 0.7 + reaction.severity
            : 0.16);
    state.velocityX = this.crashVelocityX;
    state.velocityY = this.crashVelocityY;
    state.carve = 0;
    state.steeringHold = 0;
  }

  crash(): void {
    const state = this.state;
    this.beginCrash(
      {
        seed: 0,
        obstacleId: 0,
        obstacleType: 'tree',
        obstacleRadius: 1,
        speed: Math.hypot(state.velocityX, state.velocityY),
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        facing: state.facing,
        carve: state.carve,
        airborneHeight: state.airborneHeight,
        normalX: 0,
        normalY: -1,
        contactX: state.position.x,
        contactY: state.position.y,
        contactOffset: 0,
      },
      {
        outcome: 'crash',
        family: 'face-plant',
        severity: 0.6,
        strength: 0.6,
        glancing: 0,
        spinDirection: 1,
        rolls: 0,
        launch: 0.1,
        squash: 0.08,
        equipmentSpread: 0.45,
        duration: 2,
        impactDuration: 0.16,
        launchDuration: 0.3,
        followDuration: 1.1,
        variant: 0,
      },
    );
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
    this.state.wobble = 0;
    this.state.airborneHeight = 0;
    this.state.airborne = false;
    this.state.airborneAmount = 0;
    this.state.landingAmount = 0;
    this.state.jump.verticalVelocity = 0;
    this.state.jump.launchSpeed = 0;
    this.state.jump.airtime = 0;
    this.state.jump.distance = 0;
    this.state.jump.completedDistance = 0;
    this.state.jump.sequence = 0;
    Object.assign(this.state.crash, createCrashVisualState());
    this.crashVelocityX = 0;
    this.crashVelocityY = 0;
    this.crashSpin = 0;
    this.crashReaction = null;
    this.crashAnchorX = 0;
    this.crashAnchorY = 0;
    this.collisionCooldown = 0;
  }

  private stepCrash(delta: number): void {
    const state = this.state;
    const crash = state.crash;
    const reaction = this.crashReaction;
    if (!reaction || !crash.active) return;
    crash.elapsed = Math.min(crash.duration, crash.elapsed + delta);
    const impactEnd = reaction.impactDuration;
    const launchEnd = impactEnd + reaction.launchDuration;
    const followEnd = launchEnd + reaction.followDuration;
    if (crash.elapsed < impactEnd) {
      crash.phase = 'impact';
      crash.progress = crash.elapsed / impactEnd;
    } else if (reaction.family !== 'obstacle-slam' && crash.elapsed < launchEnd) {
      crash.phase = 'launch';
      crash.progress = (crash.elapsed - impactEnd) / reaction.launchDuration;
    } else if (crash.elapsed < followEnd) {
      crash.phase = 'follow-through';
      crash.progress = (crash.elapsed - launchEnd) / reaction.followDuration;
    } else {
      crash.phase = 'rest';
      crash.progress = Math.min(1, (crash.elapsed - followEnd) / Math.max(0.01, crash.duration - followEnd));
    }

    const moving = crash.phase !== 'rest';
    const previousX = state.position.x;
    const previousY = state.position.y;
    if (reaction.family === 'obstacle-slam' && crash.phase !== 'rest') {
      const anchorBlend = 1 - Math.exp(-18 * delta);
      state.position.x += (this.crashAnchorX - state.position.x) * anchorBlend;
      state.position.y += (this.crashAnchorY - state.position.y) * anchorBlend;
      this.crashVelocityX *= Math.exp(-7 * delta);
      this.crashVelocityY *= Math.exp(-7 * delta);
    } else if (moving) {
      state.position.x += this.crashVelocityX * delta;
      state.position.y += this.crashVelocityY * delta;
      const dragRate =
        reaction.family === 'rolling-tumble'
          ? crash.phase === 'follow-through'
            ? 0.72
            : 0.48
          : crash.phase === 'follow-through'
            ? 2.2
            : 1.1;
      const drag = Math.exp(-dragRate * delta);
      this.crashVelocityX *= drag;
      this.crashVelocityY *= drag;
    } else {
      this.crashVelocityX *= Math.exp(-8 * delta);
      this.crashVelocityY *= Math.exp(-8 * delta);
    }
    const phaseEnergy =
      crash.phase === 'impact'
        ? 1
        : crash.phase === 'launch'
          ? 1 - crash.progress * 0.15
          : crash.phase === 'follow-through'
            ? 1 - crash.progress * 0.72
            : 0;
    if (reaction.family === 'rolling-tumble') {
      const traveled = Math.hypot(state.position.x - previousX, state.position.y - previousY);
      const targetRotation = reaction.rolls * Math.PI * 2;
      const remaining = Math.max(0, targetRotation - Math.abs(crash.rotation));
      const distanceRotation = traveled / 4.4 * Math.PI * 2;
      crash.rotation +=
        reaction.spinDirection * Math.min(remaining, distanceRotation);
    } else if (reaction.family !== 'obstacle-slam') {
      crash.rotation += this.crashSpin * phaseEnergy * delta;
    }
    const launchArc =
      crash.phase === 'launch'
        ? Math.sin(crash.progress * Math.PI)
        : crash.phase === 'follow-through'
          ? Math.max(0, Math.sin(crash.progress * Math.PI * Math.max(1, reaction.rolls)))
          : 0;
    crash.lift = launchArc * reaction.launch;
    crash.squash =
      crash.phase === 'impact'
        ? Math.sin(crash.progress * Math.PI) * reaction.squash
        : crash.phase === 'rest'
          ? 0.12
          : 0;
    crash.equipmentSpread = reaction.equipmentSpread *
      (crash.phase === 'impact' ? crash.progress : 1);
    crash.snowBurst =
      reaction.family === 'obstacle-slam' && crash.phase !== 'rest'
        ? (0.36 + Math.max(0, Math.sin(crash.elapsed * 13)) * 0.28) * reaction.severity
        : crash.phase === 'impact'
        ? (1 - crash.progress) * reaction.strength
        : crash.phase === 'follow-through'
          ? reaction.severity * (reaction.family === 'rolling-tumble' ? 0.48 : 0.28)
          : 0;
    const tumbleSlide = reaction.family === 'rolling-tumble' && crash.phase === 'follow-through'
      ? Math.max(0, Math.min(1, (crash.progress - 0.68) / 0.16))
      : 0;
    if (tumbleSlide > 0 && !crash.trailActive) {
      crash.trailActive = true;
      crash.trailStartX = state.position.x;
      crash.trailStartY = state.position.y;
    }
    crash.slideTrail =
      reaction.family === 'obstacle-slam'
        ? 0
        : crash.phase === 'follow-through'
          ? reaction.severity *
            (reaction.family === 'rolling-tumble' ? tumbleSlide : 1) *
            (1 - crash.progress)
          : crash.phase === 'rest'
            ? reaction.severity * 0.18 * (1 - crash.progress)
            : 0;
    const impactBlend = crash.phase === 'impact' ? crash.progress : 1;
    const settleBlend =
      crash.phase === 'rest' ? 1 : crash.phase === 'follow-through' ? crash.progress : 0;
    crash.facePlant =
      reaction.family === 'face-plant'
        ? Math.min(1, impactBlend * 1.4)
        : reaction.family === 'rolling-tumble'
          ? Math.max(0, Math.sin(crash.rotation)) * 0.38
          : 0;
    crash.treeStick =
      reaction.family === 'obstacle-slam'
        ? crash.phase === 'impact'
          ? Math.sin(crash.progress * Math.PI * 0.5)
          : crash.phase === 'follow-through'
            ? 1
            : 0
        : 0;
    crash.sideWipeout =
      reaction.family === 'side-spin'
        ? Math.min(1, impactBlend) * (1 - settleBlend * 0.25)
        : reaction.family === 'rolling-tumble'
          ? settleBlend * 0.82
        : 0;
    crash.tumbleCurl =
      reaction.family === 'rolling-tumble'
        ? (0.5 + Math.sin(crash.rotation * 1.35) * 0.5) * (1 - settleBlend * 0.78)
        : 0;
    crash.skiLift =
      reaction.family === 'face-plant'
        ? 0.7 + reaction.severity * 0.3
        : reaction.family === 'rolling-tumble'
          ? 0.35 + crash.tumbleCurl * 0.55
          : reaction.family === 'obstacle-slam'
            ? crash.treeStick * 0.45
            : 0.18;
    crash.armSpread =
      reaction.family === 'obstacle-slam'
        ? crash.treeStick
        : reaction.family === 'rolling-tumble'
          ? 1 - crash.tumbleCurl * 0.6
          : reaction.family === 'side-spin'
            ? 0.72
            : 0.3;
    state.velocityX = this.crashVelocityX;
    state.velocityY = this.crashVelocityY;
  }

  private stepAirborne(delta: number, input: Readonly<InputState>): void {
    const state = this.state;
    const jump = state.jump;
    const previousX = state.position.x;
    const previousY = state.position.y;
    state.carve += (input.steer - state.carve) * Math.min(1, delta * 3.2);
    state.velocityX += input.steer * 3.2 * delta;
    state.velocityX *= Math.exp(-0.12 * delta);
    state.velocityX = Math.max(-22, Math.min(22, state.velocityX));
    state.position.x += state.velocityX * delta;
    state.position.y += state.velocityY * delta;
    state.facing +=
      (state.carve * 0.24 - state.facing) * Math.min(1, delta * 2.4);
    jump.verticalVelocity -= 14.5 * delta;
    state.airborneHeight += jump.verticalVelocity * delta;
    state.airborneAmount +=
      (1 - state.airborneAmount) * (1 - Math.exp(-8 * delta));
    jump.airtime += delta;
    jump.distance += Math.hypot(
      state.position.x - previousX,
      state.position.y - previousY,
    );
    if (state.airborneHeight > 0) return;
    state.airborneHeight = 0;
    state.airborne = false;
    state.velocityX *= 0.8;
    state.velocityY *= 0.8;
    state.landingAmount = 1;
    jump.verticalVelocity = 0;
    jump.completedDistance = jump.distance;
    this.collisionCooldown = 0.45;
  }
}
