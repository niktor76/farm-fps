/**
 * Keyboard and mouse input behind pointer lock.
 *
 * Pointer lock requests `unadjustedMovement` so operating system mouse
 * acceleration does not distort aim, falling back when the browser rejects the
 * option. Chrome refuses an automatic re-lock immediately after the user
 * presses Escape, so re-locking requires a fresh click.
 *
 * Owned by PH-2-player.
 */
export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    throw new Error('not implemented: PH-2-player');
  }

  requestLock() {
    throw new Error('not implemented: PH-2-player');
  }

  releaseLock() {
    throw new Error('not implemented: PH-2-player');
  }

  /** @returns {boolean} */
  get locked() {
    throw new Error('not implemented: PH-2-player');
  }

  /** Accumulated mouse movement since the last call, in CSS pixels. */
  consumeLookDelta(target) {
    throw new Error('not implemented: PH-2-player');
  }

  /** @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'crouch'|'fire'|'reload'|'scoreboard'} action */
  isDown(action) {
    throw new Error('not implemented: PH-2-player');
  }

  /** True only on the frame the action went down. */
  wasPressed(action) {
    throw new Error('not implemented: PH-2-player');
  }

  /** Weapon slot requested this frame via number keys, or null. */
  consumeWeaponSlot() {
    throw new Error('not implemented: PH-2-player');
  }

  /** Accumulated wheel direction this frame: -1, 0 or 1. */
  consumeWheel() {
    throw new Error('not implemented: PH-2-player');
  }

  endFrame() {
    throw new Error('not implemented: PH-2-player');
  }

  dispose() {
    throw new Error('not implemented: PH-2-player');
  }
}
