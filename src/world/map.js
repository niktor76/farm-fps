/**
 * Assembles the whole farm and registers all collision geometry.
 *
 * Owned by PH-1-world.
 *
 * @param {{
 *   scene: import('three').Scene,
 *   collisionWorld: import('./collision.js').CollisionWorld,
 *   random: import('../core/rng.js').Random
 * }} context
 * @returns {{
 *   group: import('three').Group,
 *   materials: ReturnType<import('./materials.js').createMaterialLibrary>,
 *   lighting: ReturnType<import('./lighting.js').createLighting>,
 *   coverPoints: import('three').Vector3[]
 * }}
 */
export function buildFarm(context) {
  throw new Error('not implemented: PH-1-world');
}
