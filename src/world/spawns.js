/**
 * Spawn point generation and selection.
 *
 * Owned by PH-6-effects.
 *
 * generateSpawnPoints lays out MATCH.spawnPointCount positions that are clear
 * of geometry and spread across the play area.
 *
 * chooseSpawnPoint picks the candidate furthest from living enemies, honouring
 * MATCH.minimumSpawnDistanceToEnemy where possible.
 *
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @param {import('../core/rng.js').Random} random
 * @returns {import('three').Vector3[]}
 */
export function generateSpawnPoints(collisionWorld, random) {
  throw new Error('not implemented: PH-6-effects');
}

/**
 * @param {import('three').Vector3[]} spawnPoints
 * @param {import('../entities/fighter.js').Fighter[]} fighters
 * @param {import('../entities/fighter.js').Fighter} forFighter
 * @returns {{ position: import('three').Vector3, yaw: number }}
 */
export function chooseSpawnPoint(spawnPoints, fighters, forFighter, random) {
  throw new Error('not implemented: PH-6-effects');
}
