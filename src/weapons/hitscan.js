/**
 * Hitscan resolution against static boxes and fighter hit volumes (DEC-7, DEC-12).
 *
 * Rays are tested with THREE.Ray.intersectBox against a flat Box3 list rather
 * than through Raycaster.intersectObjects, so no scene graph is traversed.
 *
 * Owned by PH-5-weapons.
 */

import * as THREE from 'three';

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

const scratchRay = new THREE.Ray();
const scratchPoint = new THREE.Vector3();
const scratchTangent = new THREE.Vector3();
const scratchBitangent = new THREE.Vector3();
const scratchBodyBox = new THREE.Box3();
const scratchHeadBox = new THREE.Box3();
const scratchEye = new THREE.Vector3();
const scratchAim = new THREE.Vector3();
const scratchCenter = new THREE.Vector3();
const scratchClosest = new THREE.Vector3();
const scratchOffset = new THREE.Vector3();

const shotResult = {
  target: null,
  point: new THREE.Vector3(),
  distance: 0,
  isHeadshot: false,
  damage: 0
};

/**
 * Traces one shot. For a shotgun this is called once per pellet.
 *
 * @param {{
 *   shooter: import('../entities/fighter.js').Fighter,
 *   origin: import('three').Vector3,
 *   direction: import('three').Vector3,
 *   weapon: object,
 *   collisionWorld: import('../world/collision.js').CollisionWorld,
 *   fighters: import('../entities/fighter.js').Fighter[]
 * }} shot
 * @returns {{
 *   target: import('../entities/fighter.js').Fighter | null,
 *   point: import('three').Vector3,
 *   distance: number,
 *   isHeadshot: boolean,
 *   damage: number
 * }}
 */
export function traceShot(shot) {
  const { shooter, origin, direction, weapon, collisionWorld, fighters } = shot;

  scratchRay.origin.copy(origin);
  scratchRay.direction.copy(direction);

  let nearest = weapon.maximumRange;
  shotResult.target = null;
  shotResult.isHeadshot = false;
  shotResult.point.copy(origin).addScaledVector(direction, nearest);

  const geometryDistance = collisionWorld.raycast(origin, direction, nearest, scratchPoint);
  if (geometryDistance < nearest) {
    nearest = geometryDistance;
    shotResult.point.copy(scratchPoint);
  }

  for (const other of fighters) {
    if (other === shooter) continue;
    if (!other.alive) continue;

    other.getHeadBox(scratchHeadBox);
    if (scratchRay.intersectBox(scratchHeadBox, scratchPoint) !== null) {
      const distance = origin.distanceTo(scratchPoint);
      if (distance < nearest) {
        nearest = distance;
        shotResult.target = other;
        shotResult.isHeadshot = true;
        shotResult.point.copy(scratchPoint);
      }
    }

    other.getBodyBox(scratchBodyBox);
    if (scratchRay.intersectBox(scratchBodyBox, scratchPoint) !== null) {
      const distance = origin.distanceTo(scratchPoint);
      if (distance < nearest) {
        nearest = distance;
        shotResult.target = other;
        shotResult.isHeadshot = false;
        shotResult.point.copy(scratchPoint);
      }
    }
  }

  shotResult.distance = nearest;

  if (shotResult.target === null) {
    shotResult.damage = 0;
    return shotResult;
  }

  const base = damageAtDistance(weapon, nearest);
  shotResult.damage = shotResult.isHeadshot
    ? base * weapon.headshotMultiplier
    : base * (weapon.bodyDamageMultiplier ?? 1);
  return shotResult;
}

/**
 * Melee sweep in front of the attacker, limited by weapon.reach and
 * weapon.swingArcRadians, blocked by geometry in between.
 *
 * Reach is measured from the eye to the nearest point of the target's body
 * box, so it describes how far the blade travels rather than how far apart
 * two colliders sit.
 *
 * @returns {import('../entities/fighter.js').Fighter | null}
 */
export function traceMelee(attacker, weapon, fighters, collisionWorld) {
  attacker.getEyePosition(scratchEye);
  attacker.getAimDirection(scratchAim);

  const cosineArc = Math.cos(weapon.swingArcRadians);
  let best = null;
  let bestDistance = Infinity;

  for (const other of fighters) {
    if (other === attacker) continue;
    if (!other.alive) continue;

    other.getBodyBox(scratchBodyBox);
    scratchBodyBox.clampPoint(scratchEye, scratchClosest);
    const distance = scratchEye.distanceTo(scratchClosest);
    if (distance > weapon.reach) continue;
    if (distance >= bestDistance) continue;

    scratchBodyBox.getCenter(scratchCenter);
    scratchOffset.subVectors(scratchCenter, scratchEye).normalize();
    if (scratchOffset.dot(scratchAim) < cosineArc) continue;
    if (collisionWorld.isBlocked(scratchEye, scratchCenter)) continue;

    best = other;
    bestDistance = distance;
  }

  return best;
}

/** Applies the weapon's distance falloff curve. */
export function damageAtDistance(weapon, distance) {
  if (weapon.falloffStart === undefined) return weapon.damage;
  if (distance <= weapon.falloffStart) return weapon.damage;

  const floor = weapon.damage * weapon.falloffFloor;
  if (distance >= weapon.falloffEnd) return floor;

  const progress = (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return weapon.damage + (floor - weapon.damage) * progress;
}

/** Random direction inside a cone of the given half angle, around a forward axis. */
export function spreadDirection(forward, spreadRadians, random, target) {
  if (spreadRadians <= 0) return target.copy(forward);

  // Cross with a near-parallel reference collapses to zero length, so swap axis.
  const reference = Math.abs(forward.y) > 0.999 ? AXIS_X : AXIS_Y;
  scratchTangent.crossVectors(forward, reference).normalize();
  scratchBitangent.crossVectors(forward, scratchTangent);

  // Sampling the cosine uniformly is what makes the distribution uniform over
  // the cap rather than bunched toward the centre.
  const cosineLimit = Math.cos(spreadRadians);
  const cosineTheta = 1 - random.next() * (1 - cosineLimit);
  const sineTheta = Math.sqrt(Math.max(0, 1 - cosineTheta * cosineTheta));
  const phi = random.next() * Math.PI * 2;

  return target
    .copy(forward)
    .multiplyScalar(cosineTheta)
    .addScaledVector(scratchTangent, sineTheta * Math.cos(phi))
    .addScaledVector(scratchBitangent, sineTheta * Math.sin(phi))
    .normalize();
}
