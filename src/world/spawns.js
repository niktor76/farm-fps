/**
 * Spawn point generation and selection.
 *
 * Owned by PH-6-effects.
 *
 * generateSpawnPoints lays out MATCH.spawnPointCount positions that are clear
 * of geometry and spread across the play area.
 *
 * chooseSpawnPoint picks the candidate furthest from living enemies, honouring
 * MATCH.minimumSpawnDistanceToEnemy where possible.
 */

import * as THREE from 'three';
import { MATCH, WORLD, FIGHTER, DIFFICULTIES, DEFAULT_DIFFICULTY } from '../config/tunables.js';

/** How far a spawn stays off the fence, so nobody appears nose-first in a post. */
const FENCE_MARGIN = 3;

/** Wider than the fighter so a spawn is never wedged against a wall. */
const SPAWN_CLEARANCE_RADIUS = FIGHTER.radius * 2.5;

/** Spawns settle on the ground, hay bales and door sills, never on a roof. */
const MAXIMUM_SURFACE_HEIGHT = 1.6;

const INITIAL_SEPARATION = 13;
const SEPARATION_RELAXATION = 0.82;
const ATTEMPTS_PER_RELAXATION = 40;

/** Only the strongest few candidates are worth a facing check. */
const VIEW_CHECK_COUNT = 5;
const VIEW_CONE_COSINE = Math.cos(
  (DIFFICULTIES[DEFAULT_DIFFICULTY].fieldOfViewDegrees * Math.PI) / 180 / 2
);
const OUT_OF_VIEW_BONUS = 9;

/**
 * Candidates within this much of the best score count as equally good. The
 * metric is continuous, so an exact tie never occurs and a strict argmax would
 * send every respawn to the same tile.
 */
const EQUIVALENT_SCORE_BAND = 6;
const YAW_JITTER = 0.35;

const scratchForward = new THREE.Vector3();
const scratchToPoint = new THREE.Vector3();
const scratchWatcherEye = new THREE.Vector3();
const scratchPointEye = new THREE.Vector3();
const candidateScores = [];
const viewCheckIndices = [];
const bestIndices = [];

/**
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @param {import('../core/rng.js').Random} random
 * @returns {import('three').Vector3[]}
 */
export function generateSpawnPoints(collisionWorld, random) {
  const limit = WORLD.playHalfExtent - FENCE_MARGIN;
  const points = [];
  let separation = INITIAL_SEPARATION;

  while (points.length < MATCH.spawnPointCount) {
    let accepted = false;

    for (let attempt = 0; attempt < ATTEMPTS_PER_RELAXATION && !accepted; attempt += 1) {
      const x = random.range(-limit, limit);
      const z = random.range(-limit, limit);
      const y = collisionWorld.groundHeightAt(x, z, FIGHTER.radius, MAXIMUM_SURFACE_HEIGHT);

      if (collisionWorld.overlapsAt(x, y, z, SPAWN_CLEARANCE_RADIUS, FIGHTER.standingHeight)) {
        continue;
      }
      if (isCrowded(points, x, z, separation)) continue;

      points.push(new THREE.Vector3(x, y, z));
      accepted = true;
    }

    if (!accepted) separation *= SEPARATION_RELAXATION;
  }

  return points;
}

/**
 * @param {import('three').Vector3[]} spawnPoints
 * @param {import('../entities/fighter.js').Fighter[]} fighters
 * @param {import('../entities/fighter.js').Fighter} forFighter
 * @returns {{ position: import('three').Vector3, yaw: number }}
 */
export function chooseSpawnPoint(spawnPoints, fighters, forFighter, random, collisionWorld) {
  candidateScores.length = 0;
  for (const point of spawnPoints) {
    candidateScores.push(nearestEnemyDistance(point, fighters, forFighter));
  }

  selectHighest(candidateScores, VIEW_CHECK_COUNT, viewCheckIndices);

  for (const index of viewCheckIndices) {
    if (candidateScores[index] < MATCH.minimumSpawnDistanceToEnemy) continue;
    if (!isWatched(spawnPoints[index], fighters, forFighter, collisionWorld)) {
      candidateScores[index] += OUT_OF_VIEW_BONUS;
    }
  }

  let bestScore = -Infinity;
  for (const score of candidateScores) {
    if (score > bestScore) bestScore = score;
  }

  // The band never reaches below the required enemy distance while any
  // candidate still clears it; when none does, the best band is all there is.
  let floor = bestScore - EQUIVALENT_SCORE_BAND;
  if (bestScore >= MATCH.minimumSpawnDistanceToEnemy) {
    floor = Math.max(floor, MATCH.minimumSpawnDistanceToEnemy);
  }

  bestIndices.length = 0;
  for (let index = 0; index < candidateScores.length; index += 1) {
    if (candidateScores[index] >= floor) bestIndices.push(index);
  }

  const position = spawnPoints[random.pick(bestIndices)];
  const yaw = Math.atan2(position.x, position.z) + random.range(-YAW_JITTER, YAW_JITTER);
  return { position, yaw };
}

function isCrowded(points, x, z, separation) {
  const separationSquared = separation * separation;

  for (const point of points) {
    const offsetX = point.x - x;
    const offsetZ = point.z - z;
    if (offsetX * offsetX + offsetZ * offsetZ < separationSquared) return true;
  }

  return false;
}

function nearestEnemyDistance(point, fighters, forFighter) {
  let nearest = Infinity;

  for (const fighter of fighters) {
    if (fighter === forFighter || !fighter.alive) continue;
    const distance = point.distanceTo(fighter.position);
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

/**
 * True when a living enemy already has this spot inside its view cone. Only
 * the shooter's facing is available here, not the geometry between them, so
 * this is a cheap approximation of line of sight rather than a ray test.
 */
function isWatched(point, fighters, forFighter, collisionWorld) {
  for (const fighter of fighters) {
    if (fighter === forFighter || !fighter.alive) continue;

    scratchToPoint.subVectors(point, fighter.position);
    scratchToPoint.y = 0;
    const distance = scratchToPoint.length();
    if (distance < 1e-6) return true;
    scratchToPoint.divideScalar(distance);

    fighter.getForward(scratchForward);
    if (scratchForward.dot(scratchToPoint) <= VIEW_CONE_COSINE) continue;

    // Facing it is not enough: a spawn behind the barn is not actually watched.
    fighter.getEyePosition(scratchWatcherEye);
    scratchPointEye.set(point.x, point.y + FIGHTER.standingEyeHeight, point.z);
    if (!collisionWorld.isBlocked(scratchWatcherEye, scratchPointEye)) return true;
  }

  return false;
}

/** Indices of the `count` largest values, written into target. */
function selectHighest(values, count, target) {
  target.length = 0;
  const limit = Math.min(count, values.length);

  for (let rank = 0; rank < limit; rank += 1) {
    let bestIndex = -1;

    for (let index = 0; index < values.length; index += 1) {
      if (target.includes(index)) continue;
      if (bestIndex === -1 || values[index] > values[bestIndex]) bestIndex = index;
    }

    target.push(bestIndex);
  }
}
