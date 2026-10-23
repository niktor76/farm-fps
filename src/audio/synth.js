/**
 * Procedural sound generators (REQ-3: nothing downloaded).
 *
 * Techniques follow published Web Audio references: a noise burst through a
 * gain envelope and a biquad filter for gunfire, a swept bandpass for melee
 * whooshes, an oscillator with an exponential decay for interface blips, and a
 * noise buffer shaped by an exponential decay as a ConvolverNode impulse.
 *
 * Owned by PH-3-audio.
 */

/** Shared white noise buffer; one AudioBufferSourceNode per playback reuses it. */
export function createNoiseBuffer(context, seconds) {
  throw new Error('not implemented: PH-3-audio');
}

/** Synthetic impulse response for the ConvolverNode. */
export function createImpulseResponse(context, seconds, decay) {
  throw new Error('not implemented: PH-3-audio');
}

/** @param {{ sharpness: number, body: number, duration: number, gain: number }} shape */
export function playGunshot(context, destination, noiseBuffer, shape) {
  throw new Error('not implemented: PH-3-audio');
}

export function playWhoosh(context, destination, noiseBuffer, options) {
  throw new Error('not implemented: PH-3-audio');
}

export function playBlip(context, destination, options) {
  throw new Error('not implemented: PH-3-audio');
}

export function playFootstep(context, destination, noiseBuffer, options) {
  throw new Error('not implemented: PH-3-audio');
}
