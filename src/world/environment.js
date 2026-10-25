/**
 * Image-based lighting: a sky for surfaces to reflect.
 *
 * A MeshStandardMaterial with metalness is mostly specular, so its appearance
 * comes from reflecting the environment rather than from catching lamp light.
 * Without a scene environment the metals had nothing to reflect and rendered
 * near-black whatever the lighting was; five times the lamp intensity recovered
 * only 2.19x of the gun's brightness, where supplying an environment recovered
 * 3.36x with the material colours untouched.
 *
 * One prefiltered map is built per entry in DAY_CYCLES, all of them up front,
 * because PMREM filtering is far too expensive to run on a frame.
 */

import * as THREE from 'three';
import { DAY_CYCLES, ENVIRONMENT } from '../config/tunables.js';

/**
 * Equirectangular, so it maps straight onto the sphere of directions: x is the
 * compass bearing and y runs from the ground below to the sky above. The sky
 * holds its colour down to the horizon, crosses over a short band, then settles
 * into the ground colour, which is what a hemisphere light approximates.
 */
function drawSkyGradient(context, width, height, cycle) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  const sky = new THREE.Color(cycle.skyLightColor);
  const ground = new THREE.Color(cycle.groundLightColor);
  const horizon = sky.clone().lerp(ground, 0.5);

  gradient.addColorStop(0, `#${sky.getHexString()}`);
  gradient.addColorStop(0.5 - ENVIRONMENT.horizonSoftness, `#${sky.getHexString()}`);
  gradient.addColorStop(0.5, `#${horizon.getHexString()}`);
  gradient.addColorStop(0.5 + ENVIRONMENT.horizonSoftness, `#${ground.getHexString()}`);
  gradient.addColorStop(1, `#${ground.getHexString()}`);

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function createSkyTexture(cycle) {
  const canvas = document.createElement('canvas');
  canvas.width = ENVIRONMENT.sourceWidth;
  canvas.height = ENVIRONMENT.sourceHeight;
  drawSkyGradient(canvas.getContext('2d'), canvas.width, canvas.height, cycle);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Prefilters one environment per day cycle. The generator and the source
 * textures are disposed here; only the prefiltered results outlive the call.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @returns {{ get: (dayCycleKey: string) => import('three').Texture, dispose: () => void }}
 */
export function createSkyEnvironments(renderer) {
  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileEquirectangularShader();

  const prefiltered = new Map();

  for (const [key, cycle] of Object.entries(DAY_CYCLES)) {
    const source = createSkyTexture(cycle);
    prefiltered.set(key, generator.fromEquirectangular(source).texture);
    source.dispose();
  }

  generator.dispose();

  return {
    get(dayCycleKey) {
      const texture = prefiltered.get(dayCycleKey);
      if (!texture) throw new Error(`unknown day cycle: ${dayCycleKey}`);
      return texture;
    },
    dispose() {
      for (const texture of prefiltered.values()) texture.dispose();
      prefiltered.clear();
    }
  };
}

/**
 * A material that relies on scene.environment rather than its own envMap gets
 * its strength from scene.environmentIntensity; material.envMapIntensity is
 * skipped entirely, because WebGLMaterials guards it behind `if (material.envMap)`
 * and WebGLRenderer then overwrites the uniform from the scene. So the scene
 * value is the only reflection knob here, and the world and view scenes need
 * very different ones -- see ENVIRONMENT in tunables.
 */
export function applyEnvironment(scene, environment, intensity) {
  scene.environment = environment;
  scene.environmentIntensity = intensity;
}
