/**
 * Development overlay, toggled with the backtick key. Shows frame time, draw
 * calls, triangle count and bot states, and can draw the collision boxes and
 * waypoint graph as wireframes.
 *
 * Also exposes the bot difficulty numbers for live tuning, so a playtest can
 * retune without a rebuild (DEC-6).
 *
 * Owned by PH-11-menu.
 */
export class DebugPanel {
  /**
   * @param {HTMLElement} root
   * @param {{ stats: import('../core/debugStats.js').DebugStats }} context
   */
  constructor(root, context) {
    throw new Error('not implemented: PH-11-menu');
  }

  toggle() {
    throw new Error('not implemented: PH-11-menu');
  }

  update(context) {
    throw new Error('not implemented: PH-11-menu');
  }
}
