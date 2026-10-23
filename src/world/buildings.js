/**
 * Farm buildings. Barn and garage are enterable (DEC-3): they have doorways,
 * window openings and interior walls, and each wall segment is registered with
 * the collision world separately so a fighter can walk through the gaps.
 * House and sheds are solid volumes.
 *
 * Owned by PH-1-world.
 *
 * Each factory adds its own collision boxes and returns the visual group.
 *
 * @param {ReturnType<import('./materials.js').createMaterialLibrary>} materials
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @returns {import('three').Group}
 */
export function createBarn(materials, collisionWorld) {
  throw new Error('not implemented: PH-1-world');
}

export function createGarage(materials, collisionWorld) {
  throw new Error('not implemented: PH-1-world');
}

export function createFarmhouse(materials, collisionWorld) {
  throw new Error('not implemented: PH-1-world');
}

/** @param {{ position: [number, number], rotation: number, size: [number, number, number] }} options */
export function createShed(materials, collisionWorld, options) {
  throw new Error('not implemented: PH-1-world');
}
