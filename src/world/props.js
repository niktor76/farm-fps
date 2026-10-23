/**
 * Cover and scenery. Fence, crop rows and trees use InstancedMesh (DEC-15);
 * decorative items outside the fence register no collision.
 *
 * Owned by PH-1-world.
 *
 * @param {ReturnType<import('./materials.js').createMaterialLibrary>} materials
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @param {import('../core/rng.js').Random} random
 * @returns {import('three').Object3D}
 */
export function createFence(materials, collisionWorld) {
  throw new Error('not implemented: PH-1-world');
}

export function createHayBales(materials, collisionWorld, random) {
  throw new Error('not implemented: PH-1-world');
}

export function createTractor(materials, collisionWorld) {
  throw new Error('not implemented: PH-1-world');
}

/** Decorative only; crop rows do not block movement or sight. */
export function createCropRows(materials, random) {
  throw new Error('not implemented: PH-1-world');
}

export function createTrees(materials, collisionWorld, random) {
  throw new Error('not implemented: PH-1-world');
}

/** Everything between the fence and the visual extent: fields, treeline, hills. */
export function createOuterScenery(materials, random) {
  throw new Error('not implemented: PH-1-world');
}
