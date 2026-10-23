/**
 * Start screen: play button, bot count slider, difficulty, feel preset, and
 * settings for mouse sensitivity and volume. Settings persist in localStorage.
 *
 * Owned by PH-4-ui-shell, completed by PH-11-menu.
 */
export class Menu {
  /**
   * @param {HTMLElement} root
   * @param {{ onPlay: (settings: MatchSettings) => void }} handlers
   */
  constructor(root, handlers) {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  show() {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  hide() {
    throw new Error('not implemented: PH-4-ui-shell');
  }

  /** @returns {MatchSettings} */
  getSettings() {
    throw new Error('not implemented: PH-4-ui-shell');
  }
}

/**
 * @typedef {{
 *   botCount: number,
 *   difficultyKey: 'easy'|'medium'|'hard',
 *   feelKey: 'arcade'|'balanced'|'tactical',
 *   sensitivity: number,
 *   volume: number,
 *   showNametags: boolean
 * }} MatchSettings
 */
