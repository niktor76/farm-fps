import * as THREE from 'three';
import { CONCEALMENT } from '../config/tunables.js';

/**
 * Standing-crop concealment registry.
 *
 * Mirrors CollisionWorld: a flat list of axis aligned rectangles in the ground
 * plane, scanned brute force. Concealment breaks line of sight only — bullets
 * and movement ignore it entirely, so nothing here is registered as collision.
 *
 * Hiding costs posture. A fighter is concealed only while crouched at least
 * CONCEALMENT.crouchAmountToConceal, and only from observers beyond
 * CONCEALMENT.revealDistance, which stops a patch from becoming a safe room.
 *
 * Owned by the concealment feature.
 */
export class ConcealmentField {
  constructor() {
    this.patches = [];
  }

  clear() {
    this.patches.length = 0;
  }

  addPatch(centerX, centerZ, sizeX, sizeZ) {
    const halfX = sizeX / 2;
    const halfZ = sizeZ / 2;
    const patch = {
      minimumX: centerX - halfX,
      maximumX: centerX + halfX,
      minimumZ: centerZ - halfZ,
      maximumZ: centerZ + halfZ,
      height: CONCEALMENT.cropHeight
    };
    this.patches.push(patch);
    return patch;
  }

  /** True when this ground position lies inside any patch. */
  contains(x, z) {
    for (let index = 0; index < this.patches.length; index += 1) {
      const patch = this.patches[index];
      if (
        x >= patch.minimumX &&
        x <= patch.maximumX &&
        z >= patch.minimumZ &&
        z <= patch.maximumZ
      ) {
        return true;
      }
    }

    return false;
  }

  /** Inside a patch and crouched far enough. Standing in the crop hides nothing. */
  concealsFighter(fighter) {
    if (fighter.crouchAmount < CONCEALMENT.crouchAmountToConceal) return false;
    return this.contains(fighter.position.x, fighter.position.z);
  }

  /** The perception test: concealed, and the observer is not close enough to see through. */
  blocksSightBetween(observerEyePosition, targetFighter) {
    if (!this.concealsFighter(targetFighter)) return false;

    const offsetX = targetFighter.position.x - observerEyePosition.x;
    const offsetZ = targetFighter.position.z - observerEyePosition.z;
    const revealSquared = CONCEALMENT.revealDistance * CONCEALMENT.revealDistance;
    return offsetX * offsetX + offsetZ * offsetZ > revealSquared;
  }

  /** Flat translucent lids at crop height, for the debug overlay. */
  buildDebugMesh() {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const group = new THREE.Group();

    for (const patch of this.patches) {
      const geometry = new THREE.PlaneGeometry(
        patch.maximumX - patch.minimumX,
        patch.maximumZ - patch.minimumZ
      );
      geometry.rotateX(-Math.PI / 2);

      const lid = new THREE.Mesh(geometry, material);
      lid.position.set(
        (patch.minimumX + patch.maximumX) / 2,
        patch.height,
        (patch.minimumZ + patch.maximumZ) / 2
      );
      group.add(lid);
    }

    return group;
  }
}
