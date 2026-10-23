/**
 * Farm buildings. Barn and garage are enterable (DEC-3): they have doorways,
 * window openings and interior walls, and each wall segment is registered with
 * the collision world separately so a fighter can walk through the gaps.
 * House and sheds are solid volumes.
 *
 * Owned by PH-1-world.
 *
 * Each factory adds its own collision boxes and returns the visual group.
 *
 * @param {ReturnType<import('./materials.js').createMaterialLibrary>} materials
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @returns {import('three').Group}
 */

import * as THREE from 'three';
import { WORLD } from '../config/tunables.js';
import { createTexturedBox, mergeByMaterial } from './materials.js';

const WALL_TILES_PER_METER = 1;
const ROOF_TILES_PER_METER = 0.55;

/**
 * Rise of one climbing step. Kept below WORLD.stepHeight so a fighter walks up
 * a stair without jumping; a surface sized against the 0.5 m threshold exactly
 * would sit on the comparison boundary.
 */
const STEP_RISE = 0.45;
const STEP_RUN = 0.85;

export function createBarn(materials, collisionWorld) {
  const builder = new StructureBuilder(collisionWorld);

  const minimumX = -20;
  const maximumX = -4;
  const minimumZ = -16;
  const maximumZ = -4;
  const thickness = 0.3;
  const wallHeight = 6;
  const gableRise = 3;

  const centerX = (minimumX + maximumX) / 2;
  const centerZ = (minimumZ + maximumZ) / 2;
  const interiorMinimumX = minimumX + thickness;
  const interiorMaximumX = maximumX - thickness;
  const spanZ = maximumZ - minimumZ;

  // Gable end walls, running the full depth.
  builder.solid(materials.paintedWood, [minimumX + thickness / 2, 0, centerZ], [thickness, wallHeight, spanZ]);
  builder.solid(materials.paintedWood, [maximumX - thickness / 2, 0, centerZ], [thickness, wallHeight, spanZ]);

  // Front long wall with the main doorway: 4 m wide, 4.2 m tall.
  const frontZ = maximumZ - thickness / 2;
  const frontDoorMinimumX = -14;
  const frontDoorMaximumX = -10;
  const frontDoorHeight = 4.2;
  addWallSegment(builder, materials.paintedWood, interiorMinimumX, frontDoorMinimumX, frontZ, thickness, wallHeight);
  addWallSegment(builder, materials.paintedWood, frontDoorMaximumX, interiorMaximumX, frontZ, thickness, wallHeight);
  addLintel(builder, materials.paintedWood, frontDoorMinimumX, frontDoorMaximumX, frontZ, thickness, frontDoorHeight, wallHeight);

  // Rear long wall: a second doorway makes the barn a through route, plus a
  // loft opening a fighter can step out of and drop from.
  const rearZ = minimumZ + thickness / 2;
  const rearDoorMinimumX = -13.75;
  const rearDoorMaximumX = -10.25;
  const rearDoorHeight = 4;
  const loftOpeningMinimumX = -19;
  const loftOpeningMaximumX = -16;
  const loftHeight = STEP_RISE * 6;
  const loftSlabThickness = 0.18;
  const loftOpeningTop = loftHeight + 2.1;

  addWallSegment(builder, materials.paintedWood, interiorMinimumX, loftOpeningMinimumX, rearZ, thickness, wallHeight);
  addWallSegment(builder, materials.paintedWood, loftOpeningMinimumX, loftOpeningMaximumX, rearZ, thickness, loftHeight);
  addLintel(builder, materials.paintedWood, loftOpeningMinimumX, loftOpeningMaximumX, rearZ, thickness, loftOpeningTop, wallHeight);
  addWallSegment(builder, materials.paintedWood, loftOpeningMaximumX, rearDoorMinimumX, rearZ, thickness, wallHeight);
  addLintel(builder, materials.paintedWood, rearDoorMinimumX, rearDoorMaximumX, rearZ, thickness, rearDoorHeight, wallHeight);
  addWallSegment(builder, materials.paintedWood, rearDoorMaximumX, interiorMaximumX, rearZ, thickness, wallHeight);

  // Hayloft over the rear third of the interior.
  const loftEdgeZ = -11;
  const loftSpanZ = loftEdgeZ - (minimumZ + thickness);
  const loftSpanX = interiorMaximumX - interiorMinimumX;
  builder.solid(
    materials.wood,
    [centerX, loftHeight - loftSlabThickness, loftEdgeZ - loftSpanZ / 2],
    [loftSpanX, loftSlabThickness, loftSpanZ]
  );

  for (const postX of [-17, -8.5]) {
    builder.solid(materials.wood, [postX, 0, loftEdgeZ], [0.3, loftHeight - loftSlabThickness, 0.3]);
  }

  // Stair up to the loft, hugging the east side so the doorway axis stays clear.
  addStair(builder, materials.wood, {
    axis: 'z',
    topX: -5.6,
    topZ: loftEdgeZ,
    direction: 1,
    width: 2.4,
    stepCount: 6
  });

  // Gable triangles sit above the wall top, out of reach, so they carry no
  // collision and their window openings are pure geometry.
  const gableWindows = [
    [-2, 0.9, 0.65, 0.5],
    [2, 0.9, 0.65, 0.5]
  ];
  builder.gable(materials.paintedWood, [minimumX + thickness / 2, wallHeight, centerZ], spanZ / 2, gableRise, thickness, Math.PI / 2, gableWindows);
  builder.gable(materials.paintedWood, [maximumX - thickness / 2, wallHeight, centerZ], spanZ / 2, gableRise, thickness, Math.PI / 2, gableWindows);

  addPitchedRoof(builder, materials.roof, {
    centerX,
    ridgeZ: centerZ,
    halfSpan: spanZ / 2,
    eaveHeight: wallHeight,
    rise: gableRise,
    lengthX: maximumX - minimumX + 1,
    thickness: 0.22,
    overhang: 0.5
  });

  builder.box(materials.wood, [centerX, wallHeight + gableRise - 0.05, centerZ], [maximumX - minimumX + 1.2, 0.26, 0.7]);

  addDoorFrame(builder, materials.wood, frontDoorMinimumX, frontDoorMaximumX, frontZ, thickness, frontDoorHeight);
  addDoorFrame(builder, materials.wood, rearDoorMinimumX, rearDoorMaximumX, rearZ, thickness, rearDoorHeight);

  // Sliding door parked open beside the main entrance.
  builder.box(materials.wood, [frontDoorMinimumX - 2.1, 0.15, maximumZ + 0.12], [4, frontDoorHeight, 0.14]);
  builder.box(materials.metal, [frontDoorMinimumX - 0.1, frontDoorHeight + 0.2, maximumZ + 0.12], [8.4, 0.14, 0.2]);

  return builder.finish(true, true);
}

export function createGarage(materials, collisionWorld) {
  const builder = new StructureBuilder(collisionWorld);

  const minimumX = 8;
  const maximumX = 20;
  const minimumZ = -16.5;
  const maximumZ = -7.5;
  const thickness = 0.3;
  const wallHeight = 3;
  const roofThickness = 0.2;
  const roofOverhang = 0.4;

  const centerX = (minimumX + maximumX) / 2;
  const centerZ = (minimumZ + maximumZ) / 2;
  const interiorMinimumX = minimumX + thickness;
  const interiorMaximumX = maximumX - thickness;
  const spanZ = maximumZ - minimumZ;

  builder.solid(materials.wood, [minimumX + thickness / 2, 0, centerZ], [thickness, wallHeight, spanZ]);
  builder.solid(materials.wood, [maximumX - thickness / 2, 0, centerZ], [thickness, wallHeight, spanZ]);

  // Rear wall is closed; the vehicle opening faces the yard.
  const rearZ = minimumZ + thickness / 2;
  addWallSegment(builder, materials.wood, interiorMinimumX, interiorMaximumX, rearZ, thickness, wallHeight);

  const frontZ = maximumZ - thickness / 2;
  const openingMinimumX = 11;
  const openingMaximumX = 17;
  const openingHeight = 2.5;
  addWallSegment(builder, materials.wood, interiorMinimumX, openingMinimumX, frontZ, thickness, wallHeight);
  addWallSegment(builder, materials.wood, openingMaximumX, interiorMaximumX, frontZ, thickness, wallHeight);
  addLintel(builder, materials.wood, openingMinimumX, openingMaximumX, frontZ, thickness, openingHeight, wallHeight);

  builder.solid(
    materials.rustedMetal,
    [centerX, wallHeight, centerZ],
    [maximumX - minimumX + roofOverhang * 2, roofThickness, spanZ + roofOverhang * 2],
    ROOF_TILES_PER_METER
  );

  for (const pillarX of [12, 16]) {
    builder.solid(materials.wood, [pillarX, 0, -12], [0.4, wallHeight, 0.4]);
  }

  // Outside stair to the roof: seven 0.45 m risers, then a 0.05 m step onto
  // the roof slab. A vantage over the yard that costs a deliberate climb.
  addStair(builder, materials.wood, {
    axis: 'z',
    topX: centerX,
    topZ: minimumZ - roofOverhang,
    direction: -1,
    width: 2.2,
    stepCount: 7
  });

  builder.box(materials.metal, [centerX, openingHeight, maximumZ + 0.06], [openingMaximumX - openingMinimumX + 0.4, 0.22, 0.18]);
  builder.box(materials.rustedMetal, [maximumX - 2.2, 0, maximumZ + 0.1], [1.6, 2.2, 0.12]);

  return builder.finish(true, true);
}

export function createFarmhouse(materials, collisionWorld) {
  const builder = new StructureBuilder(collisionWorld);

  const minimumX = 7;
  const maximumX = 17;
  const minimumZ = 10;
  const maximumZ = 18;
  const wallHeight = 6;
  const storeyHeight = 3;
  const gableRise = 3;

  const centerX = (minimumX + maximumX) / 2;
  const centerZ = (minimumZ + maximumZ) / 2;
  const spanX = maximumX - minimumX;
  const spanZ = maximumZ - minimumZ;

  // Solid volume: no interior, so one box carries the whole body.
  collisionWorld.addBoxFromCenterSize(centerX, 0, centerZ, spanX, wallHeight, spanZ);

  builder.box(materials.stone, [centerX, 0, centerZ], [spanX, storeyHeight, spanZ]);
  builder.box(materials.wood, [centerX, storeyHeight, centerZ], [spanX + 0.1, wallHeight - storeyHeight, spanZ + 0.1]);
  builder.box(materials.wood, [centerX, storeyHeight - 0.12, centerZ], [spanX + 0.35, 0.24, spanZ + 0.35]);

  for (const windowX of [-3, 0, 3]) {
    builder.box(materials.glass, [centerX + windowX, 1.1, minimumZ - 0.06], [1.1, 1.5, 0.1]);
    builder.box(materials.glass, [centerX + windowX, 4.1, minimumZ - 0.11], [1.1, 1.4, 0.1]);
    builder.box(materials.wood, [centerX + windowX, 0.95, minimumZ - 0.14], [1.4, 1.8, 0.12]);
    builder.box(materials.wood, [centerX + windowX, 3.95, minimumZ - 0.18], [1.4, 1.7, 0.12]);
  }
  for (const windowZ of [-2, 2]) {
    builder.box(materials.glass, [maximumX + 0.06, 4.1, centerZ + windowZ], [0.1, 1.4, 1.1]);
    builder.box(materials.wood, [maximumX + 0.12, 3.95, centerZ + windowZ], [0.12, 1.7, 1.4]);
  }

  // Porch: exterior cover with a low step a fighter walks straight onto.
  const porchDepth = 2.4;
  const porchMinimumZ = minimumZ - porchDepth;
  const porchHeight = 2.6;
  builder.solid(materials.wood, [centerX, 0, porchMinimumZ + porchDepth / 2], [spanX, 0.25, porchDepth]);
  builder.solid(
    materials.wood,
    [centerX, porchHeight, porchMinimumZ + porchDepth / 2],
    [spanX + 0.6, 0.2, porchDepth + 0.4]
  );
  for (const postX of [minimumX + 0.6, centerX - 1.8, centerX + 1.8, maximumX - 0.6]) {
    builder.solid(materials.wood, [postX, 0.25, porchMinimumZ + 0.4], [0.22, porchHeight - 0.25, 0.22]);
  }

  const gableWindows = [[0, 1.1, 0.5, 0.45]];
  builder.gable(materials.wood, [minimumX, wallHeight, centerZ], spanZ / 2, gableRise, 0.3, Math.PI / 2, gableWindows);
  builder.gable(materials.wood, [maximumX, wallHeight, centerZ], spanZ / 2, gableRise, 0.3, Math.PI / 2, gableWindows);

  addPitchedRoof(builder, materials.roof, {
    centerX,
    ridgeZ: centerZ,
    halfSpan: spanZ / 2,
    eaveHeight: wallHeight,
    rise: gableRise,
    lengthX: spanX + 0.9,
    thickness: 0.2,
    overhang: 0.45
  });

  builder.box(materials.stone, [maximumX - 2, wallHeight, centerZ - 1.5], [1.1, gableRise + 1.4, 1.1]);

  return builder.finish(true, true);
}

/** @param {{ position: [number, number], rotation: number, size: [number, number, number] }} options */
export function createShed(materials, collisionWorld, options) {
  const builder = new StructureBuilder(collisionWorld);

  const [positionX, positionZ] = options.position;
  const rotation = options.rotation;
  const [sizeX, sizeY, sizeZ] = options.size;
  const thickness = 0.18;
  const gableRise = 0.7;

  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;

  // Built around the origin, then placed by the group transform, so the
  // geometry stays axis aligned and merges cleanly.
  builder.box(materials.wood, [-halfX + thickness / 2, 0, 0], [thickness, sizeY, sizeZ]);
  builder.box(materials.wood, [halfX - thickness / 2, 0, 0], [thickness, sizeY, sizeZ]);
  builder.box(materials.wood, [0, 0, -halfZ + thickness / 2], [sizeX - thickness * 2, sizeY, thickness]);

  const doorWidth = Math.min(1.4, sizeX - 1.2);
  const frontZ = halfZ - thickness / 2;
  builder.box(materials.wood, [-(sizeX - thickness * 2 - doorWidth) / 4 - doorWidth / 2, 0, frontZ], [(sizeX - thickness * 2 - doorWidth) / 2, sizeY, thickness]);
  builder.box(materials.wood, [(sizeX - thickness * 2 - doorWidth) / 4 + doorWidth / 2, 0, frontZ], [(sizeX - thickness * 2 - doorWidth) / 2, sizeY, thickness]);
  builder.box(materials.rustedMetal, [0, 0.05, halfZ + 0.04], [doorWidth, sizeY - 0.2, 0.1]);

  builder.gable(materials.wood, [-halfX + thickness / 2, sizeY, 0], halfZ, gableRise, thickness, Math.PI / 2, []);
  builder.gable(materials.wood, [halfX - thickness / 2, sizeY, 0], halfZ, gableRise, thickness, Math.PI / 2, []);

  addPitchedRoof(builder, materials.rustedMetal, {
    centerX: 0,
    ridgeZ: 0,
    halfSpan: halfZ,
    eaveHeight: sizeY,
    rise: gableRise,
    lengthX: sizeX + 0.5,
    thickness: 0.14,
    overhang: 0.35
  });

  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  collisionWorld.addBoxFromCenterSize(
    positionX,
    WORLD.groundLevel,
    positionZ,
    sizeX * cosine + sizeZ * sine,
    sizeY,
    sizeX * sine + sizeZ * cosine
  );

  const group = builder.finish(true, true);
  group.position.set(positionX, WORLD.groundLevel, positionZ);
  group.rotation.y = rotation;
  return group;
}

/**
 * Collects textured boxes per material and merges them once, so a whole
 * building costs one draw call per material rather than one per plank.
 *
 * Box arguments are [centerX, baseY, centerZ] and [sizeX, sizeY, sizeZ]; the
 * vertical component is a base rather than a centre, matching
 * CollisionWorld.addBoxFromCenterSize.
 */
class StructureBuilder {
  constructor(collisionWorld) {
    this.collisionWorld = collisionWorld;
    this.parts = [];
  }

  box(material, position, size, tilesPerMeter = WALL_TILES_PER_METER) {
    const geometry = createTexturedBox(size[0], size[1], size[2], tilesPerMeter);
    geometry.translate(position[0], position[1] + size[1] / 2, position[2]);
    this.parts.push({ geometry, material });
  }

  solid(material, position, size, tilesPerMeter = WALL_TILES_PER_METER) {
    this.box(material, position, size, tilesPerMeter);
    this.collisionWorld.addBoxFromCenterSize(
      position[0],
      position[1],
      position[2],
      size[0],
      size[1],
      size[2]
    );
  }

  /** Centre rather than base, because a tilted slab has no flat footprint. */
  tiltedSlab(material, center, size, rotationX) {
    const geometry = createTexturedBox(size[0], size[1], size[2], ROOF_TILES_PER_METER);
    geometry.rotateX(rotationX);
    geometry.translate(center[0], center[1], center[2]);
    this.parts.push({ geometry, material });
  }

  /**
   * Triangular end wall. windows are [centerX, centerY, halfWidth, halfHeight]
   * in the triangle's own plane, cut as real holes.
   */
  gable(material, center, halfWidth, height, depth, rotationY, windows) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(0, height);
    shape.closePath();

    for (const opening of windows) {
      const hole = new THREE.Path();
      hole.moveTo(opening[0] - opening[2], opening[1] - opening[3]);
      hole.lineTo(opening[0] + opening[2], opening[1] - opening[3]);
      hole.lineTo(opening[0] + opening[2], opening[1] + opening[3]);
      hole.lineTo(opening[0] - opening[2], opening[1] + opening[3]);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    geometry.rotateY(rotationY);
    geometry.translate(center[0], center[1], center[2]);
    this.parts.push({ geometry, material });
  }

  finish(castShadow, receiveShadow) {
    return mergeByMaterial(this.parts, castShadow, receiveShadow);
  }
}

function addWallSegment(builder, material, fromX, toX, centerZ, thickness, height) {
  builder.solid(material, [(fromX + toX) / 2, 0, centerZ], [toX - fromX, height, thickness]);
}

function addLintel(builder, material, fromX, toX, centerZ, thickness, openingHeight, wallHeight) {
  builder.solid(
    material,
    [(fromX + toX) / 2, openingHeight, centerZ],
    [toX - fromX, wallHeight - openingHeight, thickness]
  );
}

function addDoorFrame(builder, material, fromX, toX, centerZ, thickness, openingHeight) {
  const frameDepth = thickness + 0.12;
  builder.box(material, [fromX - 0.12, 0, centerZ], [0.24, openingHeight + 0.24, frameDepth]);
  builder.box(material, [toX + 0.12, 0, centerZ], [0.24, openingHeight + 0.24, frameDepth]);
  builder.box(material, [(fromX + toX) / 2, openingHeight, centerZ], [toX - fromX + 0.48, 0.24, frameDepth]);
}

/**
 * Stair of STEP_RISE risers. The top tread lands flush with (topX, topZ) and
 * the flight descends along the given axis in the given direction.
 */
function addStair(builder, material, { axis, topX, topZ, direction, width, stepCount }) {
  for (let step = 0; step < stepCount; step += 1) {
    const height = (stepCount - step) * STEP_RISE;
    const offset = (step + 0.5) * STEP_RUN * direction;

    if (axis === 'z') {
      builder.solid(material, [topX, 0, topZ + offset], [width, height, STEP_RUN]);
    } else {
      builder.solid(material, [topX + offset, 0, topZ], [STEP_RUN, height, width]);
    }
  }
}

function addPitchedRoof(builder, material, options) {
  const { centerX, ridgeZ, halfSpan, eaveHeight, rise, lengthX, thickness, overhang } = options;
  const slopeLength = Math.hypot(halfSpan, rise);
  const cosine = halfSpan / slopeLength;
  const sine = rise / slopeLength;
  const angle = Math.atan2(rise, halfSpan);

  for (const direction of [1, -1]) {
    const centerZ =
      ridgeZ + direction * (halfSpan / 2 + (overhang / 2) * cosine + (thickness / 2) * sine);
    const centerY = eaveHeight + rise / 2 - (overhang / 2) * sine + (thickness / 2) * cosine;
    builder.tiltedSlab(
      material,
      [centerX, centerY, centerZ],
      [lengthX, thickness, slopeLength + overhang],
      direction * angle
    );
  }
}
