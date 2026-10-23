/**
 * End of match screen: winner, final table, play again.
 *
 * Owned by PH-10-scoreboard.
 */
export class Results {
  /**
   * @param {HTMLElement} root
   * @param {{ onPlayAgain: () => void, onMainMenu: () => void }} handlers
   */
  constructor(root, handlers) {
    throw new Error('not implemented: PH-10-scoreboard');
  }

  /** @param {import('../entities/fighter.js').Fighter[]} fighters */
  show(fighters, localFighterId) {
    throw new Error('not implemented: PH-10-scoreboard');
  }

  hide() {
    throw new Error('not implemented: PH-10-scoreboard');
  }
}
