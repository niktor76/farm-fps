import * as THREE from 'three';
import { Fighter, createIntent } from './fighter.js';
import { createFighterModel, createNametag } from './models.js';
import { DIFFICULTIES, SIMULATION, FIGHTER, CAMERA } from '../config/tunables.js';

/**
 * AI fighter.
 *
 * Behaviour is a state machine (roam, chase, attack, takeCover, reload, dead)
 * re-evaluated at SIMULATION.botThinkHertz, with movement steered every physics
 * step. Aim follows the model Counter-Strike ships in botprofile.db (DEC-14):
 * a reaction delay before the first shot, an aim-error cone that shrinks while
 * the target stays visible, and a periodic re-aim interval.
 *
 * Owned by PH-8-bot-ai.
 */

/**
 * Every number below steers the AI itself; no gameplay value lives here.
 * Movement speeds, damage, ranges and difficulty figures are read from the
 * Fighter, its resolved weapons and DIFFICULTIES.
 */
const STEERING = {
  seekWeight: 1,
  separationWeight: 1.3,
  separationRadiusMetres: 2.2,
  queuedSeparationWeight: 0.15,
  queueBrakeMetres: 2.4,
  queueBrakeCosine: 0.6,
  avoidanceWeight: 1.1,
  avoidanceProbeMetres: 3,
  avoidanceWhiskerDegrees: 38,
  wanderWeight: 0.35,
  wanderTurnRadiansPerSecond: 1.6,
  arriveSlowingMetres: 2.5,
  minimumArriveSpeedFactor: 0.3,
  sprintBeyondMetres: 8
};

const DOORWAY = {
  queueRadiusMetres: 3.5,
  calmRadiusMetres: 5,
  clearMetresPastThreshold: 1,
  reservationWaitTimeoutSeconds: 5,
  penaltySeconds: 4
};

const STUCK = {
  sampleIntervalSeconds: 0.5,
  windowSeconds: 3,
  displacementMetres: 0.3,
  speedFractionOfDesired: 0.2,
  confirmSeconds: 2
};

const RECOVERY = {
  pauseMinimumSeconds: 0.3,
  pauseMaximumSeconds: 0.5,
  backupMinimumMetres: 0.5,
  backupMaximumMetres: 1,
  jitterMetres: 1.2,
  retrySeconds: 6,
  repathSettleSeconds: 8,
  escapeMetres: 1.5
};

const COMBAT = {
  meleeSwitchMetres: 3,
  closeComfortFactor: 0.5,
  strafeMinimumSeconds: 0.7,
  strafeMaximumSeconds: 1.8,
  burstMinimumShots: 3,
  burstMaximumShots: 7,
  aimTurnRatePerSecond: 9,
  fireAlignmentDegrees: 6,
  leadingLateralSeconds: 0.12,
  lowHealthFraction: 0.35,
  magazineReloadFraction: 0.25,
  targetMemorySeconds: 4,
  coverSearchMetres: 18,
  coverHoldSeconds: 3
};

const ROAM = { candidateCount: 4 };


const STUCK_SAMPLE_COUNT = Math.round(STUCK.windowSeconds / STUCK.sampleIntervalSeconds) + 1;

const scratchEye = new THREE.Vector3();
const scratchTargetEye = new THREE.Vector3();
const scratchNode = new THREE.Vector3();
const scratchAimPoint = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchProbe = new THREE.Vector3();

const TWO_PI = Math.PI * 2;

export class Bot extends Fighter {
  /**
   * @param {{
   *   id: number, name: string, color: number,
   *   feelKey: string, difficultyKey: string,
   *   random: import('../core/rng.js').Random
   * }} options
   */
  constructor({ id, name, color, feelKey, difficultyKey, random }) {
    super({ id, name, color, isBot: true, feelKey });

    this.difficultyKey = difficultyKey;
    this.difficulty = DIFFICULTIES[difficultyKey];
    this.random = random;

    this.model = createFighterModel(color);
    this.nametag = createNametag(name, color);

    this.intent = createIntent();
    this.speedScale = 1;

    this.state = 'roam';
    this.thinkIntervalSeconds = 1 / SIMULATION.botThinkHertz;
    this.thinkTimer = random.next() * this.thinkIntervalSeconds;

    this.pistolIndex = this.weapons.findIndex((weapon) => weapon.id === 'pistol');
    this.rifleIndex = this.weapons.findIndex((weapon) => weapon.id === 'rifle');
    this.shotgunIndex = this.weapons.findIndex((weapon) => weapon.id === 'shotgun');
    this.karambitIndex = this.weapons.findIndex((weapon) => weapon.id === 'karambit');
    this.pitchforkIndex = this.weapons.findIndex((weapon) => weapon.id === 'pitchfork');
    this.weaponIndex = this.rifleIndex;

    this.path = [];
    this.pathIndex = 0;
    this.destinationNode = -1;
    this.reservedNode = -1;
    this.reservedNodePassed = false;
    this.waitingForReservation = false;
    this.waitingSeconds = 0;
    this.penalisedNodes = new Map();

    this.target = null;
    this.targetVisible = false;
    this.lastSeenElapsed = -Infinity;
    this.lastKnownPosition = new THREE.Vector3();
    this.canFireElapsed = 0;

    this.aimConeRadians = 0;
    this.aimOffsetYaw = 0;
    this.aimOffsetPitch = 0;
    this.reaimTimer = 0;
    this.desiredYaw = 0;
    this.desiredPitch = 0;
    this.trueYaw = 0;
    this.truePitch = 0;

    this.burstShotsRemaining = this.rollBurstShots();
    this.burstRestTimer = 0;
    this.triggerToggle = false;

    this.strafeSign = random.next() < 0.5 ? -1 : 1;
    this.strafeTimer = random.range(COMBAT.strafeMinimumSeconds, COMBAT.strafeMaximumSeconds);

    this.wanderAngle = random.next() * TWO_PI;

    this.coverNode = -1;
    this.coverSeconds = 0;
    this.coverRolled = false;
    this.wantsCover = false;

    this.stuckSamplesX = new Float64Array(STUCK_SAMPLE_COUNT);
    this.stuckSamplesZ = new Float64Array(STUCK_SAMPLE_COUNT);
    this.stuckSampleIndex = 0;
    this.stuckSampleCount = 0;
    this.stuckSampleTimer = STUCK.sampleIntervalSeconds;
    this.stuckSeconds = 0;

    this.recoveryStage = 0;
    this.recoveryTimer = 0;
    this.recoveryHeadingX = 0;
    this.recoveryHeadingZ = 0;
    this.recoveryOriginX = 0;
    this.recoveryOriginZ = 0;

    this.jitterX = 0;
    this.jitterZ = 0;
  }

  /** The difficulty tier's movement handicap, plus arrive and queue braking. */
  targetSpeed(intent) {
    return super.targetSpeed(intent) * this.difficulty.movementSpeedFactor * this.speedScale;
  }

  get desiredSpeed() {
    return this.feel.walkSpeed * this.difficulty.movementSpeedFactor;
  }

  /**
   * Low frequency decision pass: target selection, state transitions,
   * destination choice.
   *
   * @param {{
   *   collisionWorld: import('../world/collision.js').CollisionWorld,
   *   waypoints: import('../world/waypoints.js').WaypointGraph,
   *   fighters: import('./fighter.js').Fighter[],
   *   weapons: import('../weapons/weapons.js').WeaponSystem,
   *   elapsed: number
   * }} context
   */
  think(context) {
    if (!this.alive) {
      if (this.state !== 'dead') this.enterDead(context.waypoints);
      return;
    }

    if (this.state === 'dead') this.resetAfterRespawn();

    this.perceive(context);
    this.expirePenalties(context.elapsed);
    this.chooseState(context);
    this.chooseDestination(context);
  }

  /** Per physics step: steering, aiming, trigger discipline. */
  update(deltaSeconds, context) {
    this.thinkTimer -= deltaSeconds;
    if (this.thinkTimer <= 0) {
      this.thinkTimer += this.thinkIntervalSeconds;
      this.think(context);
    }

    if (!this.alive) {
      this.stopIntent();
      this.step(deltaSeconds, context.collisionWorld, this.intent);
      this.syncVisuals(deltaSeconds);
      return;
    }

    this.updateAim(deltaSeconds, context);
    this.updateTrigger(deltaSeconds, context);
    this.updateReservationRelease(context.waypoints);
    this.steer(deltaSeconds, context);
    this.updateStuck(deltaSeconds, context);

    this.step(deltaSeconds, context.collisionWorld, this.intent);
    this.syncVisuals(deltaSeconds);
  }

  perceive(context) {
    const { collisionWorld, fighters, elapsed } = context;

    this.getEyePosition(scratchEye);

    const halfFieldOfView = THREE.MathUtils.degToRad(this.difficulty.fieldOfViewDegrees) * 0.5;
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);

    let best = null;
    let bestDistance = this.difficulty.viewDistance;

    for (let index = 0; index < fighters.length; index += 1) {
      const fighter = fighters[index];
      if (fighter === this || !fighter.alive) continue;

      const offsetX = fighter.position.x - this.position.x;
      const offsetZ = fighter.position.z - this.position.z;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance > bestDistance) continue;

      const facing = (forwardX * offsetX + forwardZ * offsetZ) / Math.max(distance, 1e-6);
      if (Math.acos(THREE.MathUtils.clamp(facing, -1, 1)) > halfFieldOfView) continue;

      fighter.getEyePosition(scratchTargetEye);
      if (collisionWorld.isBlocked(scratchEye, scratchTargetEye)) continue;

      best = fighter;
      bestDistance = distance;
    }

    if (best === null) {
      this.targetVisible = false;
      return;
    }

    if (!this.targetVisible || best !== this.target) {
      this.aimConeRadians = THREE.MathUtils.degToRad(this.difficulty.initialAimErrorDegrees);
      this.canFireElapsed = elapsed + this.difficulty.reactionDelay;
      this.reaimTimer = 0;
      this.burstShotsRemaining = this.rollBurstShots();
      this.burstRestTimer = 0;
      this.rollAimOffset();
    }

    this.target = best;
    this.targetVisible = true;
    this.lastSeenElapsed = elapsed;
    this.lastKnownPosition.copy(best.position);
  }

  chooseState(context) {
    const lowHealth = this.health <= FIGHTER.maximumHealth * COMBAT.lowHealthFraction;

    if (!lowHealth) {
      this.coverRolled = false;
      this.wantsCover = false;
    } else if (!this.coverRolled) {
      this.coverRolled = true;
      this.wantsCover = this.random.next() < this.difficulty.coverSeekChance;
    }

    if (this.wantsCover) {
      this.state = 'takeCover';
      return;
    }

    if (this.targetVisible) {
      this.state = 'attack';
      return;
    }

    const remembersTarget =
      this.target !== null &&
      this.target.alive &&
      context.elapsed - this.lastSeenElapsed < COMBAT.targetMemorySeconds;

    if (remembersTarget) {
      this.state = 'chase';
      return;
    }

    const weapon = this.currentWeapon;
    const magazineLow =
      weapon.kind === 'gun' &&
      this.currentMagazine <= weapon.magazineSize * COMBAT.magazineReloadFraction;

    this.state = magazineLow ? 'reload' : 'roam';
  }

  chooseDestination(context) {
    const waypoints = context.waypoints;

    if (this.state === 'attack') {
      this.abandonPath(waypoints);
      return;
    }

    if (this.state === 'takeCover') {
      if (this.coverNode !== -1) return;

      const threat = this.target !== null ? this.target.position : this.lastKnownPosition;
      const node = waypoints.findCoverNode(this.position, threat, COMBAT.coverSearchMetres);
      if (node === -1) {
        this.wantsCover = false;
        return;
      }

      this.coverNode = node;
      this.coverSeconds = 0;

      if (!this.setDestination(waypoints, node)) {
        this.coverNode = -1;
        this.wantsCover = false;
      }
      return;
    }

    if (this.state === 'chase') {
      const node = waypoints.nearestNode(this.lastKnownPosition);
      if (node !== this.destinationNode) this.setDestination(waypoints, node);
      return;
    }

    if (this.pathIndex < this.path.length) return;
    this.setDestination(waypoints, this.pickRoamNode(waypoints));
  }

  setDestination(waypoints, goalNode) {
    if (goalNode < 0) return false;

    const path = waypoints.findPath(waypoints.nearestNode(this.position), goalNode);
    if (path.length === 0) {
      this.destinationNode = -1;
      return false;
    }

    this.releaseReservation(waypoints);
    this.path = path;
    this.pathIndex = 0;
    this.destinationNode = goalNode;
    this.waitingForReservation = false;
    this.waitingSeconds = 0;
    this.jitterX = 0;
    this.jitterZ = 0;
    this.resetStuckSamples();
    this.endRecovery();
    return true;
  }

  pickRoamNode(waypoints) {
    let bestNode = -1;
    let bestDistance = -1;

    for (let candidate = 0; candidate < ROAM.candidateCount; candidate += 1) {
      const node = waypoints.randomNode(this.random);
      if (this.penalisedNodes.has(node)) continue;

      waypoints.nodePosition(node, scratchNode);
      const distance = Math.hypot(scratchNode.x - this.position.x, scratchNode.z - this.position.z);
      if (distance <= bestDistance) continue;

      bestDistance = distance;
      bestNode = node;
    }

    return bestNode;
  }

  abandonPath(waypoints) {
    this.releaseReservation(waypoints);
    this.path.length = 0;
    this.pathIndex = 0;
    this.destinationNode = -1;
    this.waitingForReservation = false;
    this.waitingSeconds = 0;
    this.jitterX = 0;
    this.jitterZ = 0;
  }

  penaliseNode(node, elapsed) {
    this.penalisedNodes.set(node, elapsed + DOORWAY.penaltySeconds);
  }

  expirePenalties(elapsed) {
    if (this.penalisedNodes.size === 0) return;
    for (const node of this.penalisedNodes.keys()) {
      if (this.penalisedNodes.get(node) <= elapsed) this.penalisedNodes.delete(node);
    }
  }

  updateAim(deltaSeconds, context) {
    this.getEyePosition(scratchEye);

    if (this.targetVisible && this.target !== null) {
      // The tier's decay is a rate constant, not a degree-per-second subtraction:
      // at 0.35 the Easy cone would need over a minute to close.
      this.aimConeRadians *= Math.exp(-this.difficulty.aimErrorDecayPerSecond * deltaSeconds);

      this.reaimTimer -= deltaSeconds;
      if (this.reaimTimer <= 0) {
        this.reaimTimer += this.difficulty.reaimInterval;
        this.rollAimOffset();
      }

      this.computeAimPoint(this.target);

      const horizontal = Math.hypot(scratchAimPoint.x - scratchEye.x, scratchAimPoint.z - scratchEye.z);
      this.trueYaw = Math.atan2(-(scratchAimPoint.x - scratchEye.x), -(scratchAimPoint.z - scratchEye.z));
      this.truePitch = Math.atan2(scratchAimPoint.y - scratchEye.y, horizontal);

      this.desiredYaw = this.trueYaw + this.aimOffsetYaw;
      this.desiredPitch = this.truePitch + this.aimOffsetPitch;
    } else {
      this.aimAlongTravel(context);
      this.trueYaw = this.desiredYaw;
      this.truePitch = this.desiredPitch;
    }

    const blend = 1 - Math.exp(-COMBAT.aimTurnRatePerSecond * deltaSeconds);
    this.yaw += wrapAngle(this.desiredYaw - this.yaw) * blend;
    this.yaw = wrapAngle(this.yaw);
    this.pitch += (this.desiredPitch - this.pitch) * blend;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -CAMERA.maximumPitch, CAMERA.maximumPitch);
  }

  aimAlongTravel(context) {
    this.desiredPitch = 0;

    if (this.state === 'chase') {
      this.desiredYaw = Math.atan2(
        -(this.lastKnownPosition.x - this.position.x),
        -(this.lastKnownPosition.z - this.position.z)
      );
      return;
    }

    if (this.pathIndex < this.path.length) {
      context.waypoints.nodePosition(this.path[this.pathIndex], scratchNode);
      this.desiredYaw = Math.atan2(
        -(scratchNode.x - this.position.x),
        -(scratchNode.z - this.position.z)
      );
      return;
    }

    if (this.horizontalSpeed > 1e-3) {
      this.desiredYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    }
  }

  computeAimPoint(target) {
    target.getEyePosition(scratchAimPoint);

    const prediction = this.difficulty.prediction;
    if (prediction === 'none') return;

    scratchAimPoint.addScaledVector(target.velocity, this.difficulty.reactionDelay);
    if (prediction !== 'leading') return;

    scratchDirection
      .set(scratchAimPoint.x - scratchEye.x, 0, scratchAimPoint.z - scratchEye.z)
      .normalize();

    const alongTrack = target.velocity.x * scratchDirection.x + target.velocity.z * scratchDirection.z;
    scratchAimPoint.x += (target.velocity.x - scratchDirection.x * alongTrack) * COMBAT.leadingLateralSeconds;
    scratchAimPoint.z += (target.velocity.z - scratchDirection.z * alongTrack) * COMBAT.leadingLateralSeconds;
  }

  rollAimOffset() {
    const angle = this.random.next() * TWO_PI;
    const magnitude = this.aimConeRadians * Math.sqrt(this.random.next());
    this.aimOffsetYaw = Math.cos(angle) * magnitude;
    this.aimOffsetPitch = Math.sin(angle) * magnitude;
  }

  rollBurstShots() {
    return Math.round(this.random.range(COMBAT.burstMinimumShots, COMBAT.burstMaximumShots));
  }

  updateTrigger(deltaSeconds, context) {
    const weapons = context.weapons;

    if (this.burstRestTimer > 0) this.burstRestTimer -= deltaSeconds;

    if (this.state !== 'attack' || this.target === null || !this.targetVisible) {
      weapons.tryFire(this, false);
      if (this.state === 'reload' || this.state === 'takeCover') weapons.tryReload(this);
      return;
    }

    const distance = Math.hypot(
      this.target.position.x - this.position.x,
      this.target.position.z - this.position.z
    );

    const chosen = this.chooseWeaponIndex(distance);
    if (chosen !== this.weaponIndex) weapons.switchTo(this, chosen);

    const weapon = this.currentWeapon;
    if (weapon.kind === 'gun' && this.currentMagazine === 0) {
      weapons.tryFire(this, false);
      weapons.tryReload(this);
      return;
    }

    const ready =
      context.elapsed >= this.canFireElapsed && this.burstRestTimer <= 0 && this.isAimAligned();

    if (!ready) {
      weapons.tryFire(this, false);
      return;
    }

    const continuous = weapon.kind === 'melee' || weapon.fireMode === 'automatic';
    const held = continuous ? true : this.triggerToggle;
    this.triggerToggle = !this.triggerToggle;

    if (!weapons.tryFire(this, held)) return;

    this.burstShotsRemaining -= 1;
    if (this.burstShotsRemaining > 0) return;

    this.burstShotsRemaining = this.rollBurstShots();
    this.burstRestTimer = this.random.range(
      this.difficulty.burstRestMinimum,
      this.difficulty.burstRestMaximum
    );
  }

  /**
   * Measured against the unoffset aim: the error cone is the bot's accuracy,
   * so waiting to perfect an aim it deliberately randomised would double-count it.
   */
  isAimAligned() {
    const tolerance = this.aimConeRadians + THREE.MathUtils.degToRad(COMBAT.fireAlignmentDegrees);
    return (
      Math.abs(wrapAngle(this.trueYaw - this.yaw)) < tolerance &&
      Math.abs(this.truePitch - this.pitch) < tolerance
    );
  }

  chooseWeaponIndex(distance) {
    if (distance <= COMBAT.meleeSwitchMetres) {
      const karambit = this.weapons[this.karambitIndex];
      return distance <= karambit.reach ? this.karambitIndex : this.pitchforkIndex;
    }

    if (distance <= this.weapons[this.shotgunIndex].falloffStart && this.magazines[this.shotgunIndex] > 0) {
      return this.shotgunIndex;
    }

    if (distance <= this.weapons[this.rifleIndex].falloffEnd && this.magazines[this.rifleIndex] > 0) {
      return this.rifleIndex;
    }

    if (this.magazines[this.pistolIndex] > 0) return this.pistolIndex;
    if (this.magazines[this.rifleIndex] > 0) return this.rifleIndex;
    return this.weaponIndex;
  }

  steer(deltaSeconds, context) {
    this.speedScale = 1;
    this.intent.wantsJump = false;
    this.intent.wantsCrouch = false;
    this.intent.wantsSprint = false;

    if (this.recoveryStage === 1) {
      this.stopIntent();
      return;
    }

    if (this.recoveryStage === 2) {
      this.setIntentFromDirection(this.recoveryHeadingX, this.recoveryHeadingZ);
      return;
    }

    if (this.state === 'attack' && this.target !== null) {
      this.steerCombat(deltaSeconds, context);
      return;
    }

    this.steerPath(deltaSeconds, context);
  }

  steerPath(deltaSeconds, context) {
    const { waypoints, elapsed } = context;

    if (this.pathIndex >= this.path.length) {
      this.stopIntent();
      this.updateCoverHold(deltaSeconds);
      return;
    }

    const node = this.path[this.pathIndex];

    if (waypoints.isThresholdNode(node) && this.reservedNode !== node) {
      if (waypoints.tryReserveNode(node, this.id)) {
        this.reservedNode = node;
        this.reservedNodePassed = false;
        this.waitingForReservation = false;
        this.waitingSeconds = 0;
      } else {
        this.waitForReservation(deltaSeconds, context, node, elapsed);
        return;
      }
    }

    waypoints.nodePosition(node, scratchNode);
    scratchNode.x += this.jitterX;
    scratchNode.z += this.jitterZ;

    const offsetX = scratchNode.x - this.position.x;
    const offsetZ = scratchNode.z - this.position.z;
    const distance = Math.hypot(offsetX, offsetZ);

    if (distance <= waypoints.arrivalRadius(node)) {
      this.advancePath();
      if (this.pathIndex >= this.path.length) {
        this.stopIntent();
        return;
      }
    }

    const doorwayDistance = this.doorwayDistance(waypoints);
    this.applySteering(context, offsetX, offsetZ, distance, doorwayDistance, deltaSeconds);

    this.intent.wantsSprint =
      doorwayDistance > DOORWAY.calmRadiusMetres &&
      distance > STEERING.sprintBeyondMetres &&
      this.state === 'roam';
  }

  /**
   * Waiting happens at the approach node, never in the doorway itself: two
   * bots holding the threshold are the deadlock this whole design avoids.
   */
  waitForReservation(deltaSeconds, context, node, elapsed) {
    const { waypoints } = context;

    this.waitingForReservation = true;
    this.waitingSeconds += deltaSeconds;

    if (this.waitingSeconds > DOORWAY.reservationWaitTimeoutSeconds) {
      this.penaliseNode(node, elapsed);
      this.abandonPath(waypoints);
      this.stopIntent();
      return;
    }

    if (this.pathIndex === 0) {
      this.stopIntent();
      return;
    }

    waypoints.nodePosition(this.path[this.pathIndex - 1], scratchNode);
    const offsetX = scratchNode.x - this.position.x;
    const offsetZ = scratchNode.z - this.position.z;
    const distance = Math.hypot(offsetX, offsetZ);

    if (distance <= waypoints.arrivalRadius(this.path[this.pathIndex - 1])) {
      this.stopIntent();
      return;
    }

    this.applySteering(context, offsetX, offsetZ, distance, 0, deltaSeconds);
  }

  applySteering(context, offsetX, offsetZ, distance, doorwayDistance, deltaSeconds) {
    const safeDistance = Math.max(distance, 1e-6);
    const directionX = offsetX / safeDistance;
    const directionZ = offsetZ / safeDistance;

    let steerX = directionX * STEERING.seekWeight;
    let steerZ = directionZ * STEERING.seekWeight;

    const separationWeight =
      doorwayDistance <= DOORWAY.queueRadiusMetres
        ? STEERING.queuedSeparationWeight
        : STEERING.separationWeight;

    for (let index = 0; index < context.fighters.length; index += 1) {
      const fighter = context.fighters[index];
      if (fighter === this || !fighter.alive) continue;

      const awayX = this.position.x - fighter.position.x;
      const awayZ = this.position.z - fighter.position.z;
      const gap = Math.hypot(awayX, awayZ);
      if (gap > STEERING.separationRadiusMetres || gap < 1e-6) continue;

      const strength = (1 - gap / STEERING.separationRadiusMetres) * separationWeight;
      steerX += (awayX / gap) * strength;
      steerZ += (awayZ / gap) * strength;
    }

    if (doorwayDistance > DOORWAY.calmRadiusMetres) {
      scratchProbe.set(this.position.x, this.position.y + FIGHTER.standingHeight * 0.5, this.position.z);
      scratchDirection.set(directionX, 0, directionZ);

      const ahead = context.collisionWorld.raycast(
        scratchProbe,
        scratchDirection,
        STEERING.avoidanceProbeMetres
      );

      if (ahead < STEERING.avoidanceProbeMetres) {
        const angle = THREE.MathUtils.degToRad(STEERING.avoidanceWhiskerDegrees);
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);

        const leftX = directionX * cosine + directionZ * sine;
        const leftZ = -directionX * sine + directionZ * cosine;
        const rightX = directionX * cosine - directionZ * sine;
        const rightZ = directionX * sine + directionZ * cosine;

        scratchDirection.set(leftX, 0, leftZ);
        const leftClearance = context.collisionWorld.raycast(
          scratchProbe,
          scratchDirection,
          STEERING.avoidanceProbeMetres
        );

        scratchDirection.set(rightX, 0, rightZ);
        const rightClearance = context.collisionWorld.raycast(
          scratchProbe,
          scratchDirection,
          STEERING.avoidanceProbeMetres
        );

        const weight = (1 - ahead / STEERING.avoidanceProbeMetres) * STEERING.avoidanceWeight;
        if (leftClearance >= rightClearance) {
          steerX += leftX * weight;
          steerZ += leftZ * weight;
        } else {
          steerX += rightX * weight;
          steerZ += rightZ * weight;
        }
      }

      this.wanderAngle += (this.random.next() * 2 - 1) * STEERING.wanderTurnRadiansPerSecond * deltaSeconds;
      steerX += Math.cos(this.wanderAngle) * STEERING.wanderWeight;
      steerZ += Math.sin(this.wanderAngle) * STEERING.wanderWeight;
    }

    const length = Math.hypot(steerX, steerZ);
    if (length < 1e-6) {
      this.stopIntent();
      return;
    }

    this.setIntentFromDirection(steerX / length, steerZ / length);

    this.speedScale = Math.max(
      STEERING.minimumArriveSpeedFactor,
      Math.min(1, distance / STEERING.arriveSlowingMetres)
    );

    if (doorwayDistance <= DOORWAY.queueRadiusMetres) {
      this.speedScale = Math.min(this.speedScale, this.queueBrake(context, directionX, directionZ));
    }
  }

  /** Reynolds' queuing brake: hold back behind a slower bot instead of shoving. */
  queueBrake(context, directionX, directionZ) {
    let scale = 1;

    for (let index = 0; index < context.fighters.length; index += 1) {
      const fighter = context.fighters[index];
      if (fighter === this || !fighter.alive) continue;

      const aheadX = fighter.position.x - this.position.x;
      const aheadZ = fighter.position.z - this.position.z;
      const gap = Math.hypot(aheadX, aheadZ);
      if (gap > STEERING.queueBrakeMetres || gap < 1e-6) continue;
      if ((aheadX * directionX + aheadZ * directionZ) / gap < STEERING.queueBrakeCosine) continue;
      if (fighter.horizontalSpeed >= this.horizontalSpeed) continue;

      scale = Math.min(scale, gap / STEERING.queueBrakeMetres);
    }

    return scale;
  }

  doorwayDistance(waypoints) {
    let nearest = Infinity;

    for (let offset = -1; offset <= 1; offset += 1) {
      const index = this.pathIndex + offset;
      if (index < 0 || index >= this.path.length) continue;

      const node = this.path[index];
      if (!waypoints.isThresholdNode(node) && !waypoints.isApproachNode(node)) continue;

      waypoints.nodePosition(node, scratchProbe);
      const distance = Math.hypot(
        scratchProbe.x - this.position.x,
        scratchProbe.z - this.position.z
      );
      if (distance < nearest) nearest = distance;
    }

    return nearest;
  }

  steerCombat(deltaSeconds, context) {
    const toX = this.target.position.x - this.position.x;
    const toZ = this.target.position.z - this.position.z;
    const distance = Math.max(Math.hypot(toX, toZ), 1e-6);
    const unitX = toX / distance;
    const unitZ = toZ / distance;

    this.strafeTimer -= deltaSeconds;
    if (this.strafeTimer <= 0) {
      this.strafeSign = -this.strafeSign;
      this.strafeTimer = this.random.range(COMBAT.strafeMinimumSeconds, COMBAT.strafeMaximumSeconds);
    }

    let sideX = -unitZ * this.strafeSign;
    let sideZ = unitX * this.strafeSign;

    scratchProbe.set(this.position.x, this.position.y + FIGHTER.standingHeight * 0.5, this.position.z);
    scratchDirection.set(sideX, 0, sideZ);
    if (
      context.collisionWorld.raycast(scratchProbe, scratchDirection, STEERING.avoidanceProbeMetres) <
      STEERING.avoidanceProbeMetres
    ) {
      this.strafeSign = -this.strafeSign;
      this.strafeTimer = this.random.range(COMBAT.strafeMinimumSeconds, COMBAT.strafeMaximumSeconds);
      sideX = -sideX;
      sideZ = -sideZ;
    }

    const weapon = this.currentWeapon;
    const comfort = weapon.kind === 'melee' ? 0 : weapon.falloffStart;

    let approach = 0;
    if (distance > comfort) approach = 1;
    else if (distance < comfort * COMBAT.closeComfortFactor) approach = -1;

    let steerX = sideX + unitX * approach;
    let steerZ = sideZ + unitZ * approach;

    for (let index = 0; index < context.fighters.length; index += 1) {
      const fighter = context.fighters[index];
      if (fighter === this || !fighter.alive) continue;

      const awayX = this.position.x - fighter.position.x;
      const awayZ = this.position.z - fighter.position.z;
      const gap = Math.hypot(awayX, awayZ);
      if (gap > STEERING.separationRadiusMetres || gap < 1e-6) continue;

      const strength = (1 - gap / STEERING.separationRadiusMetres) * STEERING.separationWeight;
      steerX += (awayX / gap) * strength;
      steerZ += (awayZ / gap) * strength;
    }

    const length = Math.hypot(steerX, steerZ);
    if (length < 1e-6) {
      this.stopIntent();
      return;
    }

    this.setIntentFromDirection(steerX / length, steerZ / length);
  }

  updateCoverHold(deltaSeconds) {
    if (this.state !== 'takeCover') return;

    this.coverSeconds += deltaSeconds;
    if (this.coverSeconds < COMBAT.coverHoldSeconds) return;

    this.wantsCover = false;
    this.coverRolled = false;
    this.coverNode = -1;
    this.coverSeconds = 0;
  }

  /** World direction to the local forward/right pair Fighter.step expects. */
  setIntentFromDirection(directionX, directionZ) {
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.intent.forward = -sinYaw * directionX - cosYaw * directionZ;
    this.intent.right = cosYaw * directionX - sinYaw * directionZ;
  }

  stopIntent() {
    this.intent.forward = 0;
    this.intent.right = 0;
    this.intent.wantsJump = false;
    this.intent.wantsSprint = false;
    this.intent.wantsCrouch = false;
  }

  advancePath() {
    if (this.path[this.pathIndex] === this.reservedNode) this.reservedNodePassed = true;

    this.pathIndex += 1;
    this.jitterX = 0;
    this.jitterZ = 0;
    this.resetStuckSamples();
    this.endRecovery();
  }

  updateReservationRelease(waypoints) {
    if (this.reservedNode === -1 || !this.reservedNodePassed) return;

    waypoints.nodePosition(this.reservedNode, scratchProbe);
    const distance = Math.hypot(
      scratchProbe.x - this.position.x,
      scratchProbe.z - this.position.z
    );

    if (distance < waypoints.arrivalRadius(this.reservedNode) + DOORWAY.clearMetresPastThreshold) {
      return;
    }

    waypoints.releaseNode(this.reservedNode, this.id);
    this.reservedNode = -1;
    this.reservedNodePassed = false;
  }

  releaseReservation(waypoints) {
    if (this.reservedNode === -1) return;
    waypoints.releaseNode(this.reservedNode, this.id);
    this.reservedNode = -1;
    this.reservedNodePassed = false;
  }

  updateStuck(deltaSeconds, context) {
    if (this.recoveryStage !== 0) {
      this.advanceRecovery(deltaSeconds, context);
      return;
    }

    const navigating =
      !this.waitingForReservation &&
      this.pathIndex < this.path.length &&
      this.state !== 'attack';

    if (!navigating) {
      this.resetStuckSamples();
      return;
    }

    this.stuckSampleTimer -= deltaSeconds;
    if (this.stuckSampleTimer > 0) return;
    this.stuckSampleTimer += STUCK.sampleIntervalSeconds;

    const oldestX = this.stuckSamplesX[this.stuckSampleIndex];
    const oldestZ = this.stuckSamplesZ[this.stuckSampleIndex];
    const hadFullWindow = this.stuckSampleCount >= STUCK_SAMPLE_COUNT;

    this.stuckSamplesX[this.stuckSampleIndex] = this.position.x;
    this.stuckSamplesZ[this.stuckSampleIndex] = this.position.z;
    this.stuckSampleIndex = (this.stuckSampleIndex + 1) % STUCK_SAMPLE_COUNT;
    if (!hadFullWindow) this.stuckSampleCount += 1;

    if (!hadFullWindow) return;

    const displacement = Math.hypot(this.position.x - oldestX, this.position.z - oldestZ);
    const crawling = this.horizontalSpeed < this.desiredSpeed * STUCK.speedFractionOfDesired;

    if (displacement >= STUCK.displacementMetres || !crawling) {
      this.stuckSeconds = 0;
      return;
    }

    this.stuckSeconds += STUCK.sampleIntervalSeconds;
    if (this.stuckSeconds < STUCK.confirmSeconds) return;
    this.beginRecovery();
  }

  beginRecovery() {
    this.recoveryStage = 1;
    this.recoveryTimer = this.random.range(
      RECOVERY.pauseMinimumSeconds,
      RECOVERY.pauseMaximumSeconds
    );
    this.recoveryOriginX = this.position.x;
    this.recoveryOriginZ = this.position.z;

    const speed = this.horizontalSpeed;
    if (speed > 1e-3) {
      this.recoveryHeadingX = -this.velocity.x / speed;
      this.recoveryHeadingZ = -this.velocity.z / speed;
    } else {
      this.recoveryHeadingX = Math.sin(this.yaw);
      this.recoveryHeadingZ = Math.cos(this.yaw);
    }

    this.stuckSeconds = 0;
    this.resetStuckSamples();
  }

  advanceRecovery(deltaSeconds, context) {
    const escaped = Math.hypot(
      this.position.x - this.recoveryOriginX,
      this.position.z - this.recoveryOriginZ
    );

    if (this.recoveryStage >= 3 && escaped > RECOVERY.escapeMetres) {
      this.endRecovery();
      return;
    }

    this.recoveryTimer -= deltaSeconds;
    if (this.recoveryTimer > 0) return;

    if (this.recoveryStage === 1) {
      this.recoveryStage = 2;
      this.recoveryTimer =
        this.random.range(RECOVERY.backupMinimumMetres, RECOVERY.backupMaximumMetres) /
        this.desiredSpeed;
      return;
    }

    if (this.recoveryStage === 2) {
      this.recoveryStage = 3;
      this.recoveryTimer = RECOVERY.retrySeconds;
      this.jitterX = (this.random.next() * 2 - 1) * RECOVERY.jitterMetres;
      this.jitterZ = (this.random.next() * 2 - 1) * RECOVERY.jitterMetres;
      this.recoveryOriginX = this.position.x;
      this.recoveryOriginZ = this.position.z;
      return;
    }

    if (this.recoveryStage === 3) {
      this.recoveryStage = 4;
      this.recoveryTimer = RECOVERY.repathSettleSeconds;
      this.jitterX = 0;
      this.jitterZ = 0;
      this.repathAroundJam(context);
      return;
    }

    this.recoveryStage = 0;
    this.recoveryTimer = 0;
    this.setDestination(context.waypoints, this.pickRoamNode(context.waypoints));
  }

  /** Penalise the doorway we jammed in, then take whatever route avoids it. */
  repathAroundJam(context) {
    const { waypoints, elapsed } = context;

    if (this.pathIndex < this.path.length) {
      this.penaliseNode(this.path[this.pathIndex], elapsed);
    }

    const goal = this.destinationNode;
    this.abandonPath(waypoints);

    if (goal === -1) {
      this.setDestination(waypoints, this.pickRoamNode(waypoints));
      return;
    }

    const path = waypoints.findPath(waypoints.nearestNode(this.position), goal);

    let jammed = false;
    for (let index = 0; index < path.length; index += 1) {
      if (!this.penalisedNodes.has(path[index])) continue;
      jammed = true;
      break;
    }

    if (path.length === 0 || jammed) {
      this.setDestination(waypoints, this.pickRoamNode(waypoints));
      return;
    }

    this.path = path;
    this.pathIndex = 0;
    this.destinationNode = goal;
  }

  endRecovery() {
    if (this.recoveryStage === 0) return;
    this.recoveryStage = 0;
    this.recoveryTimer = 0;
    this.jitterX = 0;
    this.jitterZ = 0;
    this.stuckSeconds = 0;
    this.resetStuckSamples();
  }

  resetStuckSamples() {
    this.stuckSampleCount = 0;
    this.stuckSampleIndex = 0;
    this.stuckSampleTimer = STUCK.sampleIntervalSeconds;
  }

  enterDead(waypoints) {
    this.state = 'dead';
    waypoints.releaseAllFor(this.id);
    this.reservedNode = -1;
    this.reservedNodePassed = false;
    this.path.length = 0;
    this.pathIndex = 0;
    this.destinationNode = -1;
    this.waitingForReservation = false;
    this.waitingSeconds = 0;
    this.targetVisible = false;
    this.endRecovery();
    this.stopIntent();
  }

  resetAfterRespawn() {
    this.state = 'roam';
    this.target = null;
    this.targetVisible = false;
    this.lastSeenElapsed = -Infinity;
    this.aimConeRadians = 0;
    this.aimOffsetYaw = 0;
    this.aimOffsetPitch = 0;
    this.coverNode = -1;
    this.coverSeconds = 0;
    this.coverRolled = false;
    this.wantsCover = false;
    this.stuckSeconds = 0;
    this.penalisedNodes.clear();
    this.resetStuckSamples();
    this.endRecovery();
    this.desiredYaw = this.yaw;
    this.desiredPitch = this.pitch;
    this.trueYaw = this.yaw;
    this.truePitch = this.pitch;
  }

  syncVisuals(deltaSeconds) {
    this.model.update(this, deltaSeconds);

  }

  dispose() {
    this.model.dispose();
    this.nametag.material.map.dispose();
    this.nametag.material.dispose();
  }
}

function wrapAngle(angle) {
  return ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}
