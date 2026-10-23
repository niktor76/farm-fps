/**
 * AI fighter.
 *
 * Behaviour is a state machine (roam, chase, attack, takeCover, reload, dead)
 * re-evaluated at SIMULATION.botThinkHertz, with movement steered every physics
 * step. Aim follows the model Counter-Strike ships in botprofile.db (DEC-14):
 * a reaction delay before the first shot, an aim-error cone that shrinks while
 * the target stays visible, and a periodic re-aim interval.
 *
 * Owned by PH-8-bot-ai.
 */
export class Bot {
  /**
   * @param {{
   *   id: number, name: string, color: number,
   *   feelKey: string, difficultyKey: string,
   *   random: import('../core/rng.js').Random
   * }} options
   */
  constructor(options) {
    throw new Error('not implemented: PH-8-bot-ai');
  }

  /**
   * Low frequency decision pass: target selection, state transitions,
   * destination choice.
   *
   * @param {{
   *   collisionWorld: import('../world/collision.js').CollisionWorld,
   *   waypoints: import('../world/waypoints.js').WaypointGraph,
   *   fighters: import('./fighter.js').Fighter[],
   *   elapsed: number
   * }} context
   */
  think(context) {
    throw new Error('not implemented: PH-8-bot-ai');
  }

  /** Per physics step: steering, aiming, trigger discipline. */
  update(deltaSeconds, context) {
    throw new Error('not implemented: PH-8-bot-ai');
  }
}
