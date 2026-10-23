/**
 * Procedural sound generators (REQ-3: nothing downloaded).
 *
 * Techniques follow published Web Audio references: a noise burst through a
 * gain envelope and a biquad filter for gunfire, a swept bandpass for melee
 * whooshes, an oscillator with an exponential decay for interface blips, and a
 * noise buffer shaped by an exponential decay as a ConvolverNode impulse.
 *
 * Every generator is stateless, takes an explicit destination node, and returns
 * the scheduled source nodes so the engine can cap and steal voices.
 *
 * exponentialRampToValueAtTime refuses a target of zero, so every fade-out ends
 * at SILENCE rather than at 0.
 *
 * Owned by PH-3-audio.
 */

const SILENCE = 0.0001;

/** Playback never starts in the second half, leaving room for the longest one-shot. */
function randomBufferOffset(noiseBuffer) {
  return Math.random() * noiseBuffer.duration * 0.5;
}

/** Shared white noise buffer; one AudioBufferSourceNode per playback reuses it. */
export function createNoiseBuffer(context, seconds) {
  const sampleCount = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

/** Synthetic impulse response for the ConvolverNode. */
export function createImpulseResponse(context, seconds, decay) {
  const sampleCount = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, sampleCount, context.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);

    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / sampleCount;
      samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay);
    }
  }

  return buffer;
}

/** @param {{ sharpness: number, body: number, duration: number, gain: number }} shape */
export function playGunshot(context, destination, noiseBuffer, shape) {
  const now = context.currentTime;
  const { sharpness, body, duration, gain } = shape;

  // Muzzle crack: unfiltered noise at full gain for a few milliseconds.
  const crackSource = context.createBufferSource();
  crackSource.buffer = noiseBuffer;
  crackSource.playbackRate.value = 1 + sharpness;

  const crackEnvelope = context.createGain();
  crackEnvelope.gain.setValueAtTime(gain, now);
  crackEnvelope.gain.exponentialRampToValueAtTime(SILENCE, now + 0.012);

  crackSource.connect(crackEnvelope).connect(destination);
  crackSource.start(now, randomBufferOffset(noiseBuffer));
  crackSource.stop(now + 0.02);

  // Report body: noise with a 1 ms attack, a fast decay to a low sustain and a
  // long release, behind a lowpass that closes as the tail dies away.
  const bodySource = context.createBufferSource();
  bodySource.buffer = noiseBuffer;
  bodySource.playbackRate.value = 0.7 + sharpness * 0.6;

  const bodyFilter = context.createBiquadFilter();
  bodyFilter.type = 'lowpass';
  bodyFilter.Q.value = 0.8;
  bodyFilter.frequency.setValueAtTime(900 + sharpness * 5200, now);
  bodyFilter.frequency.exponentialRampToValueAtTime(220 + sharpness * 700, now + duration);

  const bodyEnvelope = context.createGain();
  bodyEnvelope.gain.setValueAtTime(SILENCE, now);
  bodyEnvelope.gain.linearRampToValueAtTime(gain, now + 0.001);
  bodyEnvelope.gain.exponentialRampToValueAtTime(gain * 0.22, now + 0.1);
  bodyEnvelope.gain.exponentialRampToValueAtTime(SILENCE, now + duration);

  bodySource.connect(bodyFilter).connect(bodyEnvelope).connect(destination);
  bodySource.start(now, randomBufferOffset(noiseBuffer));
  bodySource.stop(now + duration);

  // Chest thump: a low sine dropping in pitch, which is what carries weight.
  const thumpOscillator = context.createOscillator();
  thumpOscillator.type = 'sine';
  thumpOscillator.frequency.setValueAtTime(115 - body * 45, now);
  thumpOscillator.frequency.exponentialRampToValueAtTime(38, now + 0.14);

  const thumpEnvelope = context.createGain();
  thumpEnvelope.gain.setValueAtTime(gain * body, now);
  thumpEnvelope.gain.exponentialRampToValueAtTime(SILENCE, now + 0.12 + body * 0.12);

  thumpOscillator.connect(thumpEnvelope).connect(destination);
  thumpOscillator.start(now);
  thumpOscillator.stop(now + 0.3);

  return [crackSource, bodySource, thumpOscillator];
}

/** Bandpass sweeping upward over the swing; the blade passing the ear. */
export function playWhoosh(context, destination, noiseBuffer, options) {
  const now = context.currentTime;
  const { startFrequency, endFrequency, duration, gain } = options;

  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(startFrequency, now);
  filter.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(SILENCE, now);
  envelope.gain.linearRampToValueAtTime(gain, now + duration * 0.35);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, now + duration);

  source.connect(filter).connect(envelope).connect(destination);
  source.start(now, randomBufferOffset(noiseBuffer));
  source.stop(now + duration);

  return [source];
}

export function playBlip(context, destination, options) {
  const now = context.currentTime;
  const { waveform, frequency, endFrequency, duration, gain } = options;

  const oscillator = context.createOscillator();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, now + duration);

  oscillator.connect(envelope).connect(destination);
  oscillator.start(now);
  oscillator.stop(now + duration);

  return [oscillator];
}

/** Short bandpass noise burst, randomised so repeated steps do not match. */
export function playFootstep(context, destination, noiseBuffer, options) {
  const now = context.currentTime;
  const { frequency, duration, gain } = options;
  const variation = 1 + (Math.random() - 0.5) * 0.15;

  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.playbackRate.value = variation;

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.value = frequency * variation;

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(SILENCE, now);
  envelope.gain.linearRampToValueAtTime(gain * variation, now + 0.004);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, now + duration);

  source.connect(filter).connect(envelope).connect(destination);
  source.start(now, randomBufferOffset(noiseBuffer));
  source.stop(now + duration);

  return [source];
}
