/**
 * Hitscan resolution against static boxes and fighter hit volumes (DEC-7, DEC-12).
 *
 * Owned by PH-5-weapons.
 */

/**
 * Traces one shot. For a shotgun this is called once per pellet.
 *
 * @param {{
 *   shooter: import('../entities/fighter.js').Fighter,
 *   origin: import('three').Vector3,
 *   direction: import('three').Vector3,
 *   weapon: object,
 *   collisionWorld: import('../world/collision.js').CollisionWorld,
 *   fighters: import('../entities/fighter.js').Fighter[]
 * }} shot
 * @returns {{
 *   target: import('../entities/fighter.js').Fighter | null,
 *   point: import('three').Vector3,
 *   distance: number,
 *   isHeadshot: boolean,
 *   damage: number
 * }}
 */
export function traceShot(shot) {
  throw new Error('not implemented: PH-5-weapons');
}

/**
 * Melee sweep in front of the attacker, limited by weapon.reach and
 * weapon.swingArcRadians, blocked by geometry in between.
 *
 * @returns {import('../entities/fighter.js').Fighter | null}
 */
export function traceMelee(attacker, weapon, fighters, collisionWorld) {
  throw new Error('not implemented: PH-5-weapons');
}

/** Applies the weapon's distance falloff curve. */
export function damageAtDistance(weapon, distance) {
  throw new Error('not implemented: PH-5-weapons');
}

/** Random direction inside a cone of the given half angle, around a forward axis. */
export function spreadDirection(forward, spreadRadians, random, target) {
  throw new Error('not implemented: PH-5-weapons');
}
