import * as THREE from 'three';
import { Fighter, createIntent } from './fighter.js';
import { CAMERA, INPUT, AIM } from '../config/tunables.js';

const scratchLookDelta = new THREE.Vector2();
const scratchEyePosition = new THREE.Vector3();

const TWO_PI = Math.PI * 2;

const VIEW_BOB_CYCLES_PER_METRE = 0.55;
const VIEW_BOB_VERTICAL_METRES = 0.025;
const VIEW_BOB_LATERAL_METRES = 0.018;
const VIEW_BOB_CROUCH_DAMPING = 0.6;
const VIEW_BOB_AIM_DAMPING = 0.7;
const VIEW_BOB_SMOOTHING_PER_SECOND = 9;

/**
 * Human controlled fighter: turns input into movement intent and drives the
 * camera. Camera uses YXZ Euler order with pitch clamped to CAMERA.maximumPitch.
 *
 * Owned by PH-2-player.
 */
export class Player extends Fighter {
  /**
   * @param {{
   *   id: number, name: string, color: number, feelKey: string,
   *   camera: import('three').PerspectiveCamera,
   *   input: import('../input.js').Input
   * }} options
   */
  constructor({ id, name, color, feelKey, camera, input }) {
    super({ id, name, color, isBot: false, feelKey });

    this.camera = camera;
    this.input = input;
    this.sensitivity = CAMERA.defaultSensitivity;
    this.keyboardYawRadiansPerSecond = THREE.MathUtils.degToRad(INPUT.keyboardLook.yawDegreesPerSecond);
    this.keyboardPitchRadiansPerSecond = THREE.MathUtils.degToRad(
      INPUT.keyboardLook.pitchDegreesPerSecond
    );

    this.intent = createIntent();

    this.viewBobEnabled = true;
    this.viewBobAmplitude = 0;
    this.viewBobVertical = 0;
    this.viewBobLateral = 0;

    camera.rotation.order = 'YXZ';
  }

  /** Applies a pointer-lock mouse delta to yaw and pitch. */
  applyLook(deltaX, deltaY, sensitivity) {
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;

    this.pitch = THREE.MathUtils.clamp(this.pitch, -CAMERA.maximumPitch, CAMERA.maximumPitch);
    this.yaw = ((((this.yaw + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  }

  /** Look steadies as the weapon comes up, so aiming is not merely a zoom. */
  get lookSensitivityMultiplier() {
    return THREE.MathUtils.lerp(1, AIM.sensitivityMultiplier, this.aimFraction);
  }

  /** @param {number} degreesPerSecond */
  setKeyboardTurnSpeed(degreesPerSecond) {
    this.keyboardYawRadiansPerSecond = THREE.MathUtils.degToRad(degreesPerSecond);
  }

  /**
   * Arrow keys and Q/E, composing additively with the pointer look above.
   * Sprint doubles as the fast-turn modifier.
   */
  applyKeyboardLook(deltaSeconds) {
    const turn = (this.input.isDown('turnRight') ? 1 : 0) - (this.input.isDown('turnLeft') ? 1 : 0);
    const tilt = (this.input.isDown('lookDown') ? 1 : 0) - (this.input.isDown('lookUp') ? 1 : 0);
    const multiplier = this.input.isDown('sprint') ? INPUT.keyboardLook.fastMultiplier : 1;

    this.applyLook(
      turn * this.keyboardYawRadiansPerSecond * multiplier * deltaSeconds,
      tilt * this.keyboardPitchRadiansPerSecond * multiplier * deltaSeconds,
      this.lookSensitivityMultiplier
    );
  }

  /** Reads input, builds the movement intent, and steps the fighter. */
  update(deltaSeconds, collisionWorld) {
    this.input.consumeLookDelta(scratchLookDelta, deltaSeconds);
    this.applyLook(
      scratchLookDelta.x,
      scratchLookDelta.y,
      this.sensitivity * this.lookSensitivityMultiplier
    );
    this.applyKeyboardLook(deltaSeconds);

    const intent = this.intent;
    intent.forward = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
    intent.right = (this.input.isDown('right') ? 1 : 0) - (this.input.isDown('left') ? 1 : 0);
    intent.wantsJump = this.input.isDown('jump');
    intent.wantsSprint = this.input.isDown('sprint');
    intent.wantsCrouch = this.input.isDown('crouch');
    intent.wantsAim = this.input.isDown('aim');

    this.step(deltaSeconds, collisionWorld, intent);
    this.updateViewBob(deltaSeconds);
  }

  updateViewBob(deltaSeconds) {
    const walking = this.alive && this.onGround ? this.horizontalSpeed / this.feel.walkSpeed : 0;
    const targetAmplitude =
      Math.min(walking, 1) *
      (1 - this.crouchAmount * VIEW_BOB_CROUCH_DAMPING) *
      (1 - this.aimFraction * VIEW_BOB_AIM_DAMPING);

    const blend = Math.min(1, deltaSeconds * VIEW_BOB_SMOOTHING_PER_SECOND);
    this.viewBobAmplitude += (targetAmplitude - this.viewBobAmplitude) * blend;

    const phase = this.distanceTravelled * VIEW_BOB_CYCLES_PER_METRE * TWO_PI;
    this.viewBobVertical = Math.sin(phase * 2) * VIEW_BOB_VERTICAL_METRES * this.viewBobAmplitude;
    this.viewBobLateral = Math.sin(phase) * VIEW_BOB_LATERAL_METRES * this.viewBobAmplitude;
  }

  /** Copies eye position and aim angles onto the camera, including recoil. */
  syncCamera() {
    this.getEyePosition(scratchEyePosition);

    if (this.viewBobEnabled) {
      scratchEyePosition.x += Math.cos(this.yaw) * this.viewBobLateral;
      scratchEyePosition.z += -Math.sin(this.yaw) * this.viewBobLateral;
      scratchEyePosition.y += this.viewBobVertical;
    }

    this.camera.position.copy(scratchEyePosition);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0);

    // Only fov is touched here; Game.resize owns aspect, so neither overwrites
    // the other's value and the matrix is rebuilt only while the zoom moves.
    const fieldOfView = THREE.MathUtils.lerp(
      CAMERA.fieldOfView,
      CAMERA.fieldOfView * AIM.fieldOfViewMultiplier,
      this.aimFraction
    );
    if (this.camera.fov !== fieldOfView) {
      this.camera.fov = fieldOfView;
      this.camera.updateProjectionMatrix();
    }
  }
}
