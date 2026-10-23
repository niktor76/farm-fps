/**
 * Single source of truth for every gameplay number.
 *
 * No other module may hardcode a gameplay constant. Values are derived from
 * published figures of shipped shooters (Counter-Strike, Valorant, Quake III,
 * Call of Duty, Halo) rather than chosen by feel; see
 * specs/farm-fps-implementation-plan.md for the sources behind each table.
 */

export const WORLD = {
  playHalfExtent: 40,
  visualHalfExtent: 60,
  fenceHeight: 1.6,
  stepHeight: 0.5,
  groundLevel: 0
};

export const FIGHTER = {
  maximumHealth: 100,
  radius: 0.4,
  standingHeight: 1.8,
  crouchingHeight: 1.2,
  standingEyeHeight: 1.7,
  crouchingEyeHeight: 1.1,
  headHeight: 0.3,
  groundAcceleration: 40,
  groundDeceleration: 50,
  airControlFactor: 0.25,
  crouchTransitionSpeed: 8
};

export const MATCH = {
  durationSeconds: 180,
  respawnDelaySeconds: 2,
  spawnPointCount: 16,
  minimumSpawnDistanceToEnemy: 18,
  minimumBotCount: 1,
  maximumBotCount: 10,
  defaultBotCount: 5
};

export const CAMERA = {
  fieldOfView: 75,
  nearPlane: 0.05,
  farPlane: 400,
  maximumPitch: (89 * Math.PI) / 180,
  defaultSensitivity: 0.0022,
  minimumSensitivity: 0.0004,
  maximumSensitivity: 0.0066
};

export const FEEL_PRESETS = {
  arcade: {
    label: 'Arcade',
    walkSpeed: 4.0,
    sprintSpeed: 7.0,
    crouchSpeed: 2.8,
    jumpPeakHeight: 1.1,
    gravity: 20,
    headshotMultiplier: 2.5,
    weaponDamage: { pistol: 18, rifle: 14, shotgun: 11, karambit: 35, pitchfork: 55 },
    weaponRoundsPerMinute: { pistol: 350, rifle: 700, shotgun: 80 }
  },
  balanced: {
    label: 'Balanced',
    walkSpeed: 3.2,
    sprintSpeed: 6.0,
    crouchSpeed: 2.5,
    jumpPeakHeight: 0.9,
    gravity: 18,
    headshotMultiplier: 3.0,
    weaponDamage: { pistol: 26, rifle: 24, shotgun: 15, karambit: 45, pitchfork: 70 },
    weaponRoundsPerMinute: { pistol: 350, rifle: 700, shotgun: 80 }
  },
  tactical: {
    label: 'Tactical',
    walkSpeed: 2.5,
    sprintSpeed: 4.8,
    crouchSpeed: 1.7,
    jumpPeakHeight: 0.75,
    gravity: 16,
    headshotMultiplier: 4.0,
    weaponDamage: { pistol: 35, rifle: 36, shotgun: 20, karambit: 55, pitchfork: 90 },
    weaponRoundsPerMinute: { pistol: 300, rifle: 600, shotgun: 80 }
  }
};

export const DEFAULT_FEEL = 'balanced';

export const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    reactionDelay: 0.55,
    initialAimErrorDegrees: 25,
    aimErrorDecayPerSecond: 0.35,
    reaimInterval: 1.2,
    movementSpeedFactor: 0.7,
    prediction: 'none',
    viewDistance: 55,
    fieldOfViewDegrees: 110,
    coverSeekChance: 0.2,
    burstRestMinimum: 0.35,
    burstRestMaximum: 0.9
  },
  medium: {
    label: 'Medium',
    reactionDelay: 0.35,
    initialAimErrorDegrees: 14,
    aimErrorDecayPerSecond: 0.8,
    reaimInterval: 0.8,
    movementSpeedFactor: 0.9,
    prediction: 'linear',
    viewDistance: 70,
    fieldOfViewDegrees: 130,
    coverSeekChance: 0.45,
    burstRestMinimum: 0.2,
    burstRestMaximum: 0.55
  },
  hard: {
    label: 'Hard',
    reactionDelay: 0.2,
    initialAimErrorDegrees: 7,
    aimErrorDecayPerSecond: 1.6,
    reaimInterval: 0.5,
    movementSpeedFactor: 1.0,
    prediction: 'leading',
    viewDistance: 85,
    fieldOfViewDegrees: 150,
    coverSeekChance: 0.7,
    burstRestMinimum: 0.1,
    burstRestMaximum: 0.3
  }
};

export const DEFAULT_DIFFICULTY = 'medium';

export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun', 'karambit', 'pitchfork'];

/**
 * Properties that do not change between feel presets. Damage, fire rate and
 * headshot multiplier live in FEEL_PRESETS and are merged in by resolveWeapons.
 */
const WEAPON_BASE = {
  pistol: {
    label: 'Pistol',
    kind: 'gun',
    fireMode: 'semi',
    magazineSize: 12,
    reloadSeconds: 1.8,
    pelletCount: 1,
    baseSpread: 0.0035,
    spreadPerShot: 0.0045,
    maximumSpread: 0.03,
    spreadRecoveryPerSecond: 0.05,
    recoilVertical: 0.02,
    recoilHorizontal: 0.006,
    maximumRange: 120,
    falloffStart: 25,
    falloffEnd: 60,
    falloffFloor: 0.75
  },
  rifle: {
    label: 'Rifle',
    kind: 'gun',
    fireMode: 'automatic',
    magazineSize: 30,
    reloadSeconds: 2.5,
    pelletCount: 1,
    baseSpread: 0.005,
    spreadPerShot: 0.0035,
    maximumSpread: 0.045,
    spreadRecoveryPerSecond: 0.08,
    recoilVertical: 0.012,
    recoilHorizontal: 0.005,
    maximumRange: 140,
    falloffStart: 15,
    falloffEnd: 40,
    falloffFloor: 0.7
  },
  shotgun: {
    label: 'Shotgun',
    kind: 'gun',
    fireMode: 'semi',
    magazineSize: 6,
    reloadSeconds: 0.6,
    shellByShellReload: true,
    pelletCount: 8,
    baseSpread: (6 * Math.PI) / 180,
    spreadPerShot: 0,
    maximumSpread: (6 * Math.PI) / 180,
    spreadRecoveryPerSecond: 0,
    recoilVertical: 0.05,
    recoilHorizontal: 0.012,
    maximumRange: 60,
    falloffStart: 6,
    falloffEnd: 22,
    falloffFloor: 0.25
  },
  karambit: {
    label: 'Karambit',
    kind: 'melee',
    reach: 1.5,
    swingSeconds: 0.4,
    swingArcRadians: 0.7
  },
  pitchfork: {
    label: 'Pitchfork',
    kind: 'melee',
    reach: 2.5,
    swingSeconds: 0.9,
    swingArcRadians: 0.5
  }
};

/**
 * Merges the feel preset into the weapon base table.
 * Returns one fully resolved definition per entry of WEAPON_ORDER.
 */
export function resolveWeapons(feelKey) {
  const feel = FEEL_PRESETS[feelKey];
  if (!feel) throw new Error(`unknown feel preset: ${feelKey}`);

  return WEAPON_ORDER.map((id) => {
    const base = WEAPON_BASE[id];
    const damage = feel.weaponDamage[id];

    if (base.kind === 'melee') {
      return { id, ...base, damage, cooldownSeconds: base.swingSeconds };
    }

    const roundsPerMinute = feel.weaponRoundsPerMinute[id];
    return {
      id,
      ...base,
      damage,
      roundsPerMinute,
      cooldownSeconds: 60 / roundsPerMinute,
      headshotMultiplier: feel.headshotMultiplier
    };
  });
}

/** Derives the launch velocity that reaches jumpPeakHeight under the preset gravity. */
export function jumpLaunchVelocity(feelKey) {
  const feel = FEEL_PRESETS[feelKey];
  if (!feel) throw new Error(`unknown feel preset: ${feelKey}`);
  return Math.sqrt(2 * feel.gravity * feel.jumpPeakHeight);
}

export const SIMULATION = {
  fixedStepSeconds: 1 / 60,
  maximumAccumulatedSeconds: 0.25,
  movementSubsteps: 5,
  botThinkHertz: 10
};

export const AUDIO = {
  defaultVolume: 0.7,
  maximumHearingDistance: 60,
  voicesPerSound: 6
};

/**
 * Look input, per pointing device.
 *
 * A trackpad and a mouse need different handling and the browser cannot tell
 * them apart under pointer lock, so the device is a player setting. The mouse
 * profile reuses the CAMERA sensitivity figures so both stay one value.
 *
 * `accelerationExponentFactor` feeds the in-engine curve
 * `|delta| + factor * |delta|^2`; the trackpad default is tuned so a brisk
 * full-width swipe across a MacBook trackpad turns about 150 degrees.
 */
export const INPUT = {
  defaultDeviceMode: 'mouse',
  sensitivitySliderSteps: 100,
  devices: {
    mouse: {
      label: 'Mouse',
      requestUnadjustedMovement: true,
      defaultSensitivity: CAMERA.defaultSensitivity,
      minimumSensitivity: CAMERA.minimumSensitivity,
      maximumSensitivity: CAMERA.maximumSensitivity,
      verticalMultiplier: 1,
      accelerationExponentFactor: 0,
      smoothingRatePerSecond: 0
    },
    trackpad: {
      label: 'Trackpad',
      requestUnadjustedMovement: false,
      defaultSensitivity: 0.0026,
      minimumSensitivity: 0.0005,
      maximumSensitivity: 0.0078,
      verticalMultiplier: 0.65,
      accelerationExponentFactor: 0.0055,
      smoothingRatePerSecond: 30
    }
  },
  keyboardLook: {
    yawDegreesPerSecond: 150,
    pitchDegreesPerSecond: 90,
    fastMultiplier: 1.5,
    minimumYawDegreesPerSecond: 60,
    maximumYawDegreesPerSecond: 300,
    stepDegreesPerSecond: 5
  }
};
