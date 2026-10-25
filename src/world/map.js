/**
 * Assembles the whole farm and registers all collision geometry.
 *
 * Owned by PH-1-world.
 *
 * @param {{
 *   scene: import('three').Scene,
 *   collisionWorld: import('./collision.js').CollisionWorld,
 *   random: import('../core/rng.js').Random
 * }} context
 * @returns {{
 *   group: import('three').Group,
 *   materials: ReturnType<import('./materials.js').createMaterialLibrary>,
 *   lighting: ReturnType<import('./lighting.js').createLighting>,
 *   coverPoints: import('three').Vector3[],
 *   concealment: import('./concealment.js').ConcealmentField,
 *   wheat: ReturnType<typeof import('./props.js').createWheatPatches>
 * }}
 */

import * as THREE from 'three';
import { WORLD, FIGHTER } from '../config/tunables.js';
import { createMaterialLibrary, createTexturedBox, scaleUvs, mergeByMaterial } from './materials.js';
import { createLighting } from './lighting.js';
import { ConcealmentField } from './concealment.js';
import { createBarn, createGarage, createFarmhouse, createShed } from './buildings.js';
import {
  createFence,
  createHayBales,
  createTractor,
  createCropRows,
  createWheatPatches,
  createTrees,
  createOuterScenery
} from './props.js';

export { updateWind } from './props.js';

/** Far wider than the visual extent so the horizon dissolves into fog, not an edge. */
const GROUND_EXTENT = 260;
const GROUND_TILES_PER_METER = 0.35;

/** How far a cover point stands off the surface it hides behind. */
const COVER_STANDOFF = 0.8;

const SHEDS = [
  { position: [-14, 8], rotation: 0, size: [6, 3.2, 5] },
  { position: [-2, 18], rotation: Math.PI / 2, size: [5, 2.8, 4] },
  { position: [22, -1], rotation: 0, size: [4.5, 2.6, 4] },
  { position: [-25, -14], rotation: Math.PI / 2, size: [5, 3, 4.5] }
];

export function buildFarm({ scene, collisionWorld, random, dayCycleKey, environments }) {
  const materials = createMaterialLibrary();
  const lighting = createLighting(scene, dayCycleKey, environments);

  const group = new THREE.Group();
  group.name = 'farm';

  group.add(createGround(materials));
  group.add(createYardSurfaces(materials));

  collisionWorld.addPlayBoundary();

  const coverPoints = [];
  const concealment = new ConcealmentField();

  addStructure(group, collisionWorld, coverPoints, () => createBarn(materials, collisionWorld));
  addStructure(group, collisionWorld, coverPoints, () => createGarage(materials, collisionWorld));
  addStructure(group, collisionWorld, coverPoints, () => createFarmhouse(materials, collisionWorld));
  for (const shed of SHEDS) {
    addStructure(group, collisionWorld, coverPoints, () => createShed(materials, collisionWorld, shed));
  }
  addStructure(group, collisionWorld, coverPoints, () => createTractor(materials, collisionWorld));

  group.add(createFence(materials, collisionWorld));
  group.add(createHayBales(materials, collisionWorld, random));
  group.add(createCropRows(materials, random));
  group.add(createTrees(materials, collisionWorld, random));
  const wheat = createWheatPatches(materials, collisionWorld, concealment, random);
  group.add(wheat.mesh);
  group.add(createOuterScenery(materials, random));

  scene.add(group);

  return {
    group,
    materials,
    lighting,
    coverPoints: coverPoints.filter((point) => isUsableCoverPoint(point, collisionWorld)),
    concealment,
    wheat
  };
}

function createGround(materials) {
  const geometry = new THREE.PlaneGeometry(GROUND_EXTENT, GROUND_EXTENT);
  geometry.rotateX(-Math.PI / 2);
  scaleUvs(
    geometry,
    GROUND_EXTENT * GROUND_TILES_PER_METER,
    GROUND_EXTENT * GROUND_TILES_PER_METER
  );

  const ground = new THREE.Mesh(geometry, materials.grass);
  ground.position.y = WORLD.groundLevel;
  ground.receiveShadow = true;
  return ground;
}

/** Worn dirt where the farm is actually walked: yard, tracks, garage apron. */
function createYardSurfaces(materials) {
  const patches = [
    [0, -2, 26, 18],
    [1.25, 24, 5.5, 34],
    [-1.25, -26, 5.5, 30],
    [14, -4.5, 14, 6]
  ];

  const parts = patches.map(([centerX, centerZ, sizeX, sizeZ]) => {
    const geometry = createTexturedBox(sizeX, 0.04, sizeZ, 0.35);
    geometry.translate(centerX, 0.02, centerZ);
    return { geometry, material: materials.dirt };
  });

  return mergeByMaterial(parts, false, true);
}

/**
 * Adds a structure and derives its cover points from the collision boxes it
 * registered, so the standing positions follow the geometry rather than a
 * second hand-maintained table.
 */
function addStructure(group, collisionWorld, coverPoints, build) {
  const firstBoxIndex = collisionWorld.boxes.length;
  group.add(build());
  addCoverPointsAround(coverPoints, collisionWorld.boxes, firstBoxIndex);
}

function addCoverPointsAround(coverPoints, boxes, firstBoxIndex) {
  let minimumX = Infinity;
  let minimumZ = Infinity;
  let maximumX = -Infinity;
  let maximumZ = -Infinity;

  for (let index = firstBoxIndex; index < boxes.length; index += 1) {
    const box = boxes[index];
    minimumX = Math.min(minimumX, box.min.x);
    minimumZ = Math.min(minimumZ, box.min.z);
    maximumX = Math.max(maximumX, box.max.x);
    maximumZ = Math.max(maximumZ, box.max.z);
  }

  const spanX = maximumX - minimumX;
  const spanZ = maximumZ - minimumZ;
  const countAlongX = THREE.MathUtils.clamp(Math.round(spanX / 5), 1, 3);
  const countAlongZ = THREE.MathUtils.clamp(Math.round(spanZ / 5), 1, 3);

  for (let index = 0; index < countAlongX; index += 1) {
    const x = minimumX + ((index + 1) / (countAlongX + 1)) * spanX;
    coverPoints.push(new THREE.Vector3(x, WORLD.groundLevel, minimumZ - COVER_STANDOFF));
    coverPoints.push(new THREE.Vector3(x, WORLD.groundLevel, maximumZ + COVER_STANDOFF));
  }

  for (let index = 0; index < countAlongZ; index += 1) {
    const z = minimumZ + ((index + 1) / (countAlongZ + 1)) * spanZ;
    coverPoints.push(new THREE.Vector3(minimumX - COVER_STANDOFF, WORLD.groundLevel, z));
    coverPoints.push(new THREE.Vector3(maximumX + COVER_STANDOFF, WORLD.groundLevel, z));
  }
}

function isUsableCoverPoint(point, collisionWorld) {
  const limit = WORLD.playHalfExtent - 1;
  if (Math.abs(point.x) > limit || Math.abs(point.z) > limit) return false;

  return !collisionWorld.overlapsAt(
    point.x,
    WORLD.groundLevel,
    point.z,
    FIGHTER.radius + 0.15,
    FIGHTER.standingHeight
  );
}
