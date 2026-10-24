/**
 * First person weapon model held in front of the camera, with walk bob, sway
 * and recoil. Without it the screen is empty and the game does not read as a
 * first person shooter (DEC-18).
 *
 * The weapon lives in its own scene and is drawn by its own camera in a second
 * pass, after the world and after a depth clear. That is what keeps a wall from
 * cutting into the model, and it is also what stops an optic from magnifying
 * the gun: the view camera's field of view is a constant, so narrowing the main
 * camera for a 2x pistol scope or a 6x telescopic sight zooms the world without
 * touching the weapon. Materials are therefore ordinary opaque ones, sorted and
 * depth tested among themselves as usual.
 *
 * The view camera sits at the origin looking down -Z and never moves, so the
 * player's position and look angles feed only the pose offsets below.
 *
 * Owned by PH-5-weapons.
 */

import * as THREE from 'three';
import { DAY_CYCLES, OPTICS } from '../config/tunables.js';
import { mergeByMaterial } from '../world/materials.js';

const TWO_PI = Math.PI * 2;
const DEGREES_TO_HALF_RADIANS = Math.PI / 360;

/**
 * Fixed field of view for the weapon pass.
 *
 * Below the world's 75 so a 0.3 metre object 0.4 metres from the eye is less
 * foreshortened and the gun reads with some weight, but not as low as the 60
 * that shooters with a 90 degree world use: against our 75 that same ratio is
 * about 50, which would enlarge the weapon by a third at exactly the moment the
 * aim pose needs the middle of the screen clear.
 */
const VIEW_FIELD_OF_VIEW = 70;
const VIEW_NEAR_PLANE = 0.01;
const VIEW_FAR_PLANE = 5;

/**
 * The weapon sits a hand's length from the eye, so it catches less of the sun
 * than the world does. The ambient fill needs no such correction.
 */
const KEY_LIGHT_SCALE = 0.8;

const BOB_CYCLES_PER_METRE = 0.55;
const BOB_LATERAL_METRES = 0.022;
const BOB_VERTICAL_METRES = 0.016;
const BOB_ROLL_RADIANS = 0.03;
const BOB_SMOOTHING_PER_SECOND = 9;

const SWAY_POSITION_GAIN = 0.9;
const SWAY_POSITION_LIMIT = 0.05;
const SWAY_ROTATION_GAIN = 3.0;
const SWAY_SMOOTHING_PER_SECOND = 12;

const SPRINT_DROP_METRES = 0.1;
const SPRINT_PITCH_RADIANS = 0.35;
const SPRINT_YAW_RADIANS = 0.5;

const CROUCH_RAISE_METRES = 0.03;
const CROUCH_PITCH_RADIANS = -0.09;

const FIRE_KICK_SECONDS = 0.12;
const FIRE_KICK_BACK_METRES = 0.045;
const FIRE_KICK_UP_METRES = 0.012;
const FIRE_KICK_PITCH_RADIANS = 0.17;

const RELOAD_DIP_METRES = 0.22;
const RELOAD_DIP_PITCH_RADIANS = 0.9;
const RELOAD_DIP_ROLL_RADIANS = 0.35;

const MELEE_SWING_LATERAL_METRES = 0.3;
const MELEE_SWING_FORWARD_METRES = 0.2;
const MELEE_SWING_ROLL_RADIANS = 1.1;
const MELEE_SWING_YAW_RADIANS = 0.55;

const SCOPE_HIDE_FRACTION = 0.9;
const SCOPE_STEADY_FACTOR = 0.85;

/**
 * Hip pose and aim pose per weapon, in camera space. The aim entry is where the
 * group sits once the weapon is fully raised, and it is derived from the sight
 * the weapon actually carries (OPTICS in tunables), not from a shared offset:
 *
 * - the pistol, revolver, rifle and shotgun put the TOP of their sight on the
 *   crosshair, which is both how a sight picture works and what leaves the rest
 *   of the screen above the crosshair clear to see the target through;
 * - the sniper puts the SCOPE tube's axis there instead, because that optic is
 *   looked through rather than over, which is far higher again since the tube
 *   rides on rings above the receiver.
 *
 * So every aim Y is the negated sight height of that model's own geometry times
 * its scale, and moving a sight in a builder means moving the number here too.
 * Aim Z only comes closer to the eye for the two handguns; a long gun is already
 * at full extension, and pulling it in would push its butt through the eye.
 * Melee weapons cannot aim, so their aim entry is null.
 */
const WEAPON_POSES = {
  pistol: {
    rest: { position: [0.17, -0.17, -0.38], rotation: [0.02, -0.18, 0], scale: 1.5 },
    aim: { position: [0, -0.093, -0.33], rotation: [0, 0, 0] }
  },
  revolver: {
    rest: { position: [0.18, -0.18, -0.4], rotation: [0.02, -0.17, 0], scale: 1.25 },
    aim: { position: [0, -0.07, -0.33], rotation: [0, 0, 0] }
  },
  rifle: {
    rest: { position: [0.19, -0.2, -0.42], rotation: [0.02, -0.15, 0], scale: 1.15 },
    aim: { position: [0, -0.1, -0.42], rotation: [0, 0, 0] }
  },
  shotgun: {
    rest: { position: [0.19, -0.2, -0.42], rotation: [0.02, -0.15, 0], scale: 1.1 },
    aim: { position: [0, -0.062, -0.42], rotation: [0, 0, 0] }
  },
  sniper: {
    rest: { position: [0.2, -0.22, -0.44], rotation: [0.02, -0.14, 0], scale: 1.0 },
    aim: { position: [0, -0.105, -0.44], rotation: [0, 0, 0] }
  },
  karambit: {
    rest: { position: [0.21, -0.19, -0.34], rotation: [-0.15, -0.45, 0.35], scale: 1.7 },
    aim: null
  },
  pitchfork: {
    rest: { position: [0.22, -0.26, -0.4], rotation: [-0.04, -0.1, 0.1], scale: 0.8 },
    aim: null
  },
  seedbag: {
    rest: { position: [0.21, -0.25, -0.4], rotation: [0.06, -0.22, 0.1], scale: 1.0 },
    aim: null
  }
};

/**
 * Where a shot leaves each model, in the model's own unscaled geometry space —
 * the same coordinates the build functions below pass to `part`, so these read
 * straight off the frontmost barrel piece. The melee entries are effect origins
 * rather than muzzles: the karambit's outermost blade segment and the centre
 * tine of the pitchfork.
 *
 * `pitchX` tilts the anchor so its local -Z follows what the weapon points
 * along; only the karambit's blade leaves the bore axis.
 */
const MUZZLE_ANCHORS = {
  pistol: { position: [0, 0.005, -0.18], pitchX: 0 },
  revolver: { position: [0, 0.016, -0.295], pitchX: 0 },
  rifle: { position: [0, 0.012, -0.685], pitchX: 0 },
  shotgun: { position: [0, 0.024, -0.7], pitchX: 0 },
  sniper: { position: [0, 0.01, -1.0], pitchX: 0 },
  karambit: { position: [0, 0.0779, -0.1416], pitchX: 1.25 },
  pitchfork: { position: [0, 0, -1.12], pitchX: 0 },
  seedbag: { position: [0, 0.13, -0.15], pitchX: 0.5 }
};

export class ViewModel {
  /**
   * @param {import('three').PerspectiveCamera} camera
   * @param {ReturnType<import('../world/materials.js').createMaterialLibrary>} materials
   * @param {keyof typeof DAY_CYCLES} dayCycleKey
   */
  constructor(camera, materials, dayCycleKey) {
    this.camera = camera;

    this.scene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(
      VIEW_FIELD_OF_VIEW,
      camera.aspect,
      VIEW_NEAR_PLANE,
      VIEW_FAR_PLANE
    );
    this.scene.add(this.viewCamera);
    this.viewSpread = Math.tan(VIEW_FIELD_OF_VIEW * DEGREES_TO_HALF_RADIANS);

    this.keyLight = new THREE.DirectionalLight();
    this.keyLight.position.set(-0.6, 1, 0.8);
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.HemisphereLight();
    this.scene.add(this.fillLight);

    this.setDayCycle(dayCycleKey);

    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    this.scene.add(this.group);

    const viewMaterials = createViewMaterials(materials);
    const builders = {
      pistol: buildPistol,
      revolver: buildRevolver,
      rifle: buildRifle,
      shotgun: buildShotgun,
      sniper: buildSniper,
      karambit: buildKarambit,
      pitchfork: buildPitchfork,
      seedbag: buildSeedBag
    };

    this.models = new Map();
    this.muzzleAnchors = new Map();
    for (const weaponId of Object.keys(builders)) {
      const model = mergeByMaterial(builders[weaponId](viewMaterials), false, true);
      model.scale.setScalar(WEAPON_POSES[weaponId].rest.scale);
      model.visible = false;
      for (const mesh of model.children) mesh.frustumCulled = false;

      const anchorDefinition = MUZZLE_ANCHORS[weaponId];
      const anchor = new THREE.Object3D();
      anchor.position.fromArray(anchorDefinition.position);
      anchor.rotation.x = anchorDefinition.pitchX;
      model.add(anchor);
      this.muzzleAnchors.set(weaponId, anchor);

      this.group.add(model);
      this.models.set(weaponId, model);
    }

    this.activeModel = null;
    this.activeMuzzleAnchor = null;
    this.restPosition = WEAPON_POSES.pistol.rest.position;
    this.restRotation = WEAPON_POSES.pistol.rest.rotation;
    this.aimPosition = WEAPON_POSES.pistol.aim.position;
    this.aimRotation = WEAPON_POSES.pistol.aim.rotation;
    this.activeOptic = null;
    this.scopeRatePerSecond = 0;
    this.hidesModelAtFullScope = false;
    this.scopeFraction = 0;

    this.bobAmplitude = 0;
    this.swayLateral = 0;
    this.swayVertical = 0;
    this.previousYaw = 0;
    this.previousPitch = 0;

    this.firingTimer = 0;
    this.reloadTimer = 0;
    this.reloadDuration = 1;
    this.meleeTimer = 0;
    this.meleeDuration = 1;

    this.setWeapon('pistol');
  }

  /**
   * Relights the weapon scene for the selected cycle, so the gun in your hands
   * matches the sky it is held under instead of staying permanently daylit.
   */
  setDayCycle(dayCycleKey) {
    const cycle = DAY_CYCLES[dayCycleKey];
    if (!cycle) throw new Error(`unknown day cycle: ${dayCycleKey}`);

    this.keyLight.color.setHex(cycle.sunColor);
    this.keyLight.intensity = cycle.sunIntensity * KEY_LIGHT_SCALE;

    this.fillLight.color.setHex(cycle.skyLightColor);
    this.fillLight.groundColor.setHex(cycle.groundLightColor);
    this.fillLight.intensity = cycle.ambientIntensity;
  }

  setWeapon(weaponId) {
    if (this.activeModel) this.activeModel.visible = false;
    this.activeModel = this.models.get(weaponId);
    this.activeModel.visible = true;
    this.activeMuzzleAnchor = this.muzzleAnchors.get(weaponId);

    const pose = WEAPON_POSES[weaponId];
    this.restPosition = pose.rest.position;
    this.restRotation = pose.rest.rotation;
    this.aimPosition = pose.aim === null ? pose.rest.position : pose.aim.position;
    this.aimRotation = pose.aim === null ? pose.rest.rotation : pose.aim.rotation;

    this.activeOptic = pose.aim === null ? null : OPTICS[weaponId];
    this.scopeRatePerSecond = pose.aim === null ? 0 : 1 / OPTICS[weaponId].scopeInSeconds;
    this.hidesModelAtFullScope = pose.aim !== null && OPTICS[weaponId].drawsScopeOverlay;
    this.scopeFraction = 0;
  }

  hasMuzzleAnchor() {
    return this.activeMuzzleAnchor !== null;
  }

  /** The weapon pass. The caller owns clearing; this only draws. */
  render(renderer) {
    renderer.render(this.scene, this.viewCamera);
  }

  resize(aspect) {
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  /**
   * The optic the active weapon aims through, as the shared OPTICS entry, or
   * null for a melee weapon. The interface layer reads `sight`, `magnification`
   * and `drawsScopeOverlay` off it to decide which reticle or overlay to draw.
   */
  getActiveOptic() {
    return this.activeOptic;
  }

  /**
   * How far the weapon has come up, 0 at the hip and 1 fully sighted. Travel
   * takes the active weapon's own OPTICS.scopeInSeconds, so the interface layer
   * can fade a scope overlay in on the same curve the model moves on.
   */
  getScopeFraction() {
    return this.scopeFraction;
  }

  /**
   * World position of the active weapon's muzzle, carrying every offset
   * `update` applied: pose, bob, sway, crouch, sprint drop, fire kick, reload
   * dip and melee sweep.
   *
   * `updateWorldMatrix(true, false)` walks the group -> model -> anchor chain
   * and recomposes each local matrix from its current position/rotation, so the
   * result is this frame's transform rather than the one three.js last flushed
   * during render.
   *
   * The anchor lives in the weapon scene, whose camera sits at the origin, so
   * its position is already a camera space coordinate. Two steps turn it into a
   * world one a flash or a tracer can use: widen x and y from the weapon pass's
   * fixed field of view to the main camera's current one, so the point keeps
   * landing on the pixel the barrel tip is drawn at however far an optic has
   * zoomed the world in, then carry it through the main camera's transform.
   *
   * @param {import('three').Vector3} target
   */
  getMuzzleWorldPosition(target) {
    const anchor = this.activeMuzzleAnchor;
    anchor.updateWorldMatrix(true, false);
    this.camera.updateWorldMatrix(true, false);

    target.setFromMatrixPosition(anchor.matrixWorld);
    const spread = Math.tan(this.camera.fov * DEGREES_TO_HALF_RADIANS) / this.viewSpread;
    target.x *= spread;
    target.y *= spread;

    return target.applyMatrix4(this.camera.matrixWorld);
  }

  /**
   * The direction the active weapon points, in world space. Normalised because
   * the models carry a non-unit scale, then rotated out of weapon scene space
   * by the main camera's orientation.
   *
   * @param {import('three').Vector3} target
   */
  getMuzzleWorldDirection(target) {
    const anchor = this.activeMuzzleAnchor;
    anchor.updateWorldMatrix(true, false);
    this.camera.updateWorldMatrix(true, false);

    const elements = anchor.matrixWorld.elements;
    target.set(-elements[8], -elements[9], -elements[10]).normalize();
    return target.transformDirection(this.camera.matrixWorld);
  }

  update(deltaSeconds, fighter) {
    this.updateScopeFraction(deltaSeconds, fighter);

    const walkSpeed = fighter.feel.walkSpeed;
    const sprintSpeed = fighter.feel.sprintSpeed;
    const speed = fighter.horizontalSpeed;

    const grounded = fighter.alive && fighter.onGround;
    const target = grounded ? Math.min(1, speed / walkSpeed) : 0;
    const bobBlend = Math.min(1, deltaSeconds * BOB_SMOOTHING_PER_SECOND);
    this.bobAmplitude += (target - this.bobAmplitude) * bobBlend;

    // Bob and sway are damped as the weapon comes up, or the sight would wander
    // off the crosshair the aim pose just put it on.
    const steadiness = 1 - this.scopeFraction * SCOPE_STEADY_FACTOR;
    const bobWeight = this.bobAmplitude * steadiness;

    const phase = fighter.distanceTravelled * BOB_CYCLES_PER_METRE * TWO_PI;
    const bobLateral = Math.sin(phase) * BOB_LATERAL_METRES * bobWeight;
    const bobVertical = -Math.abs(Math.cos(phase)) * BOB_VERTICAL_METRES * bobWeight;
    const bobRoll = Math.sin(phase) * BOB_ROLL_RADIANS * bobWeight;

    this.updateSway(deltaSeconds, fighter);
    const swayLateral = this.swayLateral * steadiness;
    const swayVertical = this.swayVertical * steadiness;

    const sprintAmount = THREE.MathUtils.clamp(
      (speed - walkSpeed) / (sprintSpeed - walkSpeed),
      0,
      1
    );

    const scope = this.scopeFraction;
    const restPosition = this.restPosition;
    const restRotation = this.restRotation;
    const poseX = restPosition[0] + (this.aimPosition[0] - restPosition[0]) * scope;
    const poseY = restPosition[1] + (this.aimPosition[1] - restPosition[1]) * scope;
    const poseZ = restPosition[2] + (this.aimPosition[2] - restPosition[2]) * scope;
    const poseRotationX = restRotation[0] + (this.aimRotation[0] - restRotation[0]) * scope;
    const poseRotationY = restRotation[1] + (this.aimRotation[1] - restRotation[1]) * scope;
    const poseRotationZ = restRotation[2] + (this.aimRotation[2] - restRotation[2]) * scope;

    // The crouch raise and the sprint drop are hip carry flourishes: they say
    // something about how the weapon is being held, and they are meaningless
    // once it is up against the eye. Left at full strength they fought the aim
    // pose -- crouching lifted a sighted weapon 3 cm and tipped its muzzle 5
    // degrees down, which put the body over the crosshair rather than under it.
    const hipWeight = 1 - scope;
    const crouchAmount = fighter.crouchAmount * hipWeight;
    const sprintCarry = sprintAmount * hipWeight;

    let positionX = poseX + bobLateral + swayLateral;
    let positionY =
      poseY +
      bobVertical +
      swayVertical +
      crouchAmount * CROUCH_RAISE_METRES -
      sprintCarry * SPRINT_DROP_METRES;
    let positionZ = poseZ;

    let rotationX =
      poseRotationX +
      swayVertical * SWAY_ROTATION_GAIN +
      crouchAmount * CROUCH_PITCH_RADIANS +
      sprintCarry * SPRINT_PITCH_RADIANS;
    let rotationY =
      poseRotationY - swayLateral * SWAY_ROTATION_GAIN + sprintCarry * SPRINT_YAW_RADIANS;
    let rotationZ = poseRotationZ + bobRoll;

    if (this.firingTimer > 0) {
      this.firingTimer -= deltaSeconds;
      const remaining = Math.max(0, this.firingTimer) / FIRE_KICK_SECONDS;
      const eased = remaining * remaining;
      positionZ += FIRE_KICK_BACK_METRES * eased;
      positionY += FIRE_KICK_UP_METRES * eased;
      rotationX -= FIRE_KICK_PITCH_RADIANS * eased;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= deltaSeconds;
      const progress = 1 - Math.max(0, this.reloadTimer) / this.reloadDuration;
      const dip = Math.sin(Math.PI * progress);
      positionY -= RELOAD_DIP_METRES * dip;
      rotationX += RELOAD_DIP_PITCH_RADIANS * dip;
      rotationZ += RELOAD_DIP_ROLL_RADIANS * dip;
    }

    if (this.meleeTimer > 0) {
      this.meleeTimer -= deltaSeconds;
      const progress = 1 - Math.max(0, this.meleeTimer) / this.meleeDuration;
      const sweep = Math.sin(Math.PI * progress);
      positionX -= MELEE_SWING_LATERAL_METRES * sweep;
      positionZ -= MELEE_SWING_FORWARD_METRES * sweep;
      rotationZ += MELEE_SWING_ROLL_RADIANS * sweep;
      rotationY += MELEE_SWING_YAW_RADIANS * sweep;
    }

    this.group.position.set(positionX, positionY, positionZ);
    this.group.rotation.set(rotationX, rotationY, rotationZ);

    if (this.hidesModelAtFullScope) {
      this.activeModel.visible = scope < SCOPE_HIDE_FRACTION;
    }
  }

  /**
   * Raises and lowers the weapon at the rate its own optic allows: a bolt gun
   * with a telescopic sight takes OPTICS.sniper.scopeInSeconds to come up, a
   * pistol a third of that. `fighter.aimFraction` is the wish, this is the
   * weapon obeying it.
   */
  updateScopeFraction(deltaSeconds, fighter) {
    if (this.activeOptic === null) {
      this.scopeFraction = 0;
      return;
    }

    const step = deltaSeconds * this.scopeRatePerSecond;
    this.scopeFraction += THREE.MathUtils.clamp(
      fighter.aimFraction - this.scopeFraction,
      -step,
      step
    );
  }

  /** The weapon trails the view: a fast turn throws it opposite and it settles back. */
  updateSway(deltaSeconds, fighter) {
    let yawDelta = fighter.yaw - this.previousYaw;
    yawDelta = ((((yawDelta + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
    const pitchDelta = fighter.pitch - this.previousPitch;

    this.previousYaw = fighter.yaw;
    this.previousPitch = fighter.pitch;

    const lateralTarget = THREE.MathUtils.clamp(
      yawDelta * SWAY_POSITION_GAIN,
      -SWAY_POSITION_LIMIT,
      SWAY_POSITION_LIMIT
    );
    const verticalTarget = THREE.MathUtils.clamp(
      -pitchDelta * SWAY_POSITION_GAIN,
      -SWAY_POSITION_LIMIT,
      SWAY_POSITION_LIMIT
    );

    const blend = Math.min(1, deltaSeconds * SWAY_SMOOTHING_PER_SECOND);
    this.swayLateral += (lateralTarget - this.swayLateral) * blend;
    this.swayVertical += (verticalTarget - this.swayVertical) * blend;
  }

  /** Cancels any animation in progress. Death interrupts a reload. */
  reset() {
    this.reloadTimer = 0;
    this.meleeTimer = 0;
    this.scopeFraction = 0;
    this.activeModel.visible = true;
  }

  playFire() {
    this.firingTimer = FIRE_KICK_SECONDS;
  }

  playReload(durationSeconds) {
    this.reloadTimer = durationSeconds;
    this.reloadDuration = durationSeconds;
  }

  dispose() {
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }

  playMelee(durationSeconds) {
    this.meleeTimer = durationSeconds;
    this.meleeDuration = durationSeconds;
  }
}

/**
 * Library materials are shared with the world, so the view model gets clones:
 * the weapon scene lights them differently, and the darkened variants do not
 * exist in the library.
 */
function createViewMaterials(materials) {
  const gunMetal = materials.metal.clone();
  gunMetal.color.setHex(0x8d949b);

  const darkMetal = materials.metal.clone();
  darkMetal.color.setHex(0x32373c);
  darkMetal.roughness = 0.52;

  const wood = materials.wood.clone();
  const rusted = materials.rustedMetal.clone();

  const sackcloth = materials.hay.clone();
  sackcloth.color.setHex(0xb49a6a);

  // hay, not wheat: wheat carries the wind shader, and a seed head in the hand
  // does not sway. Cloning it would compile that program a second time.
  const grain = materials.hay.clone();

  return { gunMetal, darkMetal, wood, rusted, sackcloth, grain };
}

function part(geometry, material, x, y, z, rotationX, rotationY, rotationZ) {
  if (rotationX !== 0) geometry.rotateX(rotationX);
  if (rotationY !== 0) geometry.rotateY(rotationY);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(x, y, z);
  return { geometry, material };
}

const QUARTER_TURN = Math.PI / 2;

function buildPistol(materials) {
  return [
    part(new THREE.BoxGeometry(0.05, 0.072, 0.24), materials.darkMetal, 0, 0.015, -0.06, 0, 0, 0),
    part(new THREE.BoxGeometry(0.044, 0.03, 0.1), materials.gunMetal, 0, -0.03, -0.11, 0, 0, 0),
    part(
      new THREE.BoxGeometry(0.046, 0.125, 0.062),
      materials.darkMetal,
      0,
      -0.085,
      0.035,
      0.3,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.012, 0.034, 0.012), materials.gunMetal, 0, -0.045, -0.005, 0, 0, 0),
    part(new THREE.BoxGeometry(0.018, 0.012, 0.012), materials.gunMetal, 0, 0.056, -0.16, 0, 0, 0)
  ];
}

/**
 * The silhouette has to say revolver before any detail does, so the cylinder is
 * a twelve-sided drum wider than the frame it sits in, fluted with six sunken
 * ribs for the six chambers, and the barrel carries a Python-style vented rib.
 */
function buildRevolver(materials) {
  const parts = [
    part(new THREE.BoxGeometry(0.04, 0.072, 0.17), materials.darkMetal, 0, 0.012, -0.03, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.038, 0.038, 0.095, 12),
      materials.gunMetal,
      0,
      0.008,
      -0.055,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8),
      materials.gunMetal,
      0,
      0.016,
      -0.195,
      QUARTER_TURN,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.022, 0.01, 0.2), materials.gunMetal, 0, 0.034, -0.195, 0, 0, 0),
    part(new THREE.BoxGeometry(0.02, 0.018, 0.18), materials.gunMetal, 0, -0.002, -0.19, 0, 0, 0),
    part(new THREE.BoxGeometry(0.012, 0.03, 0.014), materials.darkMetal, 0, 0.04, 0.05, -0.45, 0, 0),
    part(new THREE.BoxGeometry(0.01, 0.03, 0.01), materials.gunMetal, 0, -0.035, 0.01, 0, 0, 0),
    part(
      new THREE.TorusGeometry(0.026, 0.004, 4, 10),
      materials.darkMetal,
      0,
      -0.048,
      0.012,
      0,
      QUARTER_TURN,
      0
    ),
    part(new THREE.BoxGeometry(0.056, 0.145, 0.082), materials.wood, 0, -0.095, 0.055, 0.42, 0, 0),
    part(new THREE.BoxGeometry(0.034, 0.09, 0.03), materials.darkMetal, 0, -0.04, 0.04, 0.42, 0, 0),
    part(new THREE.BoxGeometry(0.01, 0.016, 0.014), materials.darkMetal, 0, 0.048, -0.285, 0, 0, 0),
    part(new THREE.BoxGeometry(0.022, 0.01, 0.012), materials.darkMetal, 0, 0.05, 0.03, 0, 0, 0)
  ];

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * TWO_PI;
    parts.push(
      part(
        new THREE.BoxGeometry(0.012, 0.006, 0.072),
        materials.darkMetal,
        Math.cos(angle) * 0.035,
        0.008 + Math.sin(angle) * 0.035,
        -0.055,
        0,
        0,
        angle
      )
    );
  }

  for (let index = 0; index < 4; index += 1) {
    parts.push(
      part(
        new THREE.BoxGeometry(0.024, 0.006, 0.009),
        materials.darkMetal,
        0,
        0.036,
        -0.13 - index * 0.04,
        0,
        0,
        0
      )
    );
  }

  return parts;
}

function buildRifle(materials) {
  return [
    part(new THREE.BoxGeometry(0.058, 0.082, 0.34), materials.darkMetal, 0, 0, -0.08, 0, 0, 0),
    part(new THREE.BoxGeometry(0.052, 0.058, 0.22), materials.darkMetal, 0, 0.002, -0.32, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.013, 0.013, 0.26, 8),
      materials.gunMetal,
      0,
      0.012,
      -0.52,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.019, 0.019, 0.05, 8),
      materials.gunMetal,
      0,
      0.012,
      -0.66,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.BoxGeometry(0.036, 0.17, 0.075),
      materials.darkMetal,
      0,
      -0.11,
      -0.04,
      -0.18,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.042, 0.105, 0.055), materials.darkMetal, 0, -0.075, 0.06, 0.34, 0, 0),
    part(new THREE.BoxGeometry(0.05, 0.085, 0.22), materials.darkMetal, 0, -0.015, 0.21, 0, 0, 0),
    part(new THREE.BoxGeometry(0.05, 0.022, 0.14), materials.darkMetal, 0, 0.036, 0.17, 0, 0, 0),
    part(new THREE.BoxGeometry(0.03, 0.014, 0.26), materials.gunMetal, 0, 0.05, -0.12, 0, 0, 0),
    part(new THREE.BoxGeometry(0.024, 0.03, 0.016), materials.gunMetal, 0, 0.072, -0.02, 0, 0, 0)
  ];
}

function buildShotgun(materials) {
  return [
    part(new THREE.BoxGeometry(0.066, 0.09, 0.24), materials.rusted, 0, 0, -0.06, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.019, 0.019, 0.52, 8),
      materials.gunMetal,
      0,
      0.024,
      -0.44,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8),
      materials.gunMetal,
      0,
      -0.022,
      -0.4,
      QUARTER_TURN,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.068, 0.055, 0.13), materials.wood, 0, -0.018, -0.3, 0, 0, 0),
    part(new THREE.BoxGeometry(0.05, 0.07, 0.1), materials.wood, 0, -0.025, 0.08, 0, 0, 0),
    part(new THREE.BoxGeometry(0.052, 0.1, 0.26), materials.wood, 0, -0.05, 0.19, -0.14, 0, 0),
    part(new THREE.BoxGeometry(0.012, 0.012, 0.012), materials.gunMetal, 0, 0.05, -0.69, 0, 0, 0)
  ];
}

/**
 * A bolt gun in the Accuracy International family. rotateX(QUARTER_TURN) maps
 * the cylinder's top cap onto +Z, so the forward radius of every barrel and
 * scope section is the one passed as radiusBottom.
 */
function buildSniper(materials) {
  return [
    part(new THREE.BoxGeometry(0.054, 0.082, 0.3), materials.darkMetal, 0, 0, -0.06, 0, 0, 0),
    part(new THREE.BoxGeometry(0.06, 0.07, 0.36), materials.darkMetal, 0, -0.012, -0.4, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.019, 0.016, 0.44, 8),
      materials.gunMetal,
      0,
      0.01,
      -0.72,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8),
      materials.gunMetal,
      0,
      0.01,
      -0.97,
      QUARTER_TURN,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.052, 0.008, 0.008), materials.darkMetal, 0, 0.01, -0.96, 0, 0, 0),
    part(new THREE.BoxGeometry(0.052, 0.008, 0.008), materials.darkMetal, 0, 0.01, -0.982, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.019, 0.019, 0.3, 10),
      materials.gunMetal,
      0,
      0.105,
      -0.07,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.026, 0.03, 0.07, 10),
      materials.gunMetal,
      0,
      0.105,
      -0.255,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.027, 0.027, 0.004, 10),
      materials.darkMetal,
      0,
      0.105,
      -0.291,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.027, 0.024, 0.055, 10),
      materials.gunMetal,
      0,
      0.105,
      0.1075,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.027, 0.027, 0.018, 8),
      materials.darkMetal,
      0,
      0.105,
      -0.16,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.027, 0.027, 0.018, 8),
      materials.darkMetal,
      0,
      0.105,
      0.03,
      QUARTER_TURN,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.016, 0.05, 0.018), materials.darkMetal, 0, 0.062, -0.16, 0, 0, 0),
    part(new THREE.BoxGeometry(0.016, 0.05, 0.018), materials.darkMetal, 0, 0.062, 0.03, 0, 0, 0),
    part(
      new THREE.CylinderGeometry(0.013, 0.013, 0.022, 8),
      materials.gunMetal,
      0,
      0.127,
      -0.07,
      0,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.013, 0.013, 0.022, 8),
      materials.gunMetal,
      0.028,
      0.105,
      -0.07,
      0,
      0,
      QUARTER_TURN
    ),
    part(new THREE.BoxGeometry(0.056, 0.014, 0.014), materials.darkMetal, 0.046, 0.016, 0.055, 0, 0, -0.3),
    part(
      new THREE.CylinderGeometry(0.014, 0.014, 0.016, 8),
      materials.gunMetal,
      0.072,
      0.006,
      0.055,
      0,
      0,
      QUARTER_TURN
    ),
    part(new THREE.BoxGeometry(0.034, 0.075, 0.07), materials.darkMetal, 0, -0.078, -0.06, 0, 0, 0),
    part(new THREE.BoxGeometry(0.012, 0.028, 0.012), materials.gunMetal, 0, -0.054, 0.005, 0, 0, 0),
    part(new THREE.BoxGeometry(0.016, 0.009, 0.06), materials.darkMetal, 0, -0.07, 0.005, 0, 0, 0),
    part(new THREE.BoxGeometry(0.04, 0.115, 0.055), materials.darkMetal, 0, -0.082, 0.085, 0.3, 0, 0),
    part(new THREE.BoxGeometry(0.046, 0.09, 0.22), materials.darkMetal, 0, -0.01, 0.195, 0, 0, 0),
    part(new THREE.BoxGeometry(0.044, 0.03, 0.16), materials.darkMetal, 0, 0.05, 0.185, 0, 0, 0),
    part(new THREE.BoxGeometry(0.048, 0.105, 0.02), materials.darkMetal, 0, -0.01, 0.315, 0, 0, 0),
    part(new THREE.BoxGeometry(0.03, 0.018, 0.03), materials.darkMetal, 0, -0.055, -0.5, 0, 0, 0),
    part(
      new THREE.BoxGeometry(0.009, 0.13, 0.009),
      materials.gunMetal,
      -0.042,
      -0.108,
      -0.515,
      0.25,
      0,
      -0.35
    ),
    part(
      new THREE.BoxGeometry(0.009, 0.13, 0.009),
      materials.gunMetal,
      0.042,
      -0.108,
      -0.515,
      0.25,
      0,
      0.35
    )
  ];
}

/**
 * A burlap seed sack, cinched at the neck and tipped forward so its mouth
 * faces where the player is looking. It carries a muzzle anchor like every
 * other weapon because the constructor requires one, but nothing reads it:
 * planting spawns no effect.
 */
function buildSeedBag(materials) {
  return [
    part(
      new THREE.CylinderGeometry(0.075, 0.105, 0.21, 10),
      materials.sackcloth,
      0,
      -0.03,
      -0.03,
      0.18,
      0,
      0
    ),
    part(
      new THREE.SphereGeometry(0.085, 10, 6),
      materials.sackcloth,
      0,
      -0.115,
      -0.012,
      0,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.052, 0.072, 0.07, 10),
      materials.sackcloth,
      0,
      0.082,
      -0.062,
      0.45,
      0,
      0
    ),
    part(
      new THREE.TorusGeometry(0.052, 0.009, 5, 10),
      materials.wood,
      0,
      0.098,
      -0.07,
      QUARTER_TURN + 0.45,
      0,
      0
    ),
    part(
      new THREE.ConeGeometry(0.044, 0.055, 8),
      materials.grain,
      0,
      0.126,
      -0.088,
      Math.PI - 0.45,
      0,
      0
    )
  ];
}

/** The curve of the blade is approximated by three segments at rising angles. */
function buildKarambit(materials) {
  return [
    part(new THREE.BoxGeometry(0.024, 0.032, 0.095), materials.darkMetal, 0, 0, 0.02, 0, 0, 0),
    part(
      new THREE.TorusGeometry(0.024, 0.006, 6, 12),
      materials.darkMetal,
      0,
      0,
      0.075,
      0,
      QUARTER_TURN,
      0
    ),
    part(new THREE.BoxGeometry(0.008, 0.03, 0.065), materials.gunMetal, 0, 0.012, -0.055, 0.25, 0, 0),
    part(new THREE.BoxGeometry(0.008, 0.026, 0.055), materials.gunMetal, 0, 0.028, -0.105, 0.75, 0, 0),
    part(new THREE.BoxGeometry(0.008, 0.02, 0.042), materials.gunMetal, 0, 0.058, -0.135, 1.25, 0, 0)
  ];
}

function buildPitchfork(materials) {
  return [
    part(
      new THREE.CylinderGeometry(0.017, 0.019, 1.05, 8),
      materials.wood,
      0,
      0,
      -0.35,
      QUARTER_TURN,
      0,
      0
    ),
    part(
      new THREE.CylinderGeometry(0.021, 0.021, 0.06, 8),
      materials.gunMetal,
      0,
      0,
      -0.84,
      QUARTER_TURN,
      0,
      0
    ),
    part(new THREE.BoxGeometry(0.17, 0.016, 0.016), materials.gunMetal, 0, 0, -0.9, 0, 0, 0),
    part(new THREE.BoxGeometry(0.011, 0.011, 0.2), materials.gunMetal, -0.058, 0, -1.0, 0, -0.06, 0),
    part(new THREE.BoxGeometry(0.011, 0.011, 0.22), materials.gunMetal, 0, 0, -1.01, 0, 0, 0),
    part(new THREE.BoxGeometry(0.011, 0.011, 0.2), materials.gunMetal, 0.058, 0, -1.0, 0, 0.06, 0)
  ];
}
