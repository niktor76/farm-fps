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
import { WORLD, DAY_CYCLES, DEFAULT_DAY_CYCLE } from '../config/tunables.js';

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

export function createLighting(scene, dayCycleKey = DEFAULT_DAY_CYCLE) {
  const cycle = DAY_CYCLES[dayCycleKey];
  if (!cycle) throw new Error(`unknown day cycle: ${dayCycleKey}`);

  scene.background = new THREE.Color(cycle.skyColor);
  scene.fog = new THREE.Fog(cycle.fogColor, cycle.fogNear, cycle.fogFar);

  const hemisphere = new THREE.HemisphereLight(
    cycle.skyLightColor,
    cycle.groundLightColor,
    cycle.ambientIntensity
  );
  hemisphere.position.set(0, 60, 0);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(cycle.sunColor, cycle.sunIntensity);
  sun.position.copy(sunPosition(cycle.sunElevationDegrees, cycle.sunAzimuthDegrees));
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

  return { sun, hemisphere };
}
