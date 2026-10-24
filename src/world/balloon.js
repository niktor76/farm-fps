/**
 * A hot air balloon that lifts whoever is standing in its basket.
 *
 * The basket floor is an ordinary collision box that is moved as the balloon
 * climbs. Nothing else is needed to carry a rider: groundHeightAt accepts any
 * surface within stepHeight of the fighter, and Fighter.resolveVertical snaps
 * the fighter up onto the highest one every frame. So as long as the climb per
 * fixed step stays well under stepHeight, the rider rides. The basket walls are
 * visual only, which is also how you get in — the floor sits one step up, and
 * stepping off a climbing balloon is a legitimate way out.
 *
 * It runs on a timer rather than on controls: anybody who steps in goes up,
 * hangs there as a target, and comes back down. That keeps it a risk rather
 * than a perch nobody can reach.
 *
 * Owned by the balloon feature.
 */

import * as THREE from 'three';
import { BALLOON, FIGHTER, SIMULATION, WORLD } from '../config/tunables.js';
import { mergeByMaterial } from './materials.js';
import { patchHitsGeometry } from './props.js';

const RISE_METRES_PER_SECOND = BALLOON.riseHeight / BALLOON.riseSeconds;
const DESCEND_METRES_PER_SECOND = BALLOON.riseHeight / BALLOON.descendSeconds;

/** Candidate pads, tried in order; the first one clear of geometry wins. */
const CANDIDATE_SPOTS = [
  [-24, 16],
  [24, 16],
  [-24, -16],
  [24, -16],
  [0, 30],
  [0, -30]
];

export class Balloon {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   materials: ReturnType<typeof import('./materials.js').createMaterialLibrary>,
   *   collisionWorld: import('./collision.js').CollisionWorld,
   *   fighters: import('../entities/fighter.js').Fighter[]
   * }} options
   */
  constructor({ scene, materials, collisionWorld, fighters }) {
    this.fighters = fighters;

    const risePerStep = RISE_METRES_PER_SECOND * SIMULATION.fixedStepSeconds;
    if (risePerStep >= WORLD.stepHeight) {
      throw new Error('balloon climbs faster than a fighter can be stepped up');
    }

    const [centerX, centerZ] = findClearSpot(collisionWorld);
    this.centerX = centerX;
    this.centerZ = centerZ;

    this.phase = 'grounded';
    this.phaseSeconds = 0;

    this.group = buildBalloonModel(materials);
    this.group.position.set(centerX, 0, centerZ);
    scene.add(this.group);

    this.floorBox = collisionWorld.addBoxFromCenterSize(
      centerX,
      WORLD.groundLevel,
      centerZ,
      BALLOON.basketExtent,
      BALLOON.floorThickness,
      BALLOON.basketExtent
    );
  }

  /** Single source of truth for how high the balloon is. */
  get height() {
    return this.group.position.y;
  }

  /**
   * True when this fighter is standing in the basket rather than beside it.
   *
   * Widened by the fighter radius to match groundHeightAt, which supports
   * anyone whose circle overlaps the floor. Without it someone stood on the
   * overhang is held up by the basket but not counted as a rider, and a lone
   * player there waits for a launch that never comes.
   */
  carries(fighter) {
    const box = this.floorBox;
    const radius = FIGHTER.radius;
    if (fighter.position.x < box.min.x - radius) return false;
    if (fighter.position.x > box.max.x + radius) return false;
    if (fighter.position.z < box.min.z - radius) return false;
    if (fighter.position.z > box.max.z + radius) return false;

    return Math.abs(fighter.position.y - box.max.y) < WORLD.stepHeight;
  }

  hasRider() {
    for (const fighter of this.fighters) {
      if (fighter.alive && this.carries(fighter)) return true;
    }

    return false;
  }

  step(deltaSeconds) {
    this.phaseSeconds += deltaSeconds;

    if (this.phase === 'grounded') {
      if (this.phaseSeconds >= BALLOON.readySeconds && this.hasRider()) this.enter('rising');
      return;
    }

    if (this.phase === 'rising') {
      const climbed = RISE_METRES_PER_SECOND * deltaSeconds;
      this.setHeight(Math.min(BALLOON.riseHeight, this.height + climbed));
      if (this.height >= BALLOON.riseHeight) this.enter('hovering');
      return;
    }

    if (this.phase === 'hovering') {
      if (this.phaseSeconds >= BALLOON.hoverSeconds) this.enter('descending');
      return;
    }

    const sank = DESCEND_METRES_PER_SECOND * deltaSeconds;
    this.setHeight(Math.max(0, this.height - sank));
    if (this.height <= 0) this.enter('grounded');
  }

  enter(phase) {
    this.phase = phase;
    this.phaseSeconds = 0;
  }

  setHeight(height) {
    this.group.position.y = height;
    this.floorBox.min.y = WORLD.groundLevel + height;
    this.floorBox.max.y = WORLD.groundLevel + height + BALLOON.floorThickness;
  }
}

/**
 * The first pad whose footprint is clear of buildings. The balloon is placed
 * after the map is built, so it has to find its own room rather than assume a
 * spot stayed empty.
 */
function findClearSpot(collisionWorld) {
  for (const [centerX, centerZ] of CANDIDATE_SPOTS) {
    const candidate = {
      centerX,
      centerZ,
      sizeX: BALLOON.clearanceExtent,
      sizeZ: BALLOON.clearanceExtent
    };
    if (!patchHitsGeometry(collisionWorld, candidate)) return [centerX, centerZ];
  }

  throw new Error('no clear ground for the balloon');
}

function buildBalloonModel(materials) {
  // Not a clone of an existing material: every one of them carries a painted
  // map, and a tint multiplied by the dark corrugation map renders the
  // envelope black. Fabric gets its own untextured material instead.
  const fabric = new THREE.MeshStandardMaterial({
    color: 0xc8503c,
    roughness: 0.85,
    metalness: 0
  });

  const wicker = materials.hay.clone();
  wicker.color.setHex(0x9b7a44);

  const envelope = new THREE.SphereGeometry(BALLOON.envelopeRadius, 16, 12);
  envelope.scale(1, 1.25, 1);
  envelope.translate(0, BALLOON.basketHeight + BALLOON.envelopeRadius * 1.5, 0);

  const skirt = new THREE.ConeGeometry(
    BALLOON.envelopeRadius * 0.55,
    BALLOON.envelopeRadius * 0.9,
    12,
    1,
    true
  );
  skirt.rotateX(Math.PI);
  skirt.translate(0, BALLOON.basketHeight + BALLOON.envelopeRadius * 0.45, 0);

  const floor = new THREE.BoxGeometry(
    BALLOON.basketExtent,
    BALLOON.floorThickness,
    BALLOON.basketExtent
  );
  floor.translate(0, BALLOON.floorThickness / 2, 0);

  const parts = [
    { geometry: envelope, material: fabric },
    { geometry: skirt, material: fabric },
    { geometry: floor, material: wicker }
  ];

  const wallThickness = 0.08;
  const wallOffset = BALLOON.basketExtent / 2 - wallThickness / 2;
  const wallCentreY = BALLOON.floorThickness + BALLOON.basketHeight / 2;

  for (const [offsetX, offsetZ, sizeX, sizeZ] of [
    [wallOffset, 0, wallThickness, BALLOON.basketExtent],
    [-wallOffset, 0, wallThickness, BALLOON.basketExtent],
    [0, wallOffset, BALLOON.basketExtent, wallThickness],
    [0, -wallOffset, BALLOON.basketExtent, wallThickness]
  ]) {
    const wall = new THREE.BoxGeometry(sizeX, BALLOON.basketHeight, sizeZ);
    wall.translate(offsetX, wallCentreY, offsetZ);
    parts.push({ geometry: wall, material: wicker });
  }

  const ropeTop = BALLOON.basketHeight + BALLOON.envelopeRadius * 0.45;

  for (const [offsetX, offsetZ] of [
    [wallOffset, wallOffset],
    [-wallOffset, wallOffset],
    [wallOffset, -wallOffset],
    [-wallOffset, -wallOffset]
  ]) {
    const rope = new THREE.CylinderGeometry(0.03, 0.03, ropeTop - BALLOON.basketHeight, 5);
    rope.translate(offsetX, (BALLOON.basketHeight + ropeTop) / 2, offsetZ);
    parts.push({ geometry: rope, material: materials.wood });
  }

  // Three materials, so three draw calls instead of eleven meshes.
  return mergeByMaterial(parts, true, true);
}
