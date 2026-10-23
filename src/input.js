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

const ACTION_BY_KEY_CODE = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  KeyC: 'crouch',
  KeyR: 'reload',
  Tab: 'scoreboard'
};

const WEAPON_SLOT_BY_KEY_CODE = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4
};

const SWALLOWED_KEY_CODES = new Set(['Space', 'Tab']);

export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;

    this.downActions = new Set();
    this.pressedActions = new Set();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.weaponSlotRequest = null;
    this.wheelDirection = 0;

    this.onKeyDown = (event) => {
      if (SWALLOWED_KEY_CODES.has(event.code)) event.preventDefault();
      if (event.repeat) return;

      const slot = WEAPON_SLOT_BY_KEY_CODE[event.code];
      if (slot !== undefined) this.weaponSlotRequest = slot;

      const action = ACTION_BY_KEY_CODE[event.code];
      if (action === undefined) return;
      this.downActions.add(action);
      this.pressedActions.add(action);
    };

    this.onKeyUp = (event) => {
      const action = ACTION_BY_KEY_CODE[event.code];
      if (action === undefined) return;
      this.downActions.delete(action);
    };

    this.onMouseDown = (event) => {
      if (event.button !== 0) return;
      this.downActions.add('fire');
      this.pressedActions.add('fire');
    };

    this.onMouseUp = (event) => {
      if (event.button !== 0) return;
      this.downActions.delete('fire');
    };

    this.onMouseMove = (event) => {
      if (!this.locked) return;
      this.lookDeltaX += event.movementX;
      this.lookDeltaY += event.movementY;
    };

    this.onWheel = (event) => {
      this.wheelDirection += Math.sign(event.deltaY);
    };

    this.onPointerLockChange = () => {
      if (this.locked) return;
      this.downActions.clear();
      this.lookDeltaX = 0;
      this.lookDeltaY = 0;
    };

    this.listeners = [
      [window, 'keydown', this.onKeyDown],
      [window, 'keyup', this.onKeyUp],
      [window, 'mousedown', this.onMouseDown],
      [window, 'mouseup', this.onMouseUp],
      [document, 'mousemove', this.onMouseMove],
      [canvas, 'wheel', this.onWheel],
      [document, 'pointerlockchange', this.onPointerLockChange]
    ];

    for (const [target, type, handler] of this.listeners) {
      target.addEventListener(type, handler, type === 'wheel' ? { passive: true } : undefined);
    }
  }

  requestLock() {
    // The only defensive block in the project: `unadjustedMovement` is not
    // universally supported and a browser may reject it as a promise, throw
    // synchronously, or ignore the argument and return undefined.
    let result;
    try {
      result = this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      this.canvas.requestPointerLock();
      return;
    }

    if (result === undefined) {
      this.canvas.requestPointerLock();
      return;
    }

    result.catch(() => this.canvas.requestPointerLock());
  }

  releaseLock() {
    document.exitPointerLock();
  }

  /** @returns {boolean} */
  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  /** Accumulated mouse movement since the last call, in CSS pixels. */
  consumeLookDelta(target) {
    target.set(this.lookDeltaX, this.lookDeltaY);
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return target;
  }

  /** @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'crouch'|'fire'|'reload'|'scoreboard'} action */
  isDown(action) {
    return this.downActions.has(action);
  }

  /** True only on the frame the action went down. */
  wasPressed(action) {
    return this.pressedActions.has(action);
  }

  /** Weapon slot requested this frame via number keys, or null. */
  consumeWeaponSlot() {
    const slot = this.weaponSlotRequest;
    this.weaponSlotRequest = null;
    return slot;
  }

  /** Accumulated wheel direction this frame: -1, 0 or 1. */
  consumeWheel() {
    const direction = Math.sign(this.wheelDirection);
    this.wheelDirection = 0;
    return direction;
  }

  endFrame() {
    this.pressedActions.clear();
    this.weaponSlotRequest = null;
    this.wheelDirection = 0;
  }

  dispose() {
    for (const [target, type, handler] of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners.length = 0;
  }
}
