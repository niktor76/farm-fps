/**
 * One match: owns the scene, the fighters, the fixed-timestep loop, the match
 * timer, scoring, the kill feed and respawning.
 *
 * Owned by PH-9-match, with M1 and M2 integration passes filling it in stages.
 */
export class Game {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   uiRoot: HTMLElement,
   *   settings: import('./ui/menu.js').MatchSettings,
   *   audio: import('./audio/audio.js').AudioEngine,
   *   onMatchEnd: (fighters: import('./entities/fighter.js').Fighter[]) => void
   * }} options
   */
  constructor(options) {
    throw new Error('not implemented: PH-9-match');
  }

  start() {
    throw new Error('not implemented: PH-9-match');
  }

  stop() {
    throw new Error('not implemented: PH-9-match');
  }

  dispose() {
    throw new Error('not implemented: PH-9-match');
  }
}
