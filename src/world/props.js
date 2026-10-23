/**
 * Cover and scenery. Fence, crop rows and trees use InstancedMesh (DEC-15);
 * decorative items outside the fence register no collision.
 *
 * Owned by PH-1-world.
 *
 * @param {ReturnType<import('./materials.js').createMaterialLibrary>} materials
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @param {import('../core/rng.js').Random} random
 * @returns {import('three').Object3D}
 */

import * as THREE from 'three';
import { WORLD } from '../config/tunables.js';
import { createTexturedBox, scaleUvs, mergeByMaterial } from './materials.js';

const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YZX');
const scratchScale = new THREE.Vector3();

const FENCE_POST_SPACING = 2.5;
const FENCE_GATE_SPAN_INDEX = 15;

const BALE_LENGTH = 1.4;
const BALE_HEIGHT = 0.8;
const BALE_DEPTH = 0.9;
const STACKED_BALE_LENGTH = 1.6;
const STACKED_BALE_HEIGHT = 0.5;

const CROP_HEIGHT = 0.45;
const CROP_ROW_SPACING = 0.8;
const CROP_PLANT_SPACING = 0.45;

export function createFence(materials, collisionWorld) {
  const extent = WORLD.playHalfExtent;
  const height = WORLD.fenceHeight;
  const spansPerSide = Math.round((extent * 2) / FENCE_POST_SPACING);

  const sides = [
    { originX: -extent, originZ: -extent, directionX: 1, directionZ: 0 },
    { originX: extent, originZ: -extent, directionX: 0, directionZ: 1 },
    { originX: extent, originZ: extent, directionX: -1, directionZ: 0 },
    { originX: -extent, originZ: extent, directionX: 0, directionZ: -1 }
  ];

  const posts = [];
  const rails = [];
  const railHeights = [height * 0.34, height * 0.72];

  for (const [sideIndex, side] of sides.entries()) {
    const rotationY = Math.atan2(-side.directionZ, side.directionX);
    const isGateSide = sideIndex === 0 || sideIndex === 2;

    for (let span = 0; span < spansPerSide; span += 1) {
      const postX = side.originX + side.directionX * span * FENCE_POST_SPACING;
      const postZ = side.originZ + side.directionZ * span * FENCE_POST_SPACING;
      posts.push({ x: postX, y: 0, z: postZ, rotationY, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });

      if (isGateSide && span === FENCE_GATE_SPAN_INDEX) continue;

      const middleX = postX + side.directionX * (FENCE_POST_SPACING / 2);
      const middleZ = postZ + side.directionZ * (FENCE_POST_SPACING / 2);
      for (const railHeight of railHeights) {
        rails.push({
          x: middleX,
          y: railHeight,
          z: middleZ,
          rotationY,
          rotationZ: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1
        });
      }
    }
  }

  for (const sideIndex of [0, 2]) {
    const side = sides[sideIndex];
    const rotationY = Math.atan2(-side.directionZ, side.directionX);
    const spanStartX = side.originX + side.directionX * FENCE_GATE_SPAN_INDEX * FENCE_POST_SPACING;
    const spanStartZ = side.originZ + side.directionZ * FENCE_GATE_SPAN_INDEX * FENCE_POST_SPACING;
    addGateLeaves(posts, rails, spanStartX, spanStartZ, side, rotationY, height);
  }

  const postGeometry = createTexturedBox(0.13, height, 0.13, 1.4);
  postGeometry.translate(0, height / 2, 0);
  const railGeometry = createTexturedBox(FENCE_POST_SPACING, 0.11, 0.06, 1.4);

  const group = new THREE.Group();
  group.add(buildInstancedMesh(postGeometry, materials.wood, posts, true, false));
  group.add(buildInstancedMesh(railGeometry, materials.wood, rails, true, false));
  return group;
}

export function createHayBales(materials, collisionWorld, random) {
  const singlePositions = [
    [-26, -8],
    [-28, 12],
    [-8, 2],
    [0, -20],
    [-6, 22],
    [10, 2],
    [22, -22],
    [26, 10],
    [-34, -20],
    [6, -32],
    [30, 26],
    [-18, -24],
    [18, 20],
    [-2, 10]
  ];

  const stacks = [
    { x: -30, z: -2, rotationY: 0 },
    { x: 12, z: 4, rotationY: Math.PI / 2 },
    { x: -2, z: -24, rotationY: 0 }
  ];

  const uprights = [];
  const flats = [];

  for (const [positionX, positionZ] of singlePositions) {
    const rotationY = random.next() < 0.5 ? 0 : Math.PI / 2;
    uprights.push({
      x: positionX,
      y: 0,
      z: positionZ,
      rotationY,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1
    });
    addRotatedCollisionBox(collisionWorld, positionX, 0, positionZ, BALE_LENGTH, BALE_HEIGHT, BALE_DEPTH, rotationY);
  }

  // Three tiers, each one STEP_RISE-sized riser above the last, so the top is a
  // 1.5 m perch a fighter walks up to rather than jumps onto.
  const tiers = [
    { baseY: 0, offsets: [-1.7, 0, 1.7] },
    { baseY: STACKED_BALE_HEIGHT, offsets: [-0.85, 0.85] },
    { baseY: STACKED_BALE_HEIGHT * 2, offsets: [0] }
  ];

  for (const stack of stacks) {
    const forwardX = Math.cos(stack.rotationY);
    const forwardZ = -Math.sin(stack.rotationY);

    for (const tier of tiers) {
      for (const offset of tier.offsets) {
        flats.push({
          x: stack.x + forwardX * offset,
          y: tier.baseY,
          z: stack.z + forwardZ * offset,
          rotationY: stack.rotationY,
          rotationZ: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1
        });
      }

      const tierLength = (tier.offsets.length - 1) * 1.7 + STACKED_BALE_LENGTH;
      addRotatedCollisionBox(
        collisionWorld,
        stack.x,
        tier.baseY,
        stack.z,
        tierLength,
        STACKED_BALE_HEIGHT,
        BALE_DEPTH,
        stack.rotationY
      );
    }
  }

  const uprightGeometry = createTexturedBox(BALE_LENGTH, BALE_HEIGHT, BALE_DEPTH, 1.6);
  uprightGeometry.translate(0, BALE_HEIGHT / 2, 0);
  const flatGeometry = createTexturedBox(STACKED_BALE_LENGTH, STACKED_BALE_HEIGHT, BALE_DEPTH, 1.6);
  flatGeometry.translate(0, STACKED_BALE_HEIGHT / 2, 0);

  const group = new THREE.Group();
  group.add(buildInstancedMesh(uprightGeometry, materials.hay, uprights, true, true));
  group.add(buildInstancedMesh(flatGeometry, materials.hay, flats, true, true));
  return group;
}

export function createTractor(materials, collisionWorld) {
  const originX = 3;
  const originZ = -10;
  const parts = [];

  addBoxPart(parts, materials.rustedMetal, [originX - 0.3, 0.55, originZ], [3.4, 0.6, 1.05]);
  addBoxPart(parts, materials.rustedMetal, [originX + 1.0, 0.7, originZ], [1.7, 0.95, 1.2]);
  addBoxPart(parts, materials.rustedMetal, [originX - 0.75, 1.15, originZ], [1.5, 0.45, 1.3]);
  addBoxPart(parts, materials.wood, [originX - 0.9, 1.6, originZ], [0.7, 0.5, 0.7]);
  addBoxPart(parts, materials.metal, [originX - 0.7, 2.5, originZ], [1.5, 0.12, 1.5]);

  for (const cornerX of [-1.35, -0.05]) {
    for (const cornerZ of [-0.65, 0.65]) {
      addBoxPart(parts, materials.metal, [originX + cornerX, 1.6, originZ + cornerZ], [0.1, 0.9, 0.1]);
    }
  }

  addCylinderPart(parts, materials.metal, 0.08, 1.3, [originX + 1.75, 1.6, originZ + 0.45], 0);
  addBoxPart(parts, materials.glass, [originX - 0.7, 1.65, originZ - 0.7], [1.3, 0.8, 0.06]);
  addBoxPart(parts, materials.glass, [originX - 0.7, 1.65, originZ + 0.7], [1.3, 0.8, 0.06]);

  for (const wheelZ of [-0.95, 0.95]) {
    addWheelPart(parts, materials.rustedMetal, 0.75, 0.42, [originX - 1.0, 0.75, originZ + wheelZ]);
  }
  for (const wheelZ of [-0.75, 0.75]) {
    addWheelPart(parts, materials.rustedMetal, 0.42, 0.3, [originX + 1.45, 0.42, originZ + wheelZ]);
  }

  collisionWorld.addBoxFromCenterSize(originX + 0.2, 0, originZ, 4.2, 1.6, 2.3);
  collisionWorld.addBoxFromCenterSize(originX - 0.7, 1.6, originZ, 1.5, 1.0, 1.5);

  return mergeByMaterial(parts, true, true);
}

/** Decorative only; crop rows do not block movement or sight. */
export function createCropRows(materials, random) {
  const fields = [
    { minimumX: -36, maximumX: -24, minimumZ: 8, maximumZ: 30, rowsAlongZ: true },
    { minimumX: 6, maximumX: 30, minimumZ: 22, maximumZ: 36, rowsAlongZ: false },
    { minimumX: -18, maximumX: 2, minimumZ: 24, maximumZ: 36, rowsAlongZ: false },
    { minimumX: 24, maximumX: 36, minimumZ: -34, maximumZ: -18, rowsAlongZ: true }
  ];

  const plants = [];

  for (const field of fields) {
    const acrossSpan = field.rowsAlongZ
      ? field.maximumX - field.minimumX
      : field.maximumZ - field.minimumZ;
    const alongSpan = field.rowsAlongZ
      ? field.maximumZ - field.minimumZ
      : field.maximumX - field.minimumX;

    const rowCount = Math.floor(acrossSpan / CROP_ROW_SPACING);
    const plantCount = Math.floor(alongSpan / CROP_PLANT_SPACING);

    for (let row = 0; row < rowCount; row += 1) {
      const across = (row + 0.5) * CROP_ROW_SPACING;
      for (let plant = 0; plant < plantCount; plant += 1) {
        const along = (plant + 0.5) * CROP_PLANT_SPACING;
        const x = field.rowsAlongZ ? field.minimumX + across : field.minimumX + along;
        const z = field.rowsAlongZ ? field.minimumZ + along : field.minimumZ + across;

        plants.push({
          x: x + random.range(-0.08, 0.08),
          y: 0,
          z: z + random.range(-0.08, 0.08),
          rotationY: random.range(0, Math.PI),
          rotationZ: random.range(-0.08, 0.08),
          scaleX: random.range(0.8, 1.2),
          scaleY: random.range(0.75, 1.15),
          scaleZ: random.range(0.8, 1.2)
        });
      }
    }
  }

  const geometry = new THREE.ConeGeometry(0.1, CROP_HEIGHT, 4, 1);
  geometry.translate(0, CROP_HEIGHT / 2, 0);

  return buildInstancedMesh(geometry, materials.crop, plants, false, false);
}

export function createTrees(materials, collisionWorld, random) {
  const anchors = [
    [-34, -32],
    [-25, -27],
    [-34, -12],
    [-33, 0],
    [-21, 4],
    [-10, -26],
    [2, -28],
    [15, -29],
    [20, -34],
    [34, -14],
    [33, 6],
    [30, 20],
    [33, 30],
    [-21, 33],
    [-22, 24],
    [4, 8]
  ];

  const placements = anchors.map(([anchorX, anchorZ]) => ({
    x: anchorX + random.range(-1, 1),
    z: anchorZ + random.range(-1, 1),
    scale: random.range(0.85, 1.25),
    rotationY: random.range(0, Math.PI * 2)
  }));

  for (const placement of placements) {
    collisionWorld.addBoxFromCenterSize(placement.x, 0, placement.z, 0.9, 3.4, 0.9);
  }

  return buildTreeGroup(materials, random, placements, true);
}

/** Everything between the fence and the visual extent: fields, treeline, hills. */
export function createOuterScenery(materials, random) {
  const group = new THREE.Group();
  const innerBand = WORLD.playHalfExtent + 4;
  const outerBand = WORLD.visualHalfExtent - 2;

  const placements = [];
  const sides = [
    { directionX: 1, directionZ: 0, normalX: 0, normalZ: -1 },
    { directionX: 0, directionZ: 1, normalX: 1, normalZ: 0 },
    { directionX: 1, directionZ: 0, normalX: 0, normalZ: 1 },
    { directionX: 0, directionZ: 1, normalX: -1, normalZ: 0 }
  ];

  for (const side of sides) {
    for (let step = 0; step < 34; step += 1) {
      for (let row = 0; row < 2; row += 1) {
        const along = -outerBand + step * ((outerBand * 2) / 34) + random.range(-1.4, 1.4);
        const depth = innerBand + row * ((outerBand - innerBand) / 2) + random.range(0, 6);
        placements.push({
          x: side.directionX * along + side.normalX * depth,
          z: side.directionZ * along + side.normalZ * depth,
          scale: random.range(1.0, 1.7),
          rotationY: random.range(0, Math.PI * 2)
        });
      }
    }
  }

  group.add(buildTreeGroup(materials, random, placements, false));

  const terrainParts = [];
  const hills = [
    [-54, -54, 18],
    [54, -54, 16],
    [54, 54, 19],
    [-54, 54, 17],
    [0, -58, 20],
    [0, 58, 20]
  ];

  for (const [hillX, hillZ, radius] of hills) {
    const geometry = new THREE.SphereGeometry(radius, 12, 7);
    geometry.scale(1, 0.3, 1);
    scaleUvs(geometry, 6, 6);
    geometry.translate(hillX, -radius * 0.14, hillZ);
    terrainParts.push({ geometry, material: materials.grass });
  }

  const outerFields = [
    [-46, 30, 22, 14],
    [46, -28, 20, 16],
    [12, 48, 30, 14],
    [-20, -50, 26, 12]
  ];

  for (const [fieldX, fieldZ, sizeX, sizeZ] of outerFields) {
    const geometry = createTexturedBox(sizeX, 0.06, sizeZ, 0.6);
    geometry.translate(fieldX, 0.03, fieldZ);
    terrainParts.push({ geometry, material: materials.crop });
  }

  group.add(mergeByMaterial(terrainParts, false, false));
  return group;
}

function buildTreeGroup(materials, random, placements, castShadow) {
  const trunkHeight = 4.6;
  const trunkGeometry = new THREE.CylinderGeometry(0.26, 0.42, trunkHeight, 7, 1);
  trunkGeometry.translate(0, trunkHeight / 2, 0);
  scaleUvs(trunkGeometry, 2, 2);

  const foliageGeometry = new THREE.IcosahedronGeometry(1, 0);
  scaleUvs(foliageGeometry, 2, 2);

  const trunks = [];
  const canopies = [];

  for (const placement of placements) {
    trunks.push({
      x: placement.x,
      y: 0,
      z: placement.z,
      rotationY: placement.rotationY,
      rotationZ: 0,
      scaleX: placement.scale,
      scaleY: placement.scale,
      scaleZ: placement.scale
    });

    const canopyCount = 2;
    for (let blob = 0; blob < canopyCount; blob += 1) {
      const angle = random.range(0, Math.PI * 2);
      const spread = random.range(0, 0.7) * placement.scale;
      canopies.push({
        x: placement.x + Math.cos(angle) * spread,
        y: (trunkHeight * 0.82 + blob * 1.1) * placement.scale,
        z: placement.z + Math.sin(angle) * spread,
        rotationY: random.range(0, Math.PI * 2),
        rotationZ: random.range(0, Math.PI * 2),
        scaleX: random.range(1.9, 2.7) * placement.scale,
        scaleY: random.range(1.4, 2.0) * placement.scale,
        scaleZ: random.range(1.9, 2.7) * placement.scale
      });
    }
  }

  const group = new THREE.Group();
  group.add(buildInstancedMesh(trunkGeometry, materials.bark, trunks, castShadow, false));
  group.add(buildInstancedMesh(foliageGeometry, materials.foliage, canopies, castShadow, false));
  return group;
}

function addGateLeaves(posts, rails, spanStartX, spanStartZ, side, rotationY, height) {
  const leafWidth = FENCE_POST_SPACING / 2;
  const stileScale = (height * 0.85) / height;

  for (let leaf = 0; leaf < 2; leaf += 1) {
    const leafCenter = (leaf + 0.5) * leafWidth;
    const centerX = spanStartX + side.directionX * leafCenter;
    const centerZ = spanStartZ + side.directionZ * leafCenter;

    for (const stileOffset of [-leafWidth / 2 + 0.07, leafWidth / 2 - 0.07]) {
      posts.push({
        x: centerX + side.directionX * stileOffset,
        y: 0.14,
        z: centerZ + side.directionZ * stileOffset,
        rotationY,
        rotationZ: 0,
        scaleX: 0.7,
        scaleY: stileScale,
        scaleZ: 0.7
      });
    }

    for (const railHeight of [0.3, 0.75, 1.2]) {
      rails.push({
        x: centerX,
        y: railHeight,
        z: centerZ,
        rotationY,
        rotationZ: 0,
        scaleX: leafWidth / FENCE_POST_SPACING,
        scaleY: 1,
        scaleZ: 1
      });
    }

    const braceLength = Math.hypot(leafWidth, 0.9);
    rails.push({
      x: centerX,
      y: 0.75,
      z: centerZ,
      rotationY,
      rotationZ: Math.atan2(0.9, leafWidth) * (leaf === 0 ? 1 : -1),
      scaleX: braceLength / FENCE_POST_SPACING,
      scaleY: 1,
      scaleZ: 1
    });
  }
}

function addBoxPart(parts, material, position, size) {
  const geometry = createTexturedBox(size[0], size[1], size[2], 1.2);
  geometry.translate(position[0], position[1] + size[1] / 2, position[2]);
  parts.push({ geometry, material });
}

function addCylinderPart(parts, material, radius, height, position, rotationX) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 8, 1);
  scaleUvs(geometry, 2, 2);
  geometry.rotateX(rotationX);
  geometry.translate(position[0], position[1] + height / 2, position[2]);
  parts.push({ geometry, material });
}

function addWheelPart(parts, material, radius, width, position) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 12, 1);
  scaleUvs(geometry, 3, 1);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(position[0], position[1], position[2]);
  parts.push({ geometry, material });
}

function addRotatedCollisionBox(collisionWorld, centerX, baseY, centerZ, sizeX, sizeY, sizeZ, rotationY) {
  const cosine = Math.abs(Math.cos(rotationY));
  const sine = Math.abs(Math.sin(rotationY));
  collisionWorld.addBoxFromCenterSize(
    centerX,
    baseY,
    centerZ,
    sizeX * cosine + sizeZ * sine,
    sizeY,
    sizeX * sine + sizeZ * cosine
  );
}

/**
 * Builds the mesh from collected placements. The bounding sphere is computed
 * explicitly: the automatic one only covers origin-centred geometry and would
 * cull the whole mesh as soon as the camera looks away from the world origin.
 */
function buildInstancedMesh(geometry, material, placements, castShadow, receiveShadow) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);

  for (const [index, placement] of placements.entries()) {
    scratchPosition.set(placement.x, placement.y, placement.z);
    scratchEuler.set(0, placement.rotationY, placement.rotationZ);
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchScale.set(placement.scaleX, placement.scaleY, placement.scaleZ);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}
