/**
 * Pooled visual effects: tracers, impact puffs, muzzle flashes. Pooled so the
 * frame loop never allocates (REQ-1).
 *
 * Owned by PH-6-effects.
 *
 * Everything lives on two InstancedMeshes, so the whole system costs two draw
 * calls no matter how many effects are alive. Per instance colour AND opacity
 * come from an InstancedBufferAttribute named `color` with four components:
 * three.js promotes that to USE_COLOR_ALPHA, which multiplies the fragment's
 * alpha as well as its tint, so no shader patching is needed.
 */

import * as THREE from 'three';
import { Pool } from '../core/pool.js';

const TRACER_CAPACITY = 48;
const MUZZLE_FLASH_CAPACITY = 12;
const IMPACT_CAPACITY = 32;
const BLOOD_CAPACITY = 24;

const TRACER_LIFETIME_SECONDS = 0.065;
const TRACER_THICKNESS = 0.035;
const TRACER_COLOR = 0xffe4a0;

const MUZZLE_FLASH_LIFETIME_SECONDS = 0.045;
const MUZZLE_FLASH_RADIUS = 0.15;
const MUZZLE_FLASH_LENGTH = 0.34;
const MUZZLE_FLASH_GROWTH = 1.35;
const MUZZLE_FLASH_COLOR = 0xffcf6e;

const IMPACT_LIFETIME_SECONDS = 0.32;
const IMPACT_START_RADIUS = 0.06;
const IMPACT_END_RADIUS = 0.3;
const IMPACT_FLATTENING = 0.45;
const IMPACT_SURFACE_OFFSET = 0.03;
const IMPACT_DRIFT_SPEED = 0.45;
const IMPACT_COLOR = 0xbdb098;

const BLOOD_LIFETIME_SECONDS = 0.26;
const BLOOD_START_RADIUS = 0.07;
const BLOOD_END_RADIUS = 0.24;
const BLOOD_RISE_SPEED = 0.3;
const BLOOD_COLOR = 0x6d1512;

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const scratchMatrix = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

export class EffectSystem {
  /**
   * @param {import('three').Scene} scene
   * @param {ReturnType<import('../world/materials.js').createMaterialLibrary>} materials
   */
  constructor(scene, materials) {
    this.streakMesh = createEffectMesh(
      new THREE.BoxGeometry(1, 1, 1),
      THREE.AdditiveBlending,
      TRACER_CAPACITY + MUZZLE_FLASH_CAPACITY
    );
    this.puffMesh = createEffectMesh(
      new THREE.OctahedronGeometry(1, 0),
      THREE.NormalBlending,
      IMPACT_CAPACITY + BLOOD_CAPACITY
    );

    scene.add(this.streakMesh);
    scene.add(this.puffMesh);

    this.tracers = createEffectPool(this.streakMesh, 0, TRACER_CAPACITY);
    this.muzzleFlashes = createEffectPool(this.streakMesh, TRACER_CAPACITY, MUZZLE_FLASH_CAPACITY);
    this.impacts = createEffectPool(this.puffMesh, 0, IMPACT_CAPACITY);
    this.bloodHits = createEffectPool(this.puffMesh, IMPACT_CAPACITY, BLOOD_CAPACITY);

    const totalCapacity =
      TRACER_CAPACITY + MUZZLE_FLASH_CAPACITY + IMPACT_CAPACITY + BLOOD_CAPACITY;
    this.active = new Array(totalCapacity).fill(null);
    this.activeCount = 0;
  }

  spawnTracer(from, to) {
    const effect = this.begin(this.tracers, TRACER_LIFETIME_SECONDS, TRACER_COLOR);
    if (effect === null) return;

    scratchDirection.subVectors(to, from);
    const length = scratchDirection.length();
    scratchDirection.divideScalar(length);

    effect.position.addVectors(from, to).multiplyScalar(0.5);
    effect.quaternion.setFromUnitVectors(UNIT_Z, scratchDirection);
    effect.startScale.set(TRACER_THICKNESS, TRACER_THICKNESS, length);
    effect.endScale.copy(effect.startScale);
    writeEffectFrame(effect);
  }

  spawnImpact(point, normal) {
    const effect = this.begin(this.impacts, IMPACT_LIFETIME_SECONDS, IMPACT_COLOR);
    if (effect === null) return;

    effect.position.copy(point).addScaledVector(normal, IMPACT_SURFACE_OFFSET);
    effect.quaternion.setFromUnitVectors(UNIT_Z, normal);
    effect.startScale.set(
      IMPACT_START_RADIUS,
      IMPACT_START_RADIUS,
      IMPACT_START_RADIUS * IMPACT_FLATTENING
    );
    effect.endScale.set(
      IMPACT_END_RADIUS,
      IMPACT_END_RADIUS,
      IMPACT_END_RADIUS * IMPACT_FLATTENING
    );
    effect.drift.copy(normal).multiplyScalar(IMPACT_DRIFT_SPEED);
    writeEffectFrame(effect);
  }

  spawnMuzzleFlash(position, direction) {
    const effect = this.begin(
      this.muzzleFlashes,
      MUZZLE_FLASH_LIFETIME_SECONDS,
      MUZZLE_FLASH_COLOR
    );
    if (effect === null) return;

    effect.position.copy(position).addScaledVector(direction, MUZZLE_FLASH_LENGTH * 0.5);
    effect.quaternion.setFromUnitVectors(UNIT_Z, direction);
    effect.startScale.set(MUZZLE_FLASH_RADIUS, MUZZLE_FLASH_RADIUS, MUZZLE_FLASH_LENGTH);
    effect.endScale
      .copy(effect.startScale)
      .multiplyScalar(MUZZLE_FLASH_GROWTH);
    writeEffectFrame(effect);
  }

  spawnBloodHit(point) {
    const effect = this.begin(this.bloodHits, BLOOD_LIFETIME_SECONDS, BLOOD_COLOR);
    if (effect === null) return;

    effect.position.copy(point);
    effect.quaternion.identity();
    effect.startScale.setScalar(BLOOD_START_RADIUS);
    effect.endScale.setScalar(BLOOD_END_RADIUS);
    effect.drift.set(0, BLOOD_RISE_SPEED, 0);
    writeEffectFrame(effect);
  }

  update(deltaSeconds) {
    for (let index = this.activeCount - 1; index >= 0; index -= 1) {
      const effect = this.active[index];
      effect.elapsed += deltaSeconds;

      if (effect.elapsed >= effect.lifetime) {
        effect.pool.release(effect);
        this.activeCount -= 1;
        this.active[index] = this.active[this.activeCount];
        continue;
      }

      effect.position.addScaledVector(effect.drift, deltaSeconds);
      writeEffectFrame(effect);
    }
  }

  /** Returns null when the pool is exhausted; callers skip the effect. */
  begin(pool, lifetime, color) {
    const effect = pool.acquire();
    if (effect === null) return null;

    effect.pool = pool;
    effect.elapsed = 0;
    effect.lifetime = lifetime;
    effect.color.setHex(color);
    effect.drift.set(0, 0, 0);

    this.active[this.activeCount] = effect;
    this.activeCount += 1;
    return effect;
  }
}

function createEffectMesh(geometry, blending, capacity) {
  geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending,
    fog: false
  });

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;

  scratchMatrix.makeScale(0, 0, 0);
  for (let index = 0; index < capacity; index += 1) mesh.setMatrixAt(index, scratchMatrix);

  return mesh;
}

function createEffectPool(mesh, instanceOffset, capacity) {
  return new Pool(
    (index) => ({
      mesh,
      instanceIndex: instanceOffset + index,
      pool: null,
      elapsed: 0,
      lifetime: 1,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      startScale: new THREE.Vector3(),
      endScale: new THREE.Vector3(),
      drift: new THREE.Vector3(),
      color: new THREE.Color()
    }),
    hideEffect,
    capacity
  );
}

function hideEffect(effect) {
  scratchMatrix.makeScale(0, 0, 0);
  effect.mesh.setMatrixAt(effect.instanceIndex, scratchMatrix);
  effect.mesh.instanceMatrix.needsUpdate = true;
}

function writeEffectFrame(effect) {
  const amount = effect.elapsed / effect.lifetime;

  scratchScale.copy(effect.startScale).lerp(effect.endScale, amount);
  scratchMatrix.compose(effect.position, effect.quaternion, scratchScale);
  effect.mesh.setMatrixAt(effect.instanceIndex, scratchMatrix);
  effect.mesh.instanceMatrix.needsUpdate = true;

  const colors = effect.mesh.geometry.attributes.color;
  colors.setXYZW(
    effect.instanceIndex,
    effect.color.r,
    effect.color.g,
    effect.color.b,
    1 - amount
  );
  colors.needsUpdate = true;
}
