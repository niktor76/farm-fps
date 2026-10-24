/**
 * Wheat planted during the match by the seed bag.
 *
 * A planting borrows a block of the wheat mesh's spare instances, so no matter
 * how many patches are sown the field stays one draw call and the stalks
 * inherit the wind shader for free. Patches are a fixed extent, which makes
 * every block the same length and lets the oldest patch be recycled in place
 * once the cap is reached.
 *
 * Concealment is registered only when a patch matures. A sprout you can see
 * over must not hide anyone, and the growing time is what makes the weapon a
 * commitment rather than an instant wall.
 *
 * Owned by the seed weapon feature.
 */

import * as THREE from 'three';
import { SEED, WORLD } from '../config/tunables.js';
import {
  WHEAT_FENCE_MARGIN,
  appendStalkPlacements,
  patchHitsGeometry,
  writeStalkBlock
} from './props.js';

const scratchGroundPoint = new THREE.Vector3();

export class PlantingSystem {
  /**
   * @param {{
   *   wheat: ReturnType<typeof import('./props.js').createWheatPatches>,
   *   concealment: import('./concealment.js').ConcealmentField,
   *   collisionWorld: import('./collision.js').CollisionWorld,
   *   random: import('../core/rng.js').Random
   * }} options
   */
  constructor({ wheat, concealment, collisionWorld, random }) {
    this.wheat = wheat;
    this.concealment = concealment;
    this.collisionWorld = collisionWorld;
    this.random = random;

    this.patches = [];
  }

  /**
   * Where a seed thrown from this eye along this aim would land: the point the
   * player is looking at on the ground. Returns false when they are looking at
   * or above the horizon, past the weapon's range, or through geometry — the
   * last one stops a patch being seeded inside a building from outside it.
   */
  resolveTarget(eyePosition, aimDirection, target) {
    if (aimDirection.y >= 0) return false;

    const distanceToGround = (eyePosition.y - WORLD.groundLevel) / -aimDirection.y;
    if (distanceToGround > SEED.plantRange) return false;
    if (this.collisionWorld.raycast(eyePosition, aimDirection, distanceToGround) < distanceToGround) {
      return false;
    }

    target.copy(eyePosition).addScaledVector(aimDirection, distanceToGround);
    target.y = WORLD.groundLevel;
    return true;
  }

  /** True when a patch centred here would sit on clear, in-bounds ground. */
  canPlantAt(x, z) {
    const limit = WORLD.playHalfExtent - SEED.patchExtent / 2 - WHEAT_FENCE_MARGIN;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;

    const candidate = {
      centerX: x,
      centerZ: z,
      sizeX: SEED.patchExtent,
      sizeZ: SEED.patchExtent
    };

    if (patchHitsGeometry(this.collisionWorld, candidate)) return false;

    // Standing crop already conceals here, so a charge spent would buy nothing
    // and would stack a second rectangle on the same ground.
    if (this.concealment.contains(x, z)) return false;

    const clearance = SEED.patchExtent / 2 + SEED.minimumGapFromPatch;
    for (const patch of this.patches) {
      if (Math.abs(patch.centerX - x) < clearance && Math.abs(patch.centerZ - z) < clearance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sows a patch at the ground point the fighter is looking at. Returns false
   * when there is no valid spot, which the caller reports rather than spending
   * a charge.
   */
  plantFrom(eyePosition, aimDirection) {
    if (!this.resolveTarget(eyePosition, aimDirection, scratchGroundPoint)) return false;
    if (!this.canPlantAt(scratchGroundPoint.x, scratchGroundPoint.z)) return false;

    this.plantAt(scratchGroundPoint.x, scratchGroundPoint.z);
    return true;
  }

  plantAt(centerX, centerZ) {
    const placements = appendStalkPlacements(
      [],
      centerX,
      centerZ,
      SEED.patchExtent,
      SEED.patchExtent,
      this.random
    );

    const patch = this.takePatchSlot(placements.length);
    patch.centerX = centerX;
    patch.centerZ = centerZ;
    patch.placements = placements;
    patch.growSeconds = 0;
    patch.concealmentPatch = null;

    writeStalkBlock(this.wheat.mesh, placements, patch.firstIndex, 0);
    this.wheat.commitStalks();
  }

  /**
   * A free instance block, either newly allocated or taken back from the
   * oldest patch once the cap is reached. Recycling in place is what keeps the
   * mesh from growing without bound over a long match.
   */
  takePatchSlot(stalkCount) {
    if (this.patches.length < SEED.maximumLivePatches) {
      const { firstIndex } = this.wheat.allocateStalks(stalkCount);
      const patch = { firstIndex };
      this.patches.push(patch);
      return patch;
    }

    // Oldest first: moving it to the back is the whole recycle order.
    const patch = this.patches.shift();
    this.patches.push(patch);

    if (patch.concealmentPatch) this.concealment.removePatch(patch.concealmentPatch);
    return patch;
  }

  step(deltaSeconds) {
    for (const patch of this.patches) {
      if (patch.growSeconds >= SEED.growSeconds) continue;

      patch.growSeconds = Math.min(SEED.growSeconds, patch.growSeconds + deltaSeconds);
      const growFraction = patch.growSeconds / SEED.growSeconds;
      writeStalkBlock(this.wheat.mesh, patch.placements, patch.firstIndex, growFraction);
      this.wheat.markStalksDirty(patch.firstIndex, patch.placements.length);

      if (patch.growSeconds < SEED.growSeconds) continue;

      patch.concealmentPatch = this.concealment.addPatch(
        patch.centerX,
        patch.centerZ,
        SEED.patchExtent,
        SEED.patchExtent
      );
    }
  }
}
