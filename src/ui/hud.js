/**
 * In-match overlay: crosshair, health, ammunition, current weapon, match timer,
 * kill feed, hitmarker, damage flash and the respawn countdown.
 *
 * Owned by PH-4-ui-shell.
 */
export class Hud {
  /** @param {HTMLElement} root */
  constructor(root) {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  show() {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  hide() {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  /**
   * @param {{
   *   health: number, magazine: number, magazineSize: number,
   *   weaponLabel: string, reloading: boolean,
   *   secondsRemaining: number, kills: number,
   *   alive: boolean, respawnSecondsRemaining: number
   * }} state
   */
  update(state) {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  /** Crosshair tick confirming damage was dealt. */
  showHitmarker(isKill) {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  /** Red vignette pulse when the player takes damage. */
  showDamage(directionRadians) {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  /** @param {{ killerName: string, victimName: string, weaponLabel: string, involvesPlayer: boolean }} entry */
  addKillFeedEntry(entry) {
    throw new Error('not implemented: PH-4-ui-shell');
  }
}
