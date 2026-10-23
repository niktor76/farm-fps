/**
 * Weapon state machine shared by the player and bots: firing, cooldown,
 * reloading (including shell-by-shell for the shotgun), and switching.
 *
 * Owned by PH-5-weapons.
 */
export class WeaponSystem {
  /**
   * @param {{
   *   collisionWorld: import('../world/collision.js').CollisionWorld,
   *   fighters: import('../entities/fighter.js').Fighter[],
   *   effects: import('./effects.js').EffectSystem,
   *   audio: import('../audio/audio.js').AudioEngine,
   *   random: import('../core/rng.js').Random,
   *   onDamage: (target, amount, attacker, isHeadshot) => void,
   *   onKill: (victim, killer, weaponId) => void
   * }} options
   */
  constructor(options) {
    throw new Error('not implemented: PH-5-weapons');
  }

  /** Ticks cooldowns, reload timers and spread recovery for one fighter. */
  update(fighter, deltaSeconds) {
    throw new Error('not implemented: PH-5-weapons');
  }

  /**
   * Attempts to fire. Returns false when blocked by cooldown, reload or an
   * empty magazine. Triggers an automatic reload when the magazine runs dry.
   */
  tryFire(fighter, triggerHeld) {
    throw new Error('not implemented: PH-5-weapons');
  }

  tryReload(fighter) {
    throw new Error('not implemented: PH-5-weapons');
  }

  switchTo(fighter, weaponIndex) {
    throw new Error('not implemented: PH-5-weapons');
  }

  /** @param {number} direction -1 or 1, for the mouse wheel */
  cycle(fighter, direction) {
    throw new Error('not implemented: PH-5-weapons');
  }
}
