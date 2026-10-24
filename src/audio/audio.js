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

import { AUDIO, DEFAULT_FEEL, resolveWeapons } from '../config/tunables.js';
import {
  createNoiseBuffer,
  createImpulseResponse,
  playGunshot,
  playWhoosh,
  playBlip,
  playFootstep
} from './synth.js';

/**
 * One recipe per sound name. `reverb` is how much of the voice is fed to the
 * convolver send; interface feedback stays dry so it reads as being in the
 * player's head rather than out on the farm.
 */
const SOUND_RECIPES = {
  pistol: { kind: 'gunshot', reverb: 0.9, sharpness: 0.7, body: 0.55, duration: 0.45, gain: 0.5 },
  revolver: { kind: 'gunshot', reverb: 1.05, sharpness: 0.5, body: 0.95, duration: 0.62, gain: 0.74 },
  rifle: { kind: 'gunshot', reverb: 0.9, sharpness: 1.0, body: 0.4, duration: 0.32, gain: 0.55 },
  sniper: { kind: 'gunshot', reverb: 1.25, sharpness: 1.0, body: 0.8, duration: 0.95, gain: 0.9 },
  shotgun: { kind: 'gunshot', reverb: 1.0, sharpness: 0.35, body: 1.0, duration: 0.8, gain: 0.7 },
  melee: {
    kind: 'whoosh',
    reverb: 0.3,
    startFrequency: 500,
    endFrequency: 5000,
    duration: 0.22,
    gain: 0.45
  },
  reload: { kind: 'noise', reverb: 0.2, frequency: 1500, duration: 0.12, gain: 0.35 },
  shell: {
    kind: 'blip',
    reverb: 0.4,
    waveform: 'triangle',
    frequency: 2600,
    endFrequency: 1500,
    duration: 0.14,
    gain: 0.18
  },
  footstep: { kind: 'noise', reverb: 0.25, frequency: 420, duration: 0.12, gain: 0.3 },
  seedbag: { kind: 'noise', reverb: 0.3, frequency: 900, duration: 0.3, gain: 0.32 },
  hit: {
    kind: 'blip',
    reverb: 0,
    waveform: 'square',
    frequency: 240,
    endFrequency: 90,
    duration: 0.18,
    gain: 0.3
  },
  hitmarker: {
    kind: 'blip',
    reverb: 0,
    waveform: 'square',
    frequency: 1150,
    endFrequency: 880,
    duration: 0.06,
    gain: 0.25
  },
  death: {
    kind: 'blip',
    reverb: 0,
    waveform: 'square',
    frequency: 1600,
    endFrequency: 2500,
    duration: 0.2,
    gain: 0.3
  },
  empty: { kind: 'noise', reverb: 0.1, frequency: 2400, duration: 0.045, gain: 0.3 },
  spawn: {
    kind: 'blip',
    reverb: 0.2,
    waveform: 'sine',
    frequency: 440,
    endFrequency: 880,
    duration: 0.3,
    gain: 0.3
  }
};

const REFERENCE_DISTANCE = 5;
const NEAR_CUTOFF_HERTZ = 18000;
const FAR_CUTOFF_HERTZ = 600;
const MAXIMUM_PAN = 0.85;
const REVERB_SECONDS = 2.4;
const REVERB_DECAY = 3.2;
const REVERB_RETURN_GAIN = 0.16;
const NOISE_BUFFER_SECONDS = 2;
const STEAL_FADE_SECONDS = 0.015;

/** Inverse-distance falloff, windowed so the sound reaches exact silence at the hearing limit. */
function distanceAttenuation(distance) {
  const inverse = REFERENCE_DISTANCE / Math.max(REFERENCE_DISTANCE, distance);
  return inverse * (1 - distance / AUDIO.maximumHearingDistance);
}

/** Air absorption: far gunfire is duller, which sells distance more cheaply than volume alone. */
function distanceCutoff(distance) {
  const progress = distance / AUDIO.maximumHearingDistance;
  return NEAR_CUTOFF_HERTZ * Math.pow(FAR_CUTOFF_HERTZ / NEAR_CUTOFF_HERTZ, progress);
}

/** Projects the offset onto the listener's right vector; yaw 0 faces -Z, as in three.js. */
function stereoPan(offsetX, offsetZ, distance, yaw) {
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const projection = (offsetX * rightX + offsetZ * rightZ) / Math.max(distance, 0.001);
  return Math.max(-1, Math.min(1, projection)) * MAXIMUM_PAN;
}

/** @typedef {'pistol'|'rifle'|'shotgun'|'melee'|'reload'|'shell'|'footstep'|'hit'|'hitmarker'|'death'|'empty'|'spawn'} SoundName */
const NO_OPTIONS = Object.freeze({});

export class AudioEngine {
  constructor() {
    assertEveryGunHasASound();
    this.context = new AudioContext({ latencyHint: 'interactive' });

    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.compressor.connect(this.context.destination);

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = AUDIO.defaultVolume;
    this.masterGain.connect(this.compressor);

    this.convolver = this.context.createConvolver();
    this.convolver.buffer = createImpulseResponse(this.context, REVERB_SECONDS, REVERB_DECAY);

    this.reverbReturn = this.context.createGain();
    this.reverbReturn.gain.value = REVERB_RETURN_GAIN;
    this.convolver.connect(this.reverbReturn).connect(this.masterGain);

    this.noiseBuffer = createNoiseBuffer(this.context, NOISE_BUFFER_SECONDS);

    this.voicePools = new Map(Object.keys(SOUND_RECIPES).map((name) => [name, []]));
    this.listenerPosition = { x: 0, y: 0, z: 0 };
    this.listenerYaw = 0;
  }

  /** Must be called from a click or key handler. */
  resume() {
    if (this.context.state !== 'running') this.context.resume();
  }

  /** @param {number} volume 0..1 */
  setVolume(volume) {
    this.masterGain.gain.setTargetAtTime(volume, this.context.currentTime, 0.02);
  }

  /** Listener transform, used for distance attenuation and stereo panning. */
  setListener(position, yaw) {
    this.listenerPosition.x = position.x;
    this.listenerPosition.y = position.y;
    this.listenerPosition.z = position.z;
    this.listenerYaw = yaw;
  }

  /**
   * @param {SoundName} name
   * @param {{ position?: import('three').Vector3, pitchVariation?: number }} [options]
   */
  play(name, options = NO_OPTIONS) {
    // Nodes scheduled while suspended all fire together on resume; drop them instead.
    if (this.context.state !== 'running') return;

    const recipe = SOUND_RECIPES[name];
    if (!recipe) throw new Error(`unknown sound: ${name}`);

    const { position } = options;
    let attenuation = 1;
    let cutoff = 0;
    let pan = 0;

    if (position) {
      const offsetX = position.x - this.listenerPosition.x;
      const offsetY = position.y - this.listenerPosition.y;
      const offsetZ = position.z - this.listenerPosition.z;
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
      if (distance >= AUDIO.maximumHearingDistance) return;

      attenuation = distanceAttenuation(distance);
      cutoff = distanceCutoff(distance);
      pan = stereoPan(offsetX, offsetZ, distance, this.listenerYaw);
    }

    const bus = this.createBus(recipe.reverb, attenuation, cutoff, pan);
    const sources = this.emit(recipe, bus.input, options.pitchVariation ?? 1);
    this.trackVoice(name, sources, bus);
  }

  /**
   * Per-voice chain: gain for distance, lowpass for air absorption, panner for
   * direction, then a split into the dry master and the shared convolver.
   * A cutoff of 0 marks a sound with no position, which skips both filter and panner.
   */
  createBus(reverbAmount, attenuation, cutoff, pan) {
    const input = this.context.createGain();
    input.gain.value = attenuation;

    const send = this.context.createGain();
    send.gain.value = reverbAmount;
    send.connect(this.convolver);

    const nodes = [input, send];
    let tail = input;

    if (cutoff > 0) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;

      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;

      tail.connect(filter).connect(panner);
      nodes.push(filter, panner);
      tail = panner;
    }

    tail.connect(this.masterGain);
    tail.connect(send);

    return { input, nodes };
  }

  emit(recipe, destination, pitch) {
    if (recipe.kind === 'gunshot') {
      return playGunshot(this.context, destination, this.noiseBuffer, {
        sharpness: recipe.sharpness * pitch,
        body: recipe.body,
        duration: recipe.duration / pitch,
        gain: recipe.gain
      });
    }

    if (recipe.kind === 'whoosh') {
      return playWhoosh(this.context, destination, this.noiseBuffer, {
        startFrequency: recipe.startFrequency * pitch,
        endFrequency: recipe.endFrequency * pitch,
        duration: recipe.duration / pitch,
        gain: recipe.gain
      });
    }

    if (recipe.kind === 'blip') {
      return playBlip(this.context, destination, {
        waveform: recipe.waveform,
        frequency: recipe.frequency * pitch,
        endFrequency: recipe.endFrequency * pitch,
        duration: recipe.duration,
        gain: recipe.gain
      });
    }

    return playFootstep(this.context, destination, this.noiseBuffer, {
      frequency: recipe.frequency * pitch,
      duration: recipe.duration,
      gain: recipe.gain
    });
  }

  /**
   * Caps concurrent voices per sound name and steals the oldest on overflow,
   * so a ten-bot firefight cannot grow the graph without bound.
   */
  trackVoice(name, sources, bus) {
    const pool = this.voicePools.get(name);
    const voice = { sources, bus };
    pool.push(voice);

    let pending = sources.length;
    for (const source of sources) {
      source.onended = () => {
        pending -= 1;
        if (pending > 0) return;

        // A stolen voice is already off the pool, so its index is -1 by then.
        const index = pool.indexOf(voice);
        if (index !== -1) pool.splice(index, 1);
        releaseVoice(voice);
      };
    }

    while (pool.length > AUDIO.voicesPerSound) {
      this.stealVoice(pool.shift());
    }
  }

  /** Fades the stolen voice out over a few milliseconds; a bare stop() clicks. */
  stealVoice(voice) {
    const now = this.context.currentTime;
    const { gain } = voice.bus.input;

    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + STEAL_FADE_SECONDS);

    for (const source of voice.sources) source.stop(now + STEAL_FADE_SECONDS + 0.005);
  }
}

/** Orphans the voice's nodes so the graph does not keep growing across a match. */
function releaseVoice(voice) {
  for (const source of voice.sources) source.disconnect();
  for (const node of voice.bus.nodes) node.disconnect();
}

/**
 * A weapon with no recipe throws from `play`, which runs inside the fixed step
 * and would abort the frame. Worse, it only throws once the audio context is
 * running, so it is invisible anywhere audio is suspended. Fail at startup.
 */
function assertEveryGunHasASound() {
  const missing = resolveWeapons(DEFAULT_FEEL)
    .filter((weapon) => weapon.kind !== 'melee' && !SOUND_RECIPES[weapon.id])
    .map((weapon) => weapon.id);

  if (missing.length > 0) {
    throw new Error(`weapons with no sound recipe: ${missing.join(', ')}`);
  }
}
