/**
 * Contact shading on the ground.
 *
 * The sun's shadow map says where the sun is blocked. It says nothing about a
 * wall and the earth meeting, which is dark from every direction at once, and
 * that absence is what makes a building read as resting on the grass rather
 * than floating above it.
 *
 * The occlusion is painted once into a texture rather than computed per frame,
 * because none of it moves: the buildings, fences and bales are placed at
 * startup and stay. It reaches the material through `aoMap`, which three
 * applies to indirect light only -- never to direct sun. That used to make it
 * nearly pointless here, since the only indirect light was a weak fill; now
 * that the sky is a real light source there is something substantial to
 * occlude.
 *
 * A second UV set is required and the ground does not have one: its `uv` is
 * scaled far past 0..1 so the grass tiles. `uv1` is added here as a plain
 * world-space projection across the covered square.
 */

import * as THREE from 'three';
import { GROUND_AMBIENT_OCCLUSION } from '../config/tunables.js';

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

  // White is unoccluded: aoMap reads the red channel and 1 leaves light alone.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);

  for (const box of collisionWorld.boxes) {
    if (box.min.x > extent || box.max.x < -extent) continue;
    if (box.min.z > extent || box.max.z < -extent) continue;
    paintFootprint(context, box, size, extent);
  }

  const texture = new THREE.CanvasTexture(canvas);
  // Channel 1 is `uv1`. The default is 0, which here is the grass tiling set --
  // scaled far past 0..1, so the map would clamp to its white edge everywhere
  // and occlude precisely nothing.
  texture.channel = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Projects the covered square onto the mesh as `uv1`, the channel `aoMap`
 * samples. The existing `uv` is left alone: it is tiled far past 0..1 to repeat
 * the grass, which is exactly what an occlusion map must not do.
 */
export function applyGroundOcclusion(mesh, texture) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const extent = GROUND_AMBIENT_OCCLUSION.coveredHalfExtent;
  const uv1 = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    uv1[index * 2] = (position.getX(index) + extent) / (extent * 2);
    uv1[index * 2 + 1] = 1 - (position.getZ(index) + extent) / (extent * 2);
  }

  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));

  // Cloned so the ground's occlusion does not leak onto anything else sharing
  // the grass or dirt material.
  const material = mesh.material.clone();
  material.aoMap = texture;
  material.aoMapIntensity = GROUND_AMBIENT_OCCLUSION.intensity;
  mesh.material = material;
}
