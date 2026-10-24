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
  minimumFieldOfView: 70,
  maximumFieldOfView: 105,
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
    weaponDamage: {
      pistol: 18,
      revolver: 38,
      rifle: 14,
      shotgun: 11,
      sniper: 100,
      karambit: 35,
      pitchfork: 55
    },
    weaponRoundsPerMinute: { pistol: 350, revolver: 180, rifle: 700, shotgun: 80, sniper: 40 }
  },
  balanced: {
    label: 'Balanced',
    walkSpeed: 3.2,
    sprintSpeed: 6.0,
    crouchSpeed: 2.5,
    jumpPeakHeight: 0.9,
    gravity: 18,
    headshotMultiplier: 3.0,
    weaponDamage: {
      pistol: 26,
      revolver: 50,
      rifle: 24,
      shotgun: 15,
      sniper: 100,
      karambit: 45,
      pitchfork: 70
    },
    weaponRoundsPerMinute: { pistol: 350, revolver: 180, rifle: 700, shotgun: 80, sniper: 40 }
  },
  tactical: {
    label: 'Tactical',
    walkSpeed: 2.5,
    sprintSpeed: 4.8,
    crouchSpeed: 1.7,
    jumpPeakHeight: 0.75,
    gravity: 16,
    headshotMultiplier: 4.0,
    weaponDamage: {
      pistol: 35,
      revolver: 60,
      rifle: 36,
      shotgun: 20,
      sniper: 120,
      karambit: 55,
      pitchfork: 90
    },
    weaponRoundsPerMinute: { pistol: 300, revolver: 180, rifle: 600, shotgun: 80, sniper: 40 }
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

export const WEAPON_ORDER = [
  'pistol',
  'revolver',
  'rifle',
  'shotgun',
  'sniper',
  'karambit',
  'pitchfork',
  'seedbag'
];

/**
 * Properties that do not change between feel presets. Damage, fire rate and
 * headshot multiplier live in FEEL_PRESETS and are merged in by resolveWeapons.
 */
const WEAPON_BASE = {
  pistol: {
    label: 'Pistol',
    kind: 'gun',
    fireMode: 'semi',
    bodyDamageMultiplier: 0.9,
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
  revolver: {
    label: 'Revolver',
    kind: 'gun',
    fireMode: 'semi',
    magazineSize: 6,
    reloadSeconds: 2.5,
    pelletCount: 1,
    baseSpread: 0.0046,
    spreadPerShot: 0.009,
    maximumSpread: 0.055,
    spreadRecoveryPerSecond: 0.07,
    recoilVertical: 0.075,
    recoilHorizontal: 0.014,
    maximumRange: 90,
    falloffStart: 45,
    falloffEnd: 80,
    falloffFloor: 0.55
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
  sniper: {
    label: 'Sniper',
    kind: 'gun',
    fireMode: 'semi',
    magazineSize: 5,
    reloadSeconds: 3.5,
    pelletCount: 1,
    baseSpread: 0.14,
    spreadPerShot: 0.02,
    maximumSpread: 0.2,
    spreadRecoveryPerSecond: 0.25,
    recoilVertical: 0.11,
    recoilHorizontal: 0.01,
    headshotMultiplier: 1.5,
    maximumRange: 200
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
  },
  seedbag: {
    label: 'Seed Bag',
    kind: 'tool',
    fireMode: 'semi',
    magazineSize: 4,
    reloadSeconds: 3,
    cooldownSeconds: 0.8
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

    // A tool deals no damage and has no rate of fire, so no preset applies.
    if (base.kind === 'tool') return { id, ...base };

    const roundsPerMinute = feel.weaponRoundsPerMinute[id];
    return {
      id,
      ...base,
      damage,
      roundsPerMinute,
      cooldownSeconds: 60 / roundsPerMinute,
      headshotMultiplier: base.headshotMultiplier ?? feel.headshotMultiplier
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

/**
 * Sprint endurance. Stamina is held in seconds of remaining sprint, so the
 * drain rate is 1 and the budget reads directly as the eleven seconds asked for.
 */
export const STAMINA = {
  maximumSeconds: 11,
  drainPerSecond: 1,
  regenerationPerSecond: 0.55,
  regenerationDelaySeconds: 1.2,
  minimumSecondsToStartSprint: 3.5
};

/**
 * Accuracy penalty for firing while moving. The cone grows with horizontal
 * speed, so walking costs little and sprinting costs a lot; crouching cuts it.
 */
export const MOVEMENT_ACCURACY = {
  forgivenSpeed: 1.2,
  maximumAddedSpread: 0.055,
  airborneAddedSpread: 0.07,
  crouchMultiplier: 0.45,
  settleRatePerSecond: 3.5
};

/**
 * Standing crops tall enough to hide a crouched fighter. Concealment only
 * breaks line of sight; bullets pass through, and someone standing is visible.
 */
export const CONCEALMENT = {
  cropHeight: 1.35,
  crouchAmountToConceal: 0.75,
  revealDistance: 3.5,
  patchCount: 7,
  minimumPatchExtent: 7,
  maximumPatchExtent: 13
};

/**
 * The seed bag. Patches are a fixed extent so every planting reuses an
 * identically sized block of the wheat mesh's spare instances, and the oldest
 * patch is recycled once the cap is reached rather than growing the mesh.
 */
export const SEED = {
  plantRange: 6,
  patchExtent: 4,
  growSeconds: 5,
  minimumGapFromPatch: 1,
  maximumLivePatches: 12
};

/**
 * The hot air balloon. It runs on a timer rather than on controls, so the
 * figures below are the whole of its behaviour. riseHeight over riseSeconds
 * must stay well under WORLD.stepHeight per fixed step or the basket climbs
 * out from under its rider; the constructor asserts it.
 */
export const BALLOON = {
  basketExtent: 1.8,
  floorThickness: 0.4,
  basketHeight: 1.0,
  envelopeRadius: 2.6,
  clearanceExtent: 7,
  riseHeight: 12,
  riseSeconds: 8,
  hoverSeconds: 20,
  descendSeconds: 8,
  readySeconds: 5
};

/** Selectable lighting conditions. Night stays playable rather than realistic. */
export const DAY_CYCLES = {
  morning: {
    label: 'Morning',
    skyColor: 0xbcd9ee,
    fogColor: 0xc3dcee,
    fogNear: 70,
    fogFar: 190,
    sunColor: 0xffe9cc,
    sunIntensity: 2.4,
    sunElevationDegrees: 24,
    sunAzimuthDegrees: 110,
    skyLightColor: 0xcfe2f2,
    groundLightColor: 0x5c4a28,
    ambientIntensity: 1.2
  },
  noon: {
    label: 'Midday',
    skyColor: 0x9fc9e8,
    fogColor: 0xa8cfe8,
    fogNear: 85,
    fogFar: 220,
    sunColor: 0xfffaf0,
    sunIntensity: 3.2,
    sunElevationDegrees: 68,
    sunAzimuthDegrees: 40,
    skyLightColor: 0xbfd9ef,
    groundLightColor: 0x53411f,
    ambientIntensity: 1.15
  },
  evening: {
    label: 'Golden hour',
    skyColor: 0x9fc4e0,
    fogColor: 0xd9c3a6,
    fogNear: 62,
    fogFar: 178,
    sunColor: 0xfff2d8,
    sunIntensity: 3,
    sunElevationDegrees: 18,
    sunAzimuthDegrees: 300,
    skyLightColor: 0xbfd9ef,
    groundLightColor: 0x53411f,
    ambientIntensity: 1.1
  },
  night: {
    label: 'Night',
    skyColor: 0x121c2c,
    fogColor: 0x16202f,
    fogNear: 35,
    fogFar: 120,
    sunColor: 0xaec4e8,
    sunIntensity: 0.85,
    sunElevationDegrees: 42,
    sunAzimuthDegrees: 215,
    skyLightColor: 0x3d4f6b,
    groundLightColor: 0x171c22,
    ambientIntensity: 0.9
  }
};

export const DEFAULT_DAY_CYCLE = 'evening';

/**
 * Rebindable actions. The order is the order the settings panel lists them in,
 * and the codes are KeyboardEvent.code values so the layout does not matter.
 */
export const BINDABLE_ACTIONS = [
  { action: 'forward', label: 'Move forward' },
  { action: 'back', label: 'Move back' },
  { action: 'left', label: 'Strafe left' },
  { action: 'right', label: 'Strafe right' },
  { action: 'jump', label: 'Jump' },
  { action: 'sprint', label: 'Sprint' },
  { action: 'crouch', label: 'Crouch' },
  { action: 'fire', label: 'Fire' },
  { action: 'aim', label: 'Aim' },
  { action: 'reload', label: 'Reload' },
  { action: 'turnLeft', label: 'Turn left' },
  { action: 'turnRight', label: 'Turn right' },
  { action: 'lookUp', label: 'Look up' },
  { action: 'lookDown', label: 'Look down' },
  { action: 'scoreboard', label: 'Scoreboard' }
];

/** Each action maps to a list of key codes, so an action can have alternatives. */
export const DEFAULT_KEY_BINDINGS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
  fire: [],
  aim: [],
  reload: ['KeyR'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  scoreboard: ['Tab']
};

// Digit1..Digit9 are the only number-row KeyboardEvent.code values, so a
// tenth weapon needs a different selection scheme rather than a tenth key.
if (WEAPON_ORDER.length > 9) throw new Error('more weapons than number-row keys');

export const WEAPON_SLOT_KEY_CODES = WEAPON_ORDER.map(
  (_, index) => `Digit${index + 1}`
);

/**
 * Aiming down the sights. Holding aim trades mobility for a tighter cone and a
 * narrower field of view. Melee weapons cannot aim.
 */
export const AIM = {
  movementSpreadMultiplier: 0.55,
  sprintCancelsAim: true
};

/**
 * What each weapon aims through. Magnification, sight type and handling cost
 * follow the real optic the weapon would carry, so a revolver's pistol scope
 * behaves nothing like a bolt-action rifle's telescopic sight.
 *
 */
export const OPTICS = {
  pistol: {
    sight: 'iron',
    magnification: 1.15,
    scopeInSeconds: 0.22,
    movementSpeedMultiplier: 0.6,
    spreadMultiplier: 0.3,
    drawsScopeOverlay: false
  },
  revolver: {
    sight: 'pistolScope',
    magnification: 2,
    scopeInSeconds: 0.3,
    movementSpeedMultiplier: 0.85,
    spreadMultiplier: 0.3,
    drawsScopeOverlay: false
  },
  rifle: {
    sight: 'opticalSight',
    magnification: 1.6,
    scopeInSeconds: 0.25,
    movementSpeedMultiplier: 0.55,
    spreadMultiplier: 0.3,
    drawsScopeOverlay: false
  },
  shotgun: {
    sight: 'bead',
    magnification: 1.1,
    scopeInSeconds: 0.2,
    movementSpeedMultiplier: 0.7,
    spreadMultiplier: 0.75,
    drawsScopeOverlay: false
  },
  sniper: {
    sight: 'telescopic',
    magnification: 6,
    scopeInSeconds: 0.7,
    movementSpeedMultiplier: 0.4,
    spreadMultiplier: 0.02,
    drawsScopeOverlay: true
  }
};

/**
 * Field of view through an optic of the given magnification.
 *
 * Magnification scales the linear width of the view plane, not the angle, so
 * the conversion runs through the tangent. Dividing the angle directly is the
 * common mistake and over-zooms: a 6x scope is 14.6 degrees, not 12.5.
 */
export function scopedFieldOfView(magnification) {
  const halfBase = (CAMERA.fieldOfView * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(halfBase) / magnification) * 180) / Math.PI;
}

/**
 * Health regeneration. Nothing happens for delaySeconds after the last hit,
 * then health returns in steps rather than continuously, so a fighter who
 * breaks contact recovers on a predictable clock.
 */
export const REGENERATION = {
  delaySeconds: 6,
  intervalSeconds: 2,
  fractionOfMaximum: 0.03
};
