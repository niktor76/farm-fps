import * as THREE from 'three';
import { Fighter, createIntent } from './fighter.js';
import { CAMERA, INPUT, scopedFieldOfView } from '../config/tunables.js';

const scratchLookDelta = new THREE.Vector2();
const scratchEyePosition = new THREE.Vector3();

const TWO_PI = Math.PI * 2;

const VIEW_BOB_CYCLES_PER_METRE = 0.55;
const VIEW_BOB_VERTICAL_METRES = 0.025;
const VIEW_BOB_LATERAL_METRES = 0.018;
const VIEW_BOB_CROUCH_DAMPING = 0.6;
const VIEW_BOB_AIM_DAMPING = 0.7;
const VIEW_BOB_SMOOTHING_PER_SECOND = 9;

// The player has no third-person body, so death is sold entirely by the camera:
// it sinks toward the ground and rolls, then rights itself on respawn.
const DEATH_VIEW = {
  dropSeconds: 0.85,
  recoverSeconds: 0.4,
  heightMetres: 0.35,
  rollRadians: 0.45,
  pitchRadians: 0.2
};

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
   *   input: import('../input.js').Input,
   *   fieldOfView: number
   * }} options
   */
  constructor({ id, name, color, feelKey, camera, input, fieldOfView }) {
    super({ id, name, color, isBot: false, feelKey });

    this.camera = camera;
    this.input = input;
    this.baseFieldOfView = fieldOfView;
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
    this.deathViewFraction = 0;

    camera.rotation.order = 'YXZ';
  }

  /** Applies a pointer-lock mouse delta to yaw and pitch. */
  applyLook(deltaX, deltaY, sensitivity) {
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;

    this.pitch = THREE.MathUtils.clamp(this.pitch, -CAMERA.maximumPitch, CAMERA.maximumPitch);
    this.yaw = ((((this.yaw + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  }

  /** Field of view the camera is showing right now, hip to fully scoped. */
  get currentFieldOfView() {
    const optic = this.currentOptic;
    if (optic === null) return this.baseFieldOfView;

    // Only the hip end follows the player's setting. The scoped end is a fixed
    // real angle, so a wider field of view cannot widen what a 6x sight shows.
    return THREE.MathUtils.lerp(
      this.baseFieldOfView,
      scopedFieldOfView(optic.magnification),
      this.aimFraction
    );
  }

  /**
   * Look slows with the zoom, so the same mouse travel moves the crosshair the
   * same distance across the screen at any magnification. Screen offset runs
   * through the tangent of the half-angle, so the multiplier is the ratio of
   * those tangents; at full scope it reduces to exactly 1 / magnification.
   */
  get lookSensitivityMultiplier() {
    return (
      Math.tan((this.currentFieldOfView * Math.PI) / 360) /
      Math.tan((this.baseFieldOfView * Math.PI) / 360)
    );
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
    this.updateDeathView(deltaSeconds);
  }

  updateDeathView(deltaSeconds) {
    const target = this.alive ? 0 : 1;
    const rate = deltaSeconds / (this.alive ? DEATH_VIEW.recoverSeconds : DEATH_VIEW.dropSeconds);
    this.deathViewFraction += THREE.MathUtils.clamp(
      target - this.deathViewFraction,
      -rate,
      rate
    );
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

    // Eased after the bob so the bob is blended away rather than fought, and
    // the target height is measured from the feet, which sit on the ground.
    const dying = THREE.MathUtils.smoothstep(this.deathViewFraction, 0, 1);
    scratchEyePosition.y = THREE.MathUtils.lerp(
      scratchEyePosition.y,
      this.position.y + DEATH_VIEW.heightMetres,
      dying
    );

    this.camera.position.copy(scratchEyePosition);
    this.camera.rotation.set(
      this.pitch + this.recoilPitch - DEATH_VIEW.pitchRadians * dying,
      this.yaw + this.recoilYaw,
      DEATH_VIEW.rollRadians * dying
    );

    // Only fov is touched here; Game.resize owns aspect, so neither overwrites
    // the other's value and the matrix is rebuilt only while the zoom moves.
    const fieldOfView = this.currentFieldOfView;
    if (this.camera.fov !== fieldOfView) {
      this.camera.fov = fieldOfView;
      this.camera.updateProjectionMatrix();
    }
  }
}
