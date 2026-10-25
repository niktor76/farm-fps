/**
 * Contact shading on the ground.
 *
 * The sun's shadow map says where the sun is blocked. It says nothing about a
 * wall and the earth meeting, which is dark from every direction at once, and
 * that absence is what makes a building read as resting on the grass rather
 * than floating above it.
 *
 * None of it moves, so none of it is computed per frame: the occluders are
 * placed at startup and their footprints are painted once into a texture.
 *
 * It is drawn as a multiplying layer over the ground rather than through
 * `aoMap`, and that choice is the whole reason this is visible. `aoMap`
 * attenuates indirect light only, never direct sun -- which sounds right until
 * you measure it on this farm, where at the default hour the sun runs at 2.55
 * against an ambient of 0.33. Occluding the indirect share completely moved
 * 1.4% of the frame by a mean of 5 of 255: correct by the book, and invisible.
 * A real contact shadow darkens sunlit ground too, because the gap beside a
 * wall receives less of everything.
 */

import * as THREE from 'three';
import { GROUND_AMBIENT_OCCLUSION, WORLD } from '../config/tunables.js';

/** World XZ to texture space, where 0..1 spans the covered square centred on the origin. */
function toTextureSpace(value, size, extent) {
  return ((value + extent) / (extent * 2)) * size;
}

/**
 * One occluder's footprint, blurred outward from the wall line. A blurred
 * rectangle is used rather than a radial falloff because a barn is long: a
 * radial gradient centred on its footprint reads as a circle and leaves the
 * ends of the wall untouched, where a blur hugs whatever shape is actually
 * there. The blur radius grows with height, since a taller wall hides more
 * of the sky from the ground beside it.
 */
function paintFootprint(context, box, size, extent) {
  const height = box.max.y - box.min.y;
  if (height < GROUND_AMBIENT_OCCLUSION.minimumOccluderHeight) return;

  const metresToPixels = size / (extent * 2);
  const spread =
    Math.min(height, GROUND_AMBIENT_OCCLUSION.maximumSpreadMetres) *
    GROUND_AMBIENT_OCCLUSION.spreadPerMetre;

  const strength = Math.min(
    GROUND_AMBIENT_OCCLUSION.maximumStrength,
    height * GROUND_AMBIENT_OCCLUSION.strengthPerMetre
  );

  const minX = toTextureSpace(box.min.x, size, extent);
  const maxX = toTextureSpace(box.max.x, size, extent);
  const minZ = toTextureSpace(box.min.z, size, extent);
  const maxZ = toTextureSpace(box.max.z, size, extent);

  context.save();
  context.filter = `blur(${(spread * metresToPixels).toFixed(2)}px)`;
  context.fillStyle = `rgba(0, 0, 0, ${strength})`;
  context.fillRect(minX, minZ, maxX - minX, maxZ - minZ);
  context.restore();
}

/**
 * @param {import('./collision.js').CollisionWorld} collisionWorld
 * @returns {import('three').CanvasTexture}
 */
export function createGroundOcclusionTexture(collisionWorld) {
  const size = GROUND_AMBIENT_OCCLUSION.textureSize;
  const extent = GROUND_AMBIENT_OCCLUSION.coveredHalfExtent;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  // Fully transparent is unoccluded. The footprints are painted as black with
  // a varying alpha, so ordinary blending darkens exactly where they are and
  // leaves everything else untouched -- no need for a blend mode whose
  // interaction with the rest of the pipeline has to be reasoned about.
  context.clearRect(0, 0, size, size);

  for (const box of collisionWorld.boxes) {
    if (box.min.x > extent || box.max.x < -extent) continue;
    if (box.min.z > extent || box.max.z < -extent) continue;
    paintFootprint(context, box, size, extent);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * A plane just above the ground carrying the occlusion as soft black. Being
 * drawn over the scene rather than fed to the lighting is what lets it darken
 * direct sunlight as well as sky light; the alternative, `aoMap`, cannot.
 *
 * It writes no depth and sits a few centimetres up, clearing the yard patches
 * that are themselves raised off the ground, so neither fights the other.
 */
export function createGroundOcclusionLayer(texture) {
  const extent = GROUND_AMBIENT_OCCLUSION.coveredHalfExtent;
  const geometry = new THREE.PlaneGeometry(extent * 2, extent * 2);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WORLD.groundLevel + GROUND_AMBIENT_OCCLUSION.layerHeight;
  mesh.renderOrder = GROUND_AMBIENT_OCCLUSION.renderOrder;
  mesh.name = 'ground-occlusion';
  return mesh;
}
