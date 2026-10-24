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
import { WORLD, FIGHTER, CONCEALMENT } from '../config/tunables.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

const WHEAT_STEM_RADIUS_BASE = 0.03;
const WHEAT_STEM_RADIUS_TOP = 0.014;
const WHEAT_HEAD_HEIGHT_FRACTION = 0.2;
const WHEAT_HEAD_RADIUS = 0.045;
const WHEAT_STALK_SPACING = 0.35;
const WHEAT_STALK_JITTER = 0.1;
const WHEAT_STALK_LEAN = 0.16;
export const WHEAT_FENCE_MARGIN = 2;
const WHEAT_CLEARANCE_RADIUS = 1;
const WHEAT_CLEARANCE_SAMPLE_SPACING = 1.2;
const WHEAT_PLACEMENT_ATTEMPTS = 400;

/** Idle instances kept in the wheat mesh so patches planted mid-match need no second draw call. */
const WHEAT_SPARE_PATCH_COUNT = 6;

/**
 * Wind. The sway is a vertex displacement only; it never reaches collision or
 * concealment, both of which stay on the static rectangles they always used.
 */
const WIND = {
  directionX: 0.87,
  directionZ: 0.5,
  wheatAmplitude: 0.09,
  cropAmplitude: 0.03
};

const windUniforms = { windTime: { value: 0 } };

/** Advances the shared wind clock. Call once per frame with the match time. */
export function updateWind(elapsedSeconds) {
  windUniforms.windTime.value = elapsedSeconds;
}

/**
 * Injects the sway at <project_vertex>, the one point in the standard program
 * where the instance matrix is already applied: the gust phase can be read off
 * the world position there, and the offset is added in view space so a stalk
 * leans downwind no matter how its instance is rotated. The baked-in constants
 * differ per crop, so customProgramCacheKey has to separate the two programs -
 * the default key is onBeforeCompile.toString(), identical for both closures.
 */
function applyWind(material, stalkHeight, amplitude) {
  const windChunk = `
vec4 mvPosition = vec4( transformed, 1.0 );

#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec2 windSeed = instanceMatrix[ 3 ].xz;
  float windScale = length( instanceMatrix[ 1 ].xyz );
#else
  vec2 windSeed = mvPosition.xz;
  float windScale = 1.0;
#endif

vec3 windWorldPosition = ( modelMatrix * mvPosition ).xyz;
float windPhase = fract( sin( dot( windSeed, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
float windHeight = position.y / ${stalkHeight.toFixed(4)};
windHeight *= windHeight;

float windGust = 0.62 + 0.38 * sin( windTime * 0.21 + dot( windWorldPosition.xz, vec2( 0.035, 0.021 ) ) );
float windRipple =
  0.62 * sin( dot( windWorldPosition.xz, vec2( 0.9, 0.35 ) ) - windTime * 2.1 + windPhase * 6.2831 ) +
  0.38 * sin( dot( windWorldPosition.xz, vec2( -0.3, 1.1 ) ) - windTime * 3.3 + windPhase * 3.1416 );
float windBend = windRipple * windGust * ( 0.7 + 0.6 * windPhase ) * ${amplitude.toFixed(4)} * windHeight * windScale;
vec2 windOffset = vec2( ${WIND.directionX.toFixed(4)}, ${WIND.directionZ.toFixed(4)} ) * windBend;

mvPosition = modelViewMatrix * mvPosition;
mvPosition.xyz += ( viewMatrix * vec4( windOffset.x, 0.0, windOffset.y, 0.0 ) ).xyz;

gl_Position = projectionMatrix * mvPosition;
`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windUniforms.windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace('#include <project_vertex>', windChunk);
  };

  material.customProgramCacheKey = () => `wind:${stalkHeight}:${amplitude}`;
}

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

  applyWind(materials.crop, CROP_HEIGHT, WIND.cropAmplitude);

  return buildInstancedMesh(geometry, materials.crop, plants, false, false);
}

/**
 * Tall standing wheat: the only crop a crouched fighter can hide in.
 *
 * Registers concealment but no collision, so movement and bullets pass
 * straight through. The whole set is one InstancedMesh regardless of patch
 * count, which keeps the draw-call cost at one. The mesh carries spare parked
 * instances beyond the static stalks, so patches planted during the match fill
 * the same mesh instead of adding a draw call.
 *
 * @returns {{
 *   mesh: import('three').InstancedMesh,
 *   allocateStalks: (stalkCount: number) => { firstIndex: number, count: number },
 *   commitStalks: () => void,
 *   markStalksDirty: (firstIndex: number, stalkCount: number) => void
 * }}
 */
export function createWheatPatches(materials, collisionWorld, concealmentField, random) {
  const patches = [];
  let attemptsLeft = WHEAT_PLACEMENT_ATTEMPTS;

  while (patches.length < CONCEALMENT.patchCount) {
    attemptsLeft -= 1;
    if (attemptsLeft < 0) throw new Error('no free ground left for a wheat patch');

    const sizeX = random.range(CONCEALMENT.minimumPatchExtent, CONCEALMENT.maximumPatchExtent);
    const sizeZ = random.range(CONCEALMENT.minimumPatchExtent, CONCEALMENT.maximumPatchExtent);
    const limitX = WORLD.playHalfExtent - sizeX / 2 - WHEAT_FENCE_MARGIN;
    const limitZ = WORLD.playHalfExtent - sizeZ / 2 - WHEAT_FENCE_MARGIN;
    const candidate = {
      centerX: random.range(-limitX, limitX),
      centerZ: random.range(-limitZ, limitZ),
      sizeX,
      sizeZ
    };

    if (overlapsAnyPatch(patches, candidate)) continue;
    if (patchHitsGeometry(collisionWorld, candidate)) continue;

    patches.push(candidate);
  }

  const stalks = [];

  for (const patch of patches) {
    concealmentField.addPatch(patch.centerX, patch.centerZ, patch.sizeX, patch.sizeZ);
    appendStalkPlacements(stalks, patch.centerX, patch.centerZ, patch.sizeX, patch.sizeZ, random);
  }

  applyWind(materials.wheat, CONCEALMENT.cropHeight, WIND.wheatAmplitude);

  const stalksPerMaximumPatch = stalkCountForPatch(
    CONCEALMENT.maximumPatchExtent,
    CONCEALMENT.maximumPatchExtent
  );
  const capacity = stalks.length + WHEAT_SPARE_PATCH_COUNT * stalksPerMaximumPatch;

  const mesh = new THREE.InstancedMesh(createWheatStalkGeometry(), materials.wheat, capacity);
  writeStalkBlock(mesh, stalks, 0, 1);
  parkSpareInstances(mesh, stalks.length);
  mesh.count = stalks.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  /**
   * Hands out a block of the spare instances for stalks planted during the
   * match. Write the block with mesh.setMatrixAt, then call commitStalks.
   */
  function allocateStalks(stalkCount) {
    const firstIndex = mesh.count;
    if (firstIndex + stalkCount > capacity) throw new Error('wheat instance capacity exhausted');
    mesh.count = firstIndex + stalkCount;
    return { firstIndex, count: stalkCount };
  }

  function commitStalks() {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /**
   * The per-frame path for a block that is only changing scale. It uploads
   * that block alone instead of the whole instance buffer, and leaves the
   * bounding sphere untouched: a growing patch stays inside the footprint it
   * already had when commitStalks ran at planting time.
   */
  function markStalksDirty(firstIndex, stalkCount) {
    mesh.instanceMatrix.addUpdateRange(firstIndex * 16, stalkCount * 16);
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, allocateStalks, commitStalks, markStalksDirty };
}

/**
 * Lays a jittered grid of stalks over one patch footprint and appends them to
 * `target`. Shared by the static field and by patches planted during the
 * match, so a planted patch is indistinguishable from a grown one.
 */
export function appendStalkPlacements(target, centerX, centerZ, sizeX, sizeZ, random) {
  const columns = Math.floor(sizeX / WHEAT_STALK_SPACING);
  const rows = Math.floor(sizeZ / WHEAT_STALK_SPACING);
  const originX = centerX - (columns * WHEAT_STALK_SPACING) / 2;
  const originZ = centerZ - (rows * WHEAT_STALK_SPACING) / 2;

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      target.push({
        x: originX + (column + 0.5) * WHEAT_STALK_SPACING + random.range(-WHEAT_STALK_JITTER, WHEAT_STALK_JITTER),
        y: 0,
        z: originZ + (row + 0.5) * WHEAT_STALK_SPACING + random.range(-WHEAT_STALK_JITTER, WHEAT_STALK_JITTER),
        rotationY: random.range(0, Math.PI),
        rotationZ: random.range(-WHEAT_STALK_LEAN, WHEAT_STALK_LEAN),
        scaleX: random.range(0.85, 1.2),
        scaleY: random.range(0.88, 1.12),
        scaleZ: random.range(0.85, 1.2)
      });
    }
  }

  return target;
}

/** How many stalks a patch of this footprint lays down. */
export function stalkCountForPatch(sizeX, sizeZ) {
  return Math.floor(sizeX / WHEAT_STALK_SPACING) * Math.floor(sizeZ / WHEAT_STALK_SPACING);
}

/**
 * Spare instances get a composed zero-scale matrix rather than the buffer's
 * zeroes, whose w of 0 would make the degenerate vertices undefined rather
 * than collapsed.
 */
function parkSpareInstances(mesh, firstIndex) {
  scratchPosition.set(0, 0, 0);
  scratchQuaternion.identity();
  scratchScale.set(0, 0, 0);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);

  for (let index = firstIndex; index < mesh.instanceMatrix.count; index += 1) {
    mesh.setMatrixAt(index, scratchMatrix);
  }
}

/** Tapered stem carrying a spindle-shaped seed head, base sitting at y = 0. */
function createWheatStalkGeometry() {
  const headHeight = CONCEALMENT.cropHeight * WHEAT_HEAD_HEIGHT_FRACTION;
  const stemHeight = CONCEALMENT.cropHeight - headHeight;

  const stem = new THREE.CylinderGeometry(
    WHEAT_STEM_RADIUS_TOP,
    WHEAT_STEM_RADIUS_BASE,
    stemHeight,
    3,
    3,
    true
  );
  stem.translate(0, stemHeight / 2, 0);
  scaleUvs(stem, 1, 4);

  const head = new THREE.LatheGeometry(
    [
      new THREE.Vector2(WHEAT_STEM_RADIUS_TOP, 0),
      new THREE.Vector2(WHEAT_HEAD_RADIUS, headHeight * 0.45),
      new THREE.Vector2(0, headHeight)
    ],
    4
  );
  head.translate(0, stemHeight, 0);

  return mergeGeometries([stem, head]);
}

function overlapsAnyPatch(patches, candidate) {
  for (const patch of patches) {
    const gapX = Math.abs(patch.centerX - candidate.centerX) - (patch.sizeX + candidate.sizeX) / 2;
    const gapZ = Math.abs(patch.centerZ - candidate.centerZ) - (patch.sizeZ + candidate.sizeZ) / 2;
    if (gapX < 0 && gapZ < 0) return true;
  }

  return false;
}

/** Samples the candidate rectangle on a grid; any standing-height obstruction rejects it. */
export function patchHitsGeometry(collisionWorld, candidate) {
  const samplesX = Math.ceil(candidate.sizeX / WHEAT_CLEARANCE_SAMPLE_SPACING);
  const samplesZ = Math.ceil(candidate.sizeZ / WHEAT_CLEARANCE_SAMPLE_SPACING);
  const originX = candidate.centerX - candidate.sizeX / 2;
  const originZ = candidate.centerZ - candidate.sizeZ / 2;

  for (let stepX = 0; stepX <= samplesX; stepX += 1) {
    const x = originX + (stepX / samplesX) * candidate.sizeX;
    for (let stepZ = 0; stepZ <= samplesZ; stepZ += 1) {
      const z = originZ + (stepZ / samplesZ) * candidate.sizeZ;
      const hit = collisionWorld.overlapsAt(
        x,
        WORLD.groundLevel,
        z,
        WHEAT_CLEARANCE_RADIUS,
        FIGHTER.standingHeight
      );
      if (hit) return true;
    }
  }

  return false;
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

  writeStalkBlock(mesh, placements, 0, 1);

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * Writes a block of stalks, scaled uniformly by `growFraction` so a planted
 * patch can rise out of the ground. A fraction of 1 is the mature patch.
 *
 * Indexed rather than iterated: this runs every frame while a patch grows, and
 * `entries()` would allocate a pair array per stalk inside the fixed step.
 */
export function writeStalkBlock(mesh, placements, firstIndex, growFraction) {
  for (let offset = 0; offset < placements.length; offset += 1) {
    const placement = placements[offset];
    scratchPosition.set(placement.x, placement.y, placement.z);
    scratchEuler.set(0, placement.rotationY, placement.rotationZ);
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchScale.set(
      placement.scaleX * growFraction,
      placement.scaleY * growFraction,
      placement.scaleZ * growFraction
    );
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(firstIndex + offset, scratchMatrix);
  }
}
