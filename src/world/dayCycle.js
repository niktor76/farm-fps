/**
 * The moving sun. DAY_CYCLES holds four hand-tuned hours; this walks between
 * them so a match can pass through the day instead of sitting in one lighting
 * condition. The four fixed choices stay selectable -- this is a fifth option,
 * not a replacement.
 *
 * Fog rolls on its own slow rhythm on top of the hour. Time of day already
 * moves the fog distances, but only as a side effect of the clock; an
 * independent drift is what lets visibility close in and open up again within
 * a single match, which is what changes how far you can fight.
 *
 * Everything downstream consumes the resolved shape this module produces --
 * colours as Color instances rather than hex numbers -- so a fixed hour and a
 * moving one are the same kind of thing to the lighting and the view model.
 */

import * as THREE from 'three';
import { DAY_CYCLES, DAY_CYCLE_MOTION } from '../config/tunables.js';

export const MOVING_CYCLE_KEY = 'moving';

/** Dawn to dark in the order the sun travels, wrapping back to morning. */
const CYCLE_ORDER = ['morning', 'noon', 'evening', 'night'];

const COLOR_FIELDS = ['skyColor', 'fogColor', 'sunColor', 'skyLightColor', 'groundLightColor'];
const NUMBER_FIELDS = [
  'fogNear',
  'fogFar',
  'sunIntensity',
  'sunElevationDegrees',
  'ambientIntensity'
];

const scratchColor = new THREE.Color();

export function isMovingCycle(dayCycleKey) {
  return dayCycleKey === MOVING_CYCLE_KEY;
}

function createResolvedCycle() {
  const cycle = { label: 'Moving', fogScale: 1 };
  for (const field of COLOR_FIELDS) cycle[field] = new THREE.Color();
  return cycle;
}

/**
 * Azimuth is a compass bearing, so 350 and 10 are twenty degrees apart rather
 * than three hundred and forty. Interpolating the raw numbers would swing the
 * sun the long way round the sky between two neighbouring hours.
 */
function lerpDegreesAround(from, to, t) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
}

function blendInto(target, from, to, t) {
  for (const field of COLOR_FIELDS) {
    target[field].setHex(from[field]).lerp(scratchColor.setHex(to[field]), t);
  }
  for (const field of NUMBER_FIELDS) {
    target[field] = THREE.MathUtils.lerp(from[field], to[field], t);
  }
  target.sunAzimuthDegrees = lerpDegreesAround(from.sunAzimuthDegrees, to.sunAzimuthDegrees, t);
  return target;
}

/** One of the four hand-tuned hours, in the shape the moving clock also produces. */
export function resolveFixedCycle(dayCycleKey) {
  const preset = DAY_CYCLES[dayCycleKey];
  if (!preset) throw new Error(`unknown day cycle: ${dayCycleKey}`);

  const cycle = blendInto(createResolvedCycle(), preset, preset, 0);
  cycle.label = preset.label;
  return cycle;
}

/**
 * Two waves of deliberately unrelated lengths, so the fog never settles into a
 * rhythm a player could time. The result scales the hour's own fog distances:
 * below one is thicker air, above one is a clearer spell.
 */
function fogScaleAt(seconds) {
  const slow = Math.sin((seconds / DAY_CYCLE_MOTION.fogSlowPeriodSeconds) * Math.PI * 2);
  const fast = Math.sin((seconds / DAY_CYCLE_MOTION.fogFastPeriodSeconds) * Math.PI * 2);
  const wave = (slow * 0.7 + fast * 0.3 + 1) / 2;
  return THREE.MathUtils.lerp(DAY_CYCLE_MOTION.fogThickest, DAY_CYCLE_MOTION.fogClearest, wave);
}

export class DayCycleClock {
  /** @param {number} startPhase 0 to 1 through the day; random keeps matches unalike. */
  constructor(startPhase) {
    this.phase = startPhase % 1;
    this.seconds = 0;
    this.cycle = createResolvedCycle();
    this.sample();
  }

  /** The preset this clock starts nearest, so the first build has somewhere to begin. */
  get nearestKey() {
    const scaled = this.phase * CYCLE_ORDER.length;
    return CYCLE_ORDER[Math.round(scaled) % CYCLE_ORDER.length];
  }

  advance(deltaSeconds) {
    this.seconds += deltaSeconds;
    this.phase = (this.phase + deltaSeconds / DAY_CYCLE_MOTION.fullDaySeconds) % 1;
    return this.sample();
  }

  sample() {
    const scaled = this.phase * CYCLE_ORDER.length;
    const index = Math.floor(scaled);
    const from = DAY_CYCLES[CYCLE_ORDER[index % CYCLE_ORDER.length]];
    const to = DAY_CYCLES[CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length]];

    blendInto(this.cycle, from, to, scaled - index);

    const fogScale = fogScaleAt(this.seconds);
    this.cycle.fogNear *= fogScale;
    this.cycle.fogFar *= fogScale;
    this.cycle.fogScale = fogScale;

    return this.cycle;
  }
}
