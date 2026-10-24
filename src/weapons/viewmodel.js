/**
 * First person weapon model held in front of the camera, with walk bob, sway
 * and recoil. Without it the screen is empty and the game does not read as a
 * first person shooter (DEC-18).
 *
 * The models are parented to the camera, so game.js must have the camera in
 * the scene graph (scene.add(camera)) for them to render.
 *
 * Clipping through nearby walls is solved without a second render pass: every
 * view model mesh renders in the transparent queue at a high renderOrder, and
 * a zero-opacity sentinel scheduled just before them clears the depth buffer.
 * Depth testing inside the model therefore still works, while nothing in the
 * world can occlude it.
 *
 * Owned by PH-5-weapons.
 */

import * as THREE from 'three';
import { OPTICS } from '../config/tunables.js';
import { mergeByMaterial } from '../world/materials.js';

const TWO_PI = Math.PI * 2;

const RENDER_ORDER = 2000;
const SENTINEL_RENDER_ORDER = RENDER_ORDER - 1;

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
 * - iron sights and the shotgun's bead land their sight line a few millimetres
 *   below the crosshair, which is how a shooter sees a post inside a notch;
 * - the revolver's pistol scope and the rifle's optical sight put their optical
 *   axis on the crosshair, so they ride higher than irons;
 * - the sniper's telescopic sight puts the SCOPE tube's axis on the crosshair,
 *   which is far higher again because the tube sits on rings above the receiver.
 *
 * Every aim Y is the negated sight height of that model's own geometry times
 * its scale, so moving a sight in a builder means moving the number here too.
 * Melee weapons cannot aim, so their aim entry is null.
 */
const WEAPON_POSES = {
  pistol: {
    rest: { position: [0.17, -0.17, -0.38], rotation: [0.02, -0.18, 0], scale: 1.5 },
    aim: { position: [0, -0.09, -0.33], rotation: [0, 0, 0] }
  },
  revolver: {
    rest: { position: [0.18, -0.18, -0.4], rotation: [0.02, -0.17, 0], scale: 1.25 },
    aim: { position: [0, -0.06, -0.32], rotation: [0, 0, 0] }
  },
  rifle: {
    rest: { position: [0.19, -0.2, -0.42], rotation: [0.02, -0.15, 0], scale: 1.15 },
    aim: { position: [0, -0.083, -0.36], rotation: [0, 0, 0] }
  },
  shotgun: {
    rest: { position: [0.19, -0.2, -0.42], rotation: [0.02, -0.15, 0], scale: 1.1 },
    aim: { position: [0, -0.06, -0.4], rotation: [0, 0, 0] }
  },
  sniper: {
    rest: { position: [0.2, -0.22, -0.44], rotation: [0.02, -0.14, 0], scale: 1.0 },
    aim: { position: [0, -0.105, -0.3], rotation: [0, 0, 0] }
  },
  karambit: {
    rest: { position: [0.21, -0.19, -0.34], rotation: [-0.15, -0.45, 0.35], scale: 1.7 },
    aim: null
  },
  pitchfork: {
    rest: { position: [0.22, -0.26, -0.4], rotation: [-0.04, -0.1, 0.1], scale: 0.8 },
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
  pitchfork: { position: [0, 0, -1.12], pitchX: 0 }
};

export class ViewModel {
  /**
   * @param {import('three').PerspectiveCamera} camera
   * @param {ReturnType<import('../world/materials.js').createMaterialLibrary>} materials
   */
  constructor(camera, materials) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    camera.add(this.group);

    this.group.add(createDepthClearSentinel());

    const viewMaterials = createViewMaterials(materials);
    const builders = {
      pistol: buildPistol,
      revolver: buildRevolver,
      rifle: buildRifle,
      shotgun: buildShotgun,
      sniper: buildSniper,
      karambit: buildKarambit,
      pitchfork: buildPitchfork
    };

    this.models = new Map();
    this.muzzleAnchors = new Map();
    for (const weaponId of Object.keys(builders)) {
      const model = mergeByMaterial(builders[weaponId](viewMaterials), false, true);
      model.scale.setScalar(WEAPON_POSES[weaponId].rest.scale);
      model.visible = false;
      for (const mesh of model.children) {
        mesh.renderOrder = RENDER_ORDER;
        mesh.frustumCulled = false;
      }

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
   * `updateWorldMatrix(true, false)` walks the camera -> group -> model -> anchor
   * chain and recomposes each local matrix from its current position/rotation,
   * so the result is this frame's transform rather than the one three.js last
   * flushed during render.
   *
   * The view model shares the scene's camera and projection, so this point
   * projects to the pixel the barrel tip is drawn at — usable as a world-space
   * effect origin without any correction along the aim direction.
   *
   * @param {import('three').Vector3} target
   */
  getMuzzleWorldPosition(target) {
    const anchor = this.activeMuzzleAnchor;
    anchor.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(anchor.matrixWorld);
  }

  /**
   * The direction the active weapon points, in world space. Normalised because
   * the models carry a non-unit scale.
   *
   * @param {import('three').Vector3} target
   */
  getMuzzleWorldDirection(target) {
    const anchor = this.activeMuzzleAnchor;
    anchor.updateWorldMatrix(true, false);
    const elements = anchor.matrixWorld.elements;
    return target.set(-elements[8], -elements[9], -elements[10]).normalize();
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

    let positionX = poseX + bobLateral + swayLateral;
    let positionY =
      poseY +
      bobVertical +
      swayVertical +
      fighter.crouchAmount * CROUCH_RAISE_METRES -
      sprintAmount * SPRINT_DROP_METRES;
    let positionZ = poseZ;

    let rotationX =
      poseRotationX +
      swayVertical * SWAY_ROTATION_GAIN +
      fighter.crouchAmount * CROUCH_PITCH_RADIANS +
      sprintAmount * SPRINT_PITCH_RADIANS;
    let rotationY =
      poseRotationY - swayLateral * SWAY_ROTATION_GAIN + sprintAmount * SPRINT_YAW_RADIANS;
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
    this.camera.remove(this.group);
    this.group.traverse((object) => {
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
 * Draws nothing, but its onBeforeRender wipes the depth buffer just before the
 * weapon meshes are drawn, which is what keeps a wall from cutting into the
 * model when the player stands against it.
 */
function createDepthClearSentinel() {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false
  });
  const sentinel = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), material);
  sentinel.position.set(0, 0, -0.1);
  sentinel.renderOrder = SENTINEL_RENDER_ORDER;
  sentinel.frustumCulled = false;
  sentinel.onBeforeRender = (renderer) => renderer.clearDepth();
  return sentinel;
}

/**
 * Library materials are shared with the world, so the view model gets clones:
 * it needs its own queue placement, and the darkened variants do not exist in
 * the library.
 */
function createViewMaterials(materials) {
  const gunMetal = materials.metal.clone();
  gunMetal.color.setHex(0x8d949b);

  const darkMetal = materials.metal.clone();
  darkMetal.color.setHex(0x32373c);
  darkMetal.roughness = 0.52;

  const wood = materials.wood.clone();
  const rusted = materials.rustedMetal.clone();

  for (const material of [gunMetal, darkMetal, wood, rusted]) {
    material.transparent = true;
    material.opacity = 1;
    material.depthTest = true;
    material.depthWrite = true;
  }

  return { gunMetal, darkMetal, wood, rusted };
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
    part(new THREE.BoxGeometry(0.012, 0.04, 0.016), materials.darkMetal, 0, 0.058, 0.045, -0.45, 0, 0),
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
