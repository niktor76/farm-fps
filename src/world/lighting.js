/**
 * Sun, sky and fog. The directional light's shadow camera is fitted tightly to
 * the play area, which matters more for shadow sharpness than map resolution.
 *
 * Owned by PH-1-world.
 *
 * @param {import('three').Scene} scene
 * @returns {{ sun: import('three').DirectionalLight, hemisphere: import('three').HemisphereLight }}
 */

import * as THREE from 'three';
import { WORLD } from '../config/tunables.js';

const SKY_COLOR = 0x9cc2e4;
const HAZE_COLOR = 0xbccfdd;
const GROUND_BOUNCE_COLOR = 0x5a5133;
const SUN_COLOR = 0xffddae;

/** Late afternoon: 28 degrees above the horizon, 22 degrees off the west axis. */
const SUN_POSITION = [-58, 34, 24];

const FOG_NEAR = 62;
const FOG_FAR = 178;

export function createLighting(scene) {
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(HAZE_COLOR, FOG_NEAR, FOG_FAR);

  const hemisphere = new THREE.HemisphereLight(SKY_COLOR, GROUND_BOUNCE_COLOR, 1.15);
  hemisphere.position.set(0, 60, 0);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.7);
  sun.position.set(SUN_POSITION[0], SUN_POSITION[1], SUN_POSITION[2]);
  sun.castShadow = true;

  // The projected width of an 80 m square under a 22 degree azimuth is about
  // 105 m, so anything tighter than this clips shadows at the far corners.
  const shadowExtent = WORLD.playHalfExtent + 14;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = 10;
  shadowCamera.far = 170;
  shadowCamera.updateProjectionMatrix();

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.03;

  scene.add(sun);
  scene.add(sun.target);

  return { sun, hemisphere };
}
