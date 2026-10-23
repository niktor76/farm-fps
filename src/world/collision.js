import * as THREE from 'three';
import { WORLD } from '../config/tunables.js';

const scratchRay = new THREE.Ray();
const scratchDirection = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();

/**
 * Static collision registry.
 *
 * The world is a flat list of axis aligned boxes. Fighters are a circle of
 * FIGHTER.radius in the ground plane plus a vertical span, which makes every
 * query a cheap circle-versus-rectangle or ray-versus-box test. At roughly a
 * hundred boxes and ten movers a brute force scan costs far less than
 * maintaining a spatial index, and it keeps step-up behaviour under direct
 * control instead of falling out of a physics engine's slope heuristic.
 */
export class CollisionWorld {
  constructor() {
    this.boxes = [];
  }

  clear() {
    this.boxes.length = 0;
  }

  addBox(box) {
    this.boxes.push(box);
    return box;
  }

  addBoxFromCenterSize(centerX, centerY, centerZ, sizeX, sizeY, sizeZ) {
    const halfX = sizeX / 2;
    const halfZ = sizeZ / 2;
    return this.addBox(
      new THREE.Box3(
        new THREE.Vector3(centerX - halfX, centerY, centerZ - halfZ),
        new THREE.Vector3(centerX + halfX, centerY + sizeY, centerZ + halfZ)
      )
    );
  }

  /** The four fence walls that bound the play area. */
  addPlayBoundary() {
    const extent = WORLD.playHalfExtent;
    const thickness = 0.4;
    const span = extent * 2 + thickness * 2;
    const height = WORLD.fenceHeight;

    this.addBoxFromCenterSize(0, 0, -extent, span, height, thickness);
    this.addBoxFromCenterSize(0, 0, extent, span, height, thickness);
    this.addBoxFromCenterSize(-extent, 0, 0, thickness, height, span);
    this.addBoxFromCenterSize(extent, 0, 0, thickness, height, span);
  }

  /**
   * Pushes a circle out of every box it overlaps, in the ground plane only.
   *
   * A box whose top sits no higher than feetY + WORLD.stepHeight is treated as
   * walkable rather than solid, which is what gives free step-up onto hay
   * bales and door sills without a dedicated stair system.
   */
  resolveHorizontal(position, radius, feetY, height) {
    const stepCeiling = feetY + WORLD.stepHeight;
    const headY = feetY + height;

    for (const box of this.boxes) {
      if (box.max.y <= stepCeiling) continue;
      if (box.min.y >= headY) continue;

      const closestX = clamp(position.x, box.min.x, box.max.x);
      const closestZ = clamp(position.z, box.min.z, box.max.z);
      const offsetX = position.x - closestX;
      const offsetZ = position.z - closestZ;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;

      if (distanceSquared >= radius * radius) continue;

      if (distanceSquared > 1e-8) {
        const distance = Math.sqrt(distanceSquared);
        const push = radius - distance;
        position.x += (offsetX / distance) * push;
        position.z += (offsetZ / distance) * push;
        continue;
      }

      // Centre is inside the rectangle: leave by the nearest face.
      const toMinX = position.x - box.min.x;
      const toMaxX = box.max.x - position.x;
      const toMinZ = position.z - box.min.z;
      const toMaxZ = box.max.z - position.z;
      const smallest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

      if (smallest === toMinX) position.x = box.min.x - radius;
      else if (smallest === toMaxX) position.x = box.max.x + radius;
      else if (smallest === toMinZ) position.z = box.min.z - radius;
      else position.z = box.max.z + radius;
    }
  }

  /** Highest surface under the circle at or below ceilingY. */
  groundHeightAt(x, z, radius, ceilingY) {
    let highest = WORLD.groundLevel;

    for (const box of this.boxes) {
      if (box.max.y > ceilingY) continue;
      if (box.max.y <= highest) continue;
      if (!circleOverlapsBoxFootprint(x, z, radius, box)) continue;
      highest = box.max.y;
    }

    return highest;
  }

  /** Lowest surface above floorY, or Infinity when nothing is overhead. */
  ceilingHeightAt(x, z, radius, floorY) {
    let lowest = Infinity;

    for (const box of this.boxes) {
      if (box.min.y < floorY) continue;
      if (box.min.y >= lowest) continue;
      if (!circleOverlapsBoxFootprint(x, z, radius, box)) continue;
      lowest = box.min.y;
    }

    return lowest;
  }

  /** True when a standing capsule at this spot would intersect geometry. */
  overlapsAt(x, y, z, radius, height) {
    const headY = y + height;

    for (const box of this.boxes) {
      if (box.max.y <= y + WORLD.stepHeight) continue;
      if (box.min.y >= headY) continue;
      if (circleOverlapsBoxFootprint(x, z, radius, box)) return true;
    }

    return false;
  }

  /**
   * Nearest box hit along a ray.
   * Returns the hit distance, or Infinity when the ray reaches maximumDistance
   * unobstructed. When a hit occurs, hitPoint receives the impact position.
   */
  raycast(origin, direction, maximumDistance, hitPoint = null) {
    scratchRay.origin.copy(origin);
    scratchRay.direction.copy(direction);
    setSegmentBounds(origin, direction, maximumDistance);

    let nearestSquared = maximumDistance * maximumDistance;
    let found = false;

    for (const box of this.boxes) {
      if (!boxOverlapsSegmentBounds(box)) continue;

      const point = scratchRay.intersectBox(box, scratchPoint);
      if (point === null) continue;

      const distanceSquared = origin.distanceToSquared(point);
      if (distanceSquared >= nearestSquared) continue;

      nearestSquared = distanceSquared;
      found = true;
      if (hitPoint) hitPoint.copy(point);
    }

    return found ? Math.sqrt(nearestSquared) : Infinity;
  }

  /** True when static geometry blocks the segment between two points. */
  isBlocked(from, to) {
    scratchDirection.subVectors(to, from);
    const distance = scratchDirection.length();
    if (distance < 1e-6) return false;
    scratchDirection.divideScalar(distance);

    scratchRay.origin.copy(from);
    scratchRay.direction.copy(scratchDirection);

    setSegmentBounds(from, scratchDirection, distance);
    const distanceSquared = distance * distance;

    for (const box of this.boxes) {
      if (!boxOverlapsSegmentBounds(box)) continue;

      const point = scratchRay.intersectBox(box, scratchPoint);
      if (point === null) continue;
      if (from.distanceToSquared(point) < distanceSquared) return true;
    }

    return false;
  }

  /** Wireframe of every registered box, for the debug overlay. */
  buildDebugMesh() {
    const group = new THREE.Group();
    for (const box of this.boxes) {
      group.add(new THREE.Box3Helper(box.clone(), 0x33ff88));
    }
    return group;
  }
}

function clamp(value, minimum, maximum) {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function circleOverlapsBoxFootprint(x, z, radius, box) {
  const closestX = clamp(x, box.min.x, box.max.x);
  const closestZ = clamp(z, box.min.z, box.max.z);
  const offsetX = x - closestX;
  const offsetZ = z - closestZ;
  return offsetX * offsetX + offsetZ * offsetZ < radius * radius;
}

/**
 * Broad phase for the ray queries. Both walk every box, so rejecting on the
 * segment's bounding box first removes the overwhelming majority of them: a
 * bot's three metre avoidance probe otherwise intersected all ninety-odd
 * boxes spread over an eighty metre field.
 */
const segmentBounds = { minimumX: 0, maximumX: 0, minimumY: 0, maximumY: 0, minimumZ: 0, maximumZ: 0 };

function setSegmentBounds(origin, direction, length) {
  const endX = origin.x + direction.x * length;
  const endY = origin.y + direction.y * length;
  const endZ = origin.z + direction.z * length;

  segmentBounds.minimumX = Math.min(origin.x, endX);
  segmentBounds.maximumX = Math.max(origin.x, endX);
  segmentBounds.minimumY = Math.min(origin.y, endY);
  segmentBounds.maximumY = Math.max(origin.y, endY);
  segmentBounds.minimumZ = Math.min(origin.z, endZ);
  segmentBounds.maximumZ = Math.max(origin.z, endZ);
}

function boxOverlapsSegmentBounds(box) {
  return (
    box.max.x >= segmentBounds.minimumX &&
    box.min.x <= segmentBounds.maximumX &&
    box.max.y >= segmentBounds.minimumY &&
    box.min.y <= segmentBounds.maximumY &&
    box.max.z >= segmentBounds.minimumZ &&
    box.min.z <= segmentBounds.maximumZ
  );
}
