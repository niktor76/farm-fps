/**
 * Procedural material library. Textures are drawn to a canvas at startup so the
 * game ships with no downloaded assets (REQ-3).
 *
 * Owned by PH-1-world.
 *
 * @returns {{
 *   grass: import('three').Material, dirt: import('three').Material,
 *   wood: import('three').Material, paintedWood: import('three').Material,
 *   roof: import('three').Material, metal: import('three').Material,
 *   rustedMetal: import('three').Material, hay: import('three').Material,
 *   stone: import('three').Material, foliage: import('three').Material,
 *   bark: import('three').Material, crop: import('three').Material,
 *   glass: import('three').Material
 * }}
 */
export function createMaterialLibrary() {
  throw new Error('not implemented: PH-1-world');
}
