/**
 * Sun, sky and fog for the selected time of day. Every colour, intensity and
 * distance comes from DAY_CYCLES; only the light's position and colour change
 * between cycles, the shadow camera stays fitted tightly to the play area.
 *
 * Owned by PH-1-world, extended by PH-14-day-cycle.
 *
 * @param {import('three').Scene} scene
 * @param {keyof typeof DAY_CYCLES} [dayCycleKey]
 * @returns {{ sun: import('three').DirectionalLight, hemisphere: import('three').HemisphereLight }}
 */

import * as THREE from 'three';
import { WORLD, DEFAULT_DAY_CYCLE, ENVIRONMENT } from '../config/tunables.js';
import { applyEnvironment } from './environment.js';
import { resolveFixedCycle } from './dayCycle.js';

const SHADOW_NEAR = 10;
const SHADOW_FAR = 170;

/**
 * Only the direction matters for a directional light, but the distance decides
 * where the play area lands in the shadow camera's depth range. Sitting at the
 * middle of that range leaves the most room on both sides, which is what keeps
 * a low sun from pushing the far corners through a clipping plane.
 */
const SUN_DISTANCE = (SHADOW_NEAR + SHADOW_FAR) / 2;

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Azimuth is compass-style: 0 is north (-Z), 90 is east (+X). */
function sunPosition(elevationDegrees, azimuthDegrees) {
  const elevation = elevationDegrees * DEGREES_TO_RADIANS;
  const azimuth = azimuthDegrees * DEGREES_TO_RADIANS;
  const horizontal = SUN_DISTANCE * Math.cos(elevation);

  return new THREE.Vector3(
    horizontal * Math.sin(azimuth),
    SUN_DISTANCE * Math.sin(elevation),
    -horizontal * Math.cos(azimuth)
  );
}

/**
 * Pushes a resolved cycle into the live objects. Separate from createLighting
 * because the moving cycle calls it every frame with a blend of two hours,
 * where the fixed cycles call it once.
 */
export function applyCycle(lighting, scene, cycle) {
  scene.background.copy(cycle.skyColor);
  scene.fog.color.copy(cycle.fogColor);
  scene.fog.near = cycle.fogNear;
  scene.fog.far = cycle.fogFar;

  lighting.hemisphere.color.copy(cycle.skyLightColor);
  lighting.hemisphere.groundColor.copy(cycle.groundLightColor);
  lighting.hemisphere.intensity = cycle.ambientIntensity;

  lighting.sun.color.copy(cycle.sunColor);
  lighting.sun.intensity = cycle.sunIntensity;
  lighting.sun.position.copy(
    sunPosition(cycle.sunElevationDegrees, cycle.sunAzimuthDegrees)
  );
}

export function createLighting(scene, dayCycleKey = DEFAULT_DAY_CYCLE, environments = null) {
  const cycle = resolveFixedCycle(dayCycleKey);

  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 1, 2);

  const hemisphere = new THREE.HemisphereLight();
  hemisphere.position.set(0, 60, 0);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;

  // The projected width of an 80 m square under a 22 degree azimuth is about
  // 105 m, so anything tighter than this clips shadows at the far corners.
  const shadowExtent = WORLD.playHalfExtent + 14;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = SHADOW_NEAR;
  shadowCamera.far = SHADOW_FAR;
  shadowCamera.updateProjectionMatrix();

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.03;

  scene.add(sun);
  scene.add(sun.target);

  const lighting = { sun, hemisphere };
  applyCycle(lighting, scene, cycle);

  if (environments !== null) {
    applyEnvironment(scene, environments.get(dayCycleKey), ENVIRONMENT.worldIntensity);
  }

  return lighting;
}
