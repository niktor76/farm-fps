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
import { BALLOON, SIMULATION, WORLD } from '../config/tunables.js';
import { patchHitsGeometry } from './props.js';

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

    const risePerStep = (BALLOON.riseHeight / BALLOON.riseSeconds) * SIMULATION.fixedStepSeconds;
    if (risePerStep >= WORLD.stepHeight) {
      throw new Error('balloon climbs faster than a fighter can be stepped up');
    }

    const [centerX, centerZ] = findClearSpot(collisionWorld);
    this.centerX = centerX;
    this.centerZ = centerZ;

    this.height = 0;
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

  /** True when this fighter is standing in the basket rather than beside it. */
  carries(fighter) {
    const halfExtent = BALLOON.basketExtent / 2;
    if (Math.abs(fighter.position.x - this.centerX) > halfExtent) return false;
    if (Math.abs(fighter.position.z - this.centerZ) > halfExtent) return false;

    const floorTop = this.height + BALLOON.floorThickness;
    return Math.abs(fighter.position.y - floorTop) < WORLD.stepHeight;
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
      const climbed = (BALLOON.riseHeight / BALLOON.riseSeconds) * deltaSeconds;
      this.setHeight(Math.min(BALLOON.riseHeight, this.height + climbed));
      if (this.height >= BALLOON.riseHeight) this.enter('hovering');
      return;
    }

    if (this.phase === 'hovering') {
      if (this.phaseSeconds >= BALLOON.hoverSeconds) this.enter('descending');
      return;
    }

    const sank = (BALLOON.riseHeight / BALLOON.descendSeconds) * deltaSeconds;
    this.setHeight(Math.max(0, this.height - sank));
    if (this.height <= 0) this.enter('grounded');
  }

  enter(phase) {
    this.phase = phase;
    this.phaseSeconds = 0;
  }

  /** Moves the model and the collision floor together; they must never diverge. */
  setHeight(height) {
    this.height = height;
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
  const group = new THREE.Group();

  // Not a clone of an existing material: every one of them carries a painted
  // map, and a tint multiplied by the dark corrugation map renders the
  // envelope black. Fabric gets its own untextured material instead.
  const envelopeMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8503c,
    roughness: 0.85,
    metalness: 0
  });

  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(BALLOON.envelopeRadius, 16, 12),
    envelopeMaterial
  );
  envelope.scale.set(1, 1.25, 1);
  envelope.position.y = BALLOON.basketHeight + BALLOON.envelopeRadius * 1.5;
  envelope.castShadow = true;
  group.add(envelope);

  const skirt = new THREE.Mesh(
    new THREE.ConeGeometry(BALLOON.envelopeRadius * 0.55, BALLOON.envelopeRadius * 0.9, 12, 1, true),
    envelopeMaterial
  );
  skirt.position.y = BALLOON.basketHeight + BALLOON.envelopeRadius * 0.45;
  skirt.rotation.x = Math.PI;
  group.add(skirt);

  const basketMaterial = materials.hay.clone();
  basketMaterial.color.setHex(0x9b7a44);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(BALLOON.basketExtent, BALLOON.floorThickness, BALLOON.basketExtent),
    basketMaterial
  );
  floor.position.y = BALLOON.floorThickness / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const wallThickness = 0.08;
  const wallOffset = BALLOON.basketExtent / 2 - wallThickness / 2;
  const wallCentreY = BALLOON.floorThickness + BALLOON.basketHeight / 2;

  for (const [offsetX, offsetZ, sizeX, sizeZ] of [
    [wallOffset, 0, wallThickness, BALLOON.basketExtent],
    [-wallOffset, 0, wallThickness, BALLOON.basketExtent],
    [0, wallOffset, BALLOON.basketExtent, wallThickness],
    [0, -wallOffset, BALLOON.basketExtent, wallThickness]
  ]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(sizeX, BALLOON.basketHeight, sizeZ),
      basketMaterial
    );
    wall.position.set(offsetX, wallCentreY, offsetZ);
    wall.castShadow = true;
    group.add(wall);
  }

  const ropeMaterial = materials.wood.clone();
  const ropeTop = BALLOON.basketHeight + BALLOON.envelopeRadius * 0.45;

  for (const [offsetX, offsetZ] of [
    [wallOffset, wallOffset],
    [-wallOffset, wallOffset],
    [wallOffset, -wallOffset],
    [-wallOffset, -wallOffset]
  ]) {
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, ropeTop - BALLOON.basketHeight, 5),
      ropeMaterial
    );
    rope.position.set(offsetX, (BALLOON.basketHeight + ropeTop) / 2, offsetZ);
    group.add(rope);
  }

  return group;
}
