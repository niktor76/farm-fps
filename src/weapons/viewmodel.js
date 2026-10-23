/**
 * First person weapon model held in front of the camera, with walk bob, sway
 * and recoil. Without it the screen is empty and the game does not read as a
 * first person shooter (DEC-18).
 *
 * Owned by PH-5-weapons.
 */
export class ViewModel {
  /**
   * @param {import('three').PerspectiveCamera} camera
   * @param {ReturnType<import('../world/materials.js').createMaterialLibrary>} materials
   */
  constructor(camera, materials) {
    throw new Error('not implemented: PH-5-weapons');
  }

  setWeapon(weaponId) {
    throw new Error('not implemented: PH-5-weapons');
  }

  update(deltaSeconds, fighter) {
    throw new Error('not implemented: PH-5-weapons');
  }

  playFire() {
    throw new Error('not implemented: PH-5-weapons');
  }

  playReload(durationSeconds) {
    throw new Error('not implemented: PH-5-weapons');
  }

  playMelee(durationSeconds) {
    throw new Error('not implemented: PH-5-weapons');
  }
}
