import { INPUT, DEFAULT_KEY_BINDINGS, WEAPON_SLOT_KEY_CODES } from './config/tunables.js';

/**
 * Keyboard and pointer input behind pointer lock.
 *
 * The device mode decides how a pointer delta is treated. Browsers cannot tell
 * a trackpad from a mouse under pointer lock, so the mode is a player setting
 * rather than a detection. Chrome refuses an automatic re-lock immediately
 * after the user presses Escape, so re-locking requires a fresh click.
 *
 * The key lookup is built from the player's bindings rather than being fixed,
 * so a rebound key takes effect on the live instance.
 *
 * Owned by PH-2-player, extended by PH-13-trackpad and PH-14-bindings.
 */

const WEAPON_SLOT_BY_KEY_CODE = Object.fromEntries(
  WEAPON_SLOT_KEY_CODES.map((keyCode, slot) => [keyCode, slot])
);

/**
 * Keys the browser acts on itself: scrolling the page or moving focus. Only
 * the ones actually bound are swallowed, so unbinding a key hands it back.
 */
const BROWSER_DEFAULT_KEY_CODES = [
  'Space',
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown'
];

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Record<string, string[]>} [bindings] action to key codes
   */
  constructor(canvas, bindings = DEFAULT_KEY_BINDINGS) {
    this.canvas = canvas;

    this.deviceMode = INPUT.defaultDeviceMode;
    this.deviceProfile = INPUT.devices[this.deviceMode];

    this.downActions = new Set();
    this.pressedActions = new Set();
    this.setBindings(bindings);
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.smoothedLookX = 0;
    this.smoothedLookY = 0;
    this.weaponSlotRequest = null;
    this.wheelDirection = 0;
    this.enabled = true;

    this.onKeyDown = (event) => {
      if (!this.enabled) return;
      if (this.swallowedKeyCodes.has(event.code)) event.preventDefault();
      if (event.repeat) return;

      const slot = WEAPON_SLOT_BY_KEY_CODE[event.code];
      if (slot !== undefined) this.weaponSlotRequest = slot;

      const action = this.actionByKeyCode[event.code];
      if (action === undefined) return;
      this.downActions.add(action);
      this.pressedActions.add(action);
    };

    this.onKeyUp = (event) => {
      const action = this.actionByKeyCode[event.code];
      if (action === undefined) return;
      this.downActions.delete(action);
    };

    this.onMouseDown = (event) => {
      if (event.button !== 0) return;
      // Not while unlocked: that click is the one re-acquiring pointer lock,
      // and it would otherwise fire a shot before the lock is even granted.
      if (!this.enabled || !this.locked) return;
      this.downActions.add('fire');
      this.pressedActions.add('fire');
    };

    this.onMouseUp = (event) => {
      if (event.button !== 0) return;
      this.downActions.delete('fire');
    };

    this.onMouseMove = (event) => {
      if (!this.locked) return;
      this.lookDeltaX += this.accelerate(event.movementX);
      this.lookDeltaY += this.accelerate(event.movementY);
    };

    this.onWheel = (event) => {
      this.wheelDirection += Math.sign(event.deltaY);
    };

    this.onPointerLockChange = () => {
      if (this.locked) return;
      this.downActions.clear();
      this.clearLookState();
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

  /**
   * Rebuilds the key lookup, and with it the set of keys whose browser default
   * is suppressed. Keys held under the old bindings are released.
   *
   * @param {Record<string, string[]>} bindings action to key codes
   */
  setBindings(bindings) {
    this.bindings = bindings;
    this.actionByKeyCode = {};

    for (const [action, keyCodes] of Object.entries(bindings)) {
      for (const keyCode of keyCodes) this.actionByKeyCode[keyCode] = action;
    }

    this.swallowedKeyCodes = new Set(
      BROWSER_DEFAULT_KEY_CODES.filter((keyCode) => keyCode in this.actionByKeyCode)
    );

    this.downActions.clear();
  }

  /** @param {'mouse'|'trackpad'} mode */
  setDeviceMode(mode) {
    const profile = INPUT.devices[mode];
    if (!profile) throw new Error(`unknown input device mode: ${mode}`);

    this.deviceMode = mode;
    this.deviceProfile = profile;
    this.clearLookState();
  }

  clearLookState() {
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.smoothedLookX = 0;
    this.smoothedLookY = 0;
  }

  /** In-engine acceleration curve, an identity pass when the factor is zero. */
  accelerate(delta) {
    const magnitude = Math.abs(delta);
    const factor = this.deviceProfile.accelerationExponentFactor;
    return Math.sign(delta) * (magnitude + factor * magnitude * magnitude);
  }

  /** Enabled only during a match, so menu and results screens keep their keys. */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.downActions.clear();
      this.pressedActions.clear();
      this.weaponSlotRequest = null;
      this.wheelDirection = 0;
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestLock() {
    // A trackpad needs the operating system acceleration kept: it is the
    // mechanism that turns a short physical swipe into a large view turn.
    if (!this.deviceProfile.requestUnadjustedMovement) {
      this.canvas.requestPointerLock();
      return;
    }

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

  /** @returns {boolean} */
  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  /**
   * Pointer movement since the last call, already shaped for the active device:
   * accelerated on arrival, exponentially smoothed here, vertical axis scaled.
   */
  consumeLookDelta(target, deltaSeconds) {
    const rate = this.deviceProfile.smoothingRatePerSecond;
    const blend = rate > 0 ? 1 - Math.exp(-rate * deltaSeconds) : 1;

    this.smoothedLookX += (this.lookDeltaX - this.smoothedLookX) * blend;
    this.smoothedLookY += (this.lookDeltaY - this.smoothedLookY) * blend;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    target.set(this.smoothedLookX, this.smoothedLookY * this.deviceProfile.verticalMultiplier);
    return target;
  }

  /** @param {'forward'|'back'|'left'|'right'|'jump'|'sprint'|'crouch'|'fire'|'reload'|'scoreboard'|'turnLeft'|'turnRight'|'lookUp'|'lookDown'} action */
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
