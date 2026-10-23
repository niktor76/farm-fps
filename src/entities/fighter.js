import * as THREE from 'three';
import {
  FIGHTER,
  WORLD,
  SIMULATION,
  FEEL_PRESETS,
  resolveWeapons,
  jumpLaunchVelocity
} from '../config/tunables.js';

const scratchMinimum = new THREE.Vector3();
const scratchMaximum = new THREE.Vector3();

/**
 * Everything the player and a bot have in common: transform, movement
 * integration against the collision world, health, and weapon ammunition
 * state. Player and Bot differ only in what fills the movement intent and
 * where the aim angles come from.
 */
export class Fighter {
  constructor({ id, name, color, isBot, feelKey }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isBot = isBot;
    this.feelKey = feelKey;
    this.feel = FEEL_PRESETS[feelKey];

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.health = FIGHTER.maximumHealth;
    this.alive = true;
    this.onGround = true;
    this.crouchAmount = 0;
    this.wantsCrouch = false;
    this.respawnTimer = 0;

    this.kills = 0;
    this.deaths = 0;
    this.lastAttackerId = null;

    this.weapons = resolveWeapons(feelKey);
    this.weaponIndex = 1;
    this.magazines = this.weapons.map((weapon) =>
      weapon.kind === 'gun' ? weapon.magazineSize : 0
    );
    this.cooldownTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.currentSpread = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    this.jumpVelocity = jumpLaunchVelocity(feelKey);
    this.distanceTravelled = 0;
  }

  get currentWeapon() {
    return this.weapons[this.weaponIndex];
  }

  get currentMagazine() {
    return this.magazines[this.weaponIndex];
  }

  get height() {
    return THREE.MathUtils.lerp(
      FIGHTER.standingHeight,
      FIGHTER.crouchingHeight,
      this.crouchAmount
    );
  }

  get eyeHeight() {
    return THREE.MathUtils.lerp(
      FIGHTER.standingEyeHeight,
      FIGHTER.crouchingEyeHeight,
      this.crouchAmount
    );
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  getEyePosition(target) {
    return target.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** Forward direction from yaw and pitch, matching the YXZ camera order. */
  getAimDirection(target) {
    const cosPitch = Math.cos(this.pitch);
    return target
      .set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
      .normalize();
  }

  /** Flat forward direction, used for movement. */
  getForward(target) {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Hit volume below the neck. */
  getBodyBox(target) {
    const radius = FIGHTER.radius;
    const shoulderY = this.position.y + this.height - FIGHTER.headHeight;
    scratchMinimum.set(this.position.x - radius, this.position.y, this.position.z - radius);
    scratchMaximum.set(this.position.x + radius, shoulderY, this.position.z + radius);
    return target.set(scratchMinimum, scratchMaximum);
  }

  /** Hit volume for headshots. */
  getHeadBox(target) {
    const radius = FIGHTER.radius * 0.55;
    const topY = this.position.y + this.height;
    scratchMinimum.set(this.position.x - radius, topY - FIGHTER.headHeight, this.position.z - radius);
    scratchMaximum.set(this.position.x + radius, topY, this.position.z + radius);
    return target.set(scratchMinimum, scratchMaximum);
  }

  applyDamage(amount, attackerId) {
    if (!this.alive) return { killed: false, remaining: 0 };

    this.health -= amount;
    this.lastAttackerId = attackerId;

    if (this.health > 0) return { killed: false, remaining: this.health };

    this.health = 0;
    this.alive = false;
    this.deaths += 1;
    this.respawnTimer = 0;
    this.velocity.set(0, 0, 0);
    return { killed: true, remaining: 0 };
  }

  respawnAt(position, yaw) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = FIGHTER.maximumHealth;
    this.alive = true;
    this.onGround = true;
    this.crouchAmount = 0;
    this.wantsCrouch = false;
    this.respawnTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldownTimer = 0;
    this.currentSpread = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.magazines = this.weapons.map((weapon) =>
      weapon.kind === 'gun' ? weapon.magazineSize : 0
    );
  }

  /**
   * Advances movement by one fixed step.
   *
   * intent carries normalised local-space input: forward and right in -1..1,
   * plus the jump, sprint and crouch wishes. Movement is substepped so a
   * sprinting fighter cannot pass through a wall between two collision checks.
   */
  step(deltaSeconds, collisionWorld, intent) {
    if (!this.alive) {
      this.respawnTimer += deltaSeconds;
      return;
    }

    this.updateCrouch(deltaSeconds, collisionWorld, intent.wantsCrouch);
    this.updateRecoil(deltaSeconds);
    this.applyAcceleration(deltaSeconds, intent);

    if (intent.wantsJump && this.onGround) {
      this.velocity.y = this.jumpVelocity;
      this.onGround = false;
    }

    this.velocity.y -= this.feel.gravity * deltaSeconds;

    const substepSeconds = deltaSeconds / SIMULATION.movementSubsteps;
    for (let i = 0; i < SIMULATION.movementSubsteps; i += 1) {
      this.integrateSubstep(substepSeconds, collisionWorld);
    }
  }

  updateCrouch(deltaSeconds, collisionWorld, wantsCrouch) {
    this.wantsCrouch = wantsCrouch;

    const standingBlocked =
      collisionWorld.ceilingHeightAt(
        this.position.x,
        this.position.z,
        FIGHTER.radius,
        this.position.y + FIGHTER.crouchingHeight
      ) < this.position.y + FIGHTER.standingHeight;

    const target = wantsCrouch || standingBlocked ? 1 : 0;
    const rate = FIGHTER.crouchTransitionSpeed * deltaSeconds;
    this.crouchAmount += THREE.MathUtils.clamp(target - this.crouchAmount, -rate, rate);
  }

  updateRecoil(deltaSeconds) {
    const weapon = this.currentWeapon;
    if (weapon.kind !== 'gun') {
      this.currentSpread = 0;
      return;
    }

    this.currentSpread = Math.max(
      weapon.baseSpread,
      this.currentSpread - weapon.spreadRecoveryPerSecond * deltaSeconds
    );

    const recovery = 6 * deltaSeconds;
    this.recoilPitch -= THREE.MathUtils.clamp(this.recoilPitch, -recovery, recovery);
    this.recoilYaw -= THREE.MathUtils.clamp(this.recoilYaw, -recovery, recovery);
  }

  applyAcceleration(deltaSeconds, intent) {
    const speed = this.targetSpeed(intent);
    const hasInput = intent.forward !== 0 || intent.right !== 0;

    let wishX = 0;
    let wishZ = 0;

    if (hasInput) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      // Forward is -Z at yaw 0; right is +X.
      wishX = -sinYaw * intent.forward + cosYaw * intent.right;
      wishZ = -cosYaw * intent.forward - sinYaw * intent.right;

      const length = Math.hypot(wishX, wishZ);
      wishX = (wishX / length) * speed;
      wishZ = (wishZ / length) * speed;
    }

    let rate;
    if (this.onGround) {
      rate = hasInput ? FIGHTER.groundAcceleration : FIGHTER.groundDeceleration;
    } else if (hasInput) {
      rate = FIGHTER.groundAcceleration * FIGHTER.airControlFactor;
    } else {
      rate = 0;
    }

    const maximumDelta = rate * deltaSeconds;
    if (maximumDelta <= 0) return;

    let deltaX = wishX - this.velocity.x;
    let deltaZ = wishZ - this.velocity.z;
    const deltaLength = Math.hypot(deltaX, deltaZ);

    if (deltaLength > maximumDelta) {
      deltaX = (deltaX / deltaLength) * maximumDelta;
      deltaZ = (deltaZ / deltaLength) * maximumDelta;
    }

    this.velocity.x += deltaX;
    this.velocity.z += deltaZ;
  }

  targetSpeed(intent) {
    if (this.crouchAmount > 0.5) return this.feel.crouchSpeed;
    if (intent.wantsSprint && intent.forward > 0) return this.feel.sprintSpeed;
    return this.feel.walkSpeed;
  }

  integrateSubstep(substepSeconds, collisionWorld) {
    const radius = FIGHTER.radius;
    const height = this.height;

    const previousX = this.position.x;
    const previousZ = this.position.z;

    this.position.x += this.velocity.x * substepSeconds;
    this.position.z += this.velocity.z * substepSeconds;
    collisionWorld.resolveHorizontal(this.position, radius, this.position.y, height);

    this.distanceTravelled += Math.hypot(
      this.position.x - previousX,
      this.position.z - previousZ
    );

    this.position.y += this.velocity.y * substepSeconds;

    const ceiling = collisionWorld.ceilingHeightAt(
      this.position.x,
      this.position.z,
      radius,
      this.position.y + WORLD.stepHeight
    );
    if (this.position.y + height > ceiling) {
      this.position.y = ceiling - height;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    const ground = collisionWorld.groundHeightAt(
      this.position.x,
      this.position.z,
      radius,
      this.position.y + WORLD.stepHeight
    );

    if (this.position.y <= ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}

/** Neutral intent, used by anything that is not currently steering a fighter. */
export function createIntent() {
  return {
    forward: 0,
    right: 0,
    wantsJump: false,
    wantsSprint: false,
    wantsCrouch: false
  };
}
