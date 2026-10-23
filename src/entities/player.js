/**
 * Human controlled fighter: turns input into movement intent and drives the
 * camera. Camera uses YXZ Euler order with pitch clamped to CAMERA.maximumPitch.
 *
 * Owned by PH-2-player.
 */
export class Player {
  /**
   * @param {{
   *   id: number, name: string, color: number, feelKey: string,
   *   camera: import('three').PerspectiveCamera,
   *   input: import('../input.js').Input
   * }} options
   */
  constructor(options) {
    throw new Error('not implemented: PH-2-player');
  }

  /** Applies a pointer-lock mouse delta to yaw and pitch. */
  applyLook(deltaX, deltaY, sensitivity) {
    throw new Error('not implemented: PH-2-player');
  }

  /** Reads input, builds the movement intent, and steps the fighter. */
  update(deltaSeconds, collisionWorld) {
    throw new Error('not implemented: PH-2-player');
  }

  /** Copies eye position and aim angles onto the camera, including recoil. */
  syncCamera() {
    throw new Error('not implemented: PH-2-player');
  }
}
