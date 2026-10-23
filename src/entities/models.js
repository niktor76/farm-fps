/**
 * Low-poly fighter mesh and floating nametag.
 *
 * Nametags are Sprites rather than CSS overlays (DEC-16) so a name is hidden
 * by the depth buffer when its bot ducks behind cover.
 *
 * Owned by PH-2-player.
 *
 * @param {number} color
 * @returns {{
 *   group: import('three').Group,
 *   update: (fighter: import('./fighter.js').Fighter, deltaSeconds: number) => void,
 *   dispose: () => void
 * }}
 */
export function createFighterModel(color) {
  throw new Error('not implemented: PH-2-player');
}

/** @returns {import('three').Sprite} */
export function createNametag(name, color) {
  throw new Error('not implemented: PH-2-player');
}

/** Moves the tag above the fighter and scales it so it stays legible at range. */
export function updateNametag(sprite, fighter, camera) {
  throw new Error('not implemented: PH-2-player');
}
