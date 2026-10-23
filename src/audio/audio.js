/**
 * Audio engine. Positional sounds are attenuated and panned by their offset
 * from the listener; a DynamicsCompressorNode on the master bus keeps
 * overlapping shots from clipping.
 *
 * The AudioContext starts suspended under browser autoplay policy and must be
 * resumed from a user gesture.
 *
 * Owned by PH-3-audio.
 */

/** @typedef {'pistol'|'rifle'|'shotgun'|'melee'|'reload'|'shell'|'footstep'|'hit'|'hitmarker'|'death'|'empty'|'spawn'} SoundName */
export class AudioEngine {
  constructor() {
    throw new Error('not implemented: PH-3-audio');
  }

  /** Must be called from a click or key handler. */
  resume() {
    throw new Error('not implemented: PH-3-audio');
  }

  /** @param {number} volume 0..1 */
  setVolume(volume) {
    throw new Error('not implemented: PH-3-audio');
  }

  /** Listener transform, used for distance attenuation and stereo panning. */
  setListener(position, yaw) {
    throw new Error('not implemented: PH-3-audio');
  }

  /**
   * @param {SoundName} name
   * @param {{ position?: import('three').Vector3, pitchVariation?: number }} [options]
   */
  play(name, options) {
    throw new Error('not implemented: PH-3-audio');
  }
}
