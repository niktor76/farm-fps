/**
 * Pooled visual effects: tracers, impact puffs, muzzle flashes. Pooled so the
 * frame loop never allocates (REQ-1).
 *
 * Owned by PH-6-effects.
 */
export class EffectSystem {
  /**
   * @param {import('three').Scene} scene
   * @param {ReturnType<import('../world/materials.js').createMaterialLibrary>} materials
   */
  constructor(scene, materials) {
    throw new Error('not implemented: PH-6-effects');
  }

  spawnTracer(from, to) {
    throw new Error('not implemented: PH-6-effects');
  }

  spawnImpact(point, normal) {
    throw new Error('not implemented: PH-6-effects');
  }

  spawnMuzzleFlash(position, direction) {
    throw new Error('not implemented: PH-6-effects');
  }

  spawnBloodHit(point) {
    throw new Error('not implemented: PH-6-effects');
  }

  update(deltaSeconds) {
    throw new Error('not implemented: PH-6-effects');
  }
}
