import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIGHTER } from '../config/tunables.js';

const HEIGHT = FIGHTER.standingHeight;

const HIP_HEIGHT = HEIGHT * 0.522;
const TORSO_HEIGHT = HEIGHT * 0.311;
const NECK_HEIGHT = HEIGHT * 0.022;
const HEAD_HEIGHT = HEIGHT * 0.145;

const TORSO_WIDTH = HEIGHT * 0.26;
const TORSO_DEPTH = HEIGHT * 0.15;
const HEAD_WIDTH = HEIGHT * 0.135;
const HEAD_DEPTH = HEIGHT * 0.145;
const NECK_WIDTH = HEIGHT * 0.07;

const ARM_LENGTH = HEIGHT * 0.36;
const ARM_THICKNESS = HEIGHT * 0.075;
const LEG_THICKNESS = HEIGHT * 0.09;
const BOOT_HEIGHT = HEIGHT * 0.05;
const BOOT_DEPTH = HEIGHT * 0.13;

const SHOULDER_HEIGHT = HIP_HEIGHT + TORSO_HEIGHT - ARM_THICKNESS * 0.5;
const SHOULDER_OFFSET = TORSO_WIDTH * 0.5 + ARM_THICKNESS * 0.5;
const LEG_OFFSET = LEG_THICKNESS * 0.62;

const CAP_HEIGHT = HEIGHT * 0.04;
const CAP_RADIUS = HEAD_WIDTH * 0.62;
const BRIM_DEPTH = HEIGHT * 0.065;
const BRIM_THICKNESS = HEIGHT * 0.011;

const SKIN_COLOR = 0xc3a083;
const TROUSER_COLOR = 0x4d5668;
const DENIM_COLOR = 0x5d6b80;
const BOOT_COLOR = 0x3a332e;
const BRIM_COLOR = 0x2f3338;

const LEG_SWING_RADIANS = 0.62;
const ARM_SWING_RADIANS = 0.46;
const WALK_CYCLES_PER_METRE = 0.55;
const SWING_SMOOTHING_PER_SECOND = 10;

const CROUCH_SCALE = FIGHTER.crouchingHeight / FIGHTER.standingHeight;

const NAMETAG_CANVAS_WIDTH = 256;
const NAMETAG_CANVAS_HEIGHT = 64;
const NAMETAG_HEIGHT_PER_METRE = 0.028;
const NAMETAG_NEAREST_METRES = 5;
const NAMETAG_FARTHEST_METRES = 40;
const NAMETAG_FADE_START_METRES = 45;
const NAMETAG_FADE_END_METRES = 60;
const NAMETAG_RISE_METRES = 0.3;

/**
 * Low-poly fighter mesh and floating nametag.
 *
 * Nametags are Sprites rather than CSS overlays (DEC-16) so a name is hidden
 * by the depth buffer when its bot ducks behind cover.
 *
 * Owned by PH-2-player.
 *
 * @param {number} color
 * @returns {{
 *   group: import('three').Group,
 *   update: (fighter: import('./fighter.js').Fighter, deltaSeconds: number) => void,
 *   dispose: () => void
 * }}
 */
export function createFighterModel(color) {
  // Five meshes rather than a dozen: everything that moves together is merged
  // into one geometry and tinted per vertex, so a fighter costs five draw calls.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  const bodyGeometry = buildBodyGeometry(color);
  const leftLegGeometry = buildLegGeometry();
  const rightLegGeometry = buildLegGeometry();
  const leftArmGeometry = buildArmGeometry();
  const rightArmGeometry = buildArmGeometry();

  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeometry, material);
  group.add(body);

  const leftLeg = new THREE.Mesh(leftLegGeometry, material);
  leftLeg.position.set(-LEG_OFFSET, HIP_HEIGHT, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(rightLegGeometry, material);
  rightLeg.position.set(LEG_OFFSET, HIP_HEIGHT, 0);
  group.add(rightLeg);

  const leftArm = new THREE.Mesh(leftArmGeometry, material);
  leftArm.position.set(-SHOULDER_OFFSET, SHOULDER_HEIGHT, 0);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(rightArmGeometry, material);
  rightArm.position.set(SHOULDER_OFFSET, SHOULDER_HEIGHT, 0);
  group.add(rightArm);

  for (const mesh of [body, leftLeg, rightLeg, leftArm, rightArm]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const geometries = [
    bodyGeometry,
    leftLegGeometry,
    rightLegGeometry,
    leftArmGeometry,
    rightArmGeometry
  ];

  let swingAmplitude = 0;

  return {
    group,

    update(fighter, deltaSeconds) {
      group.visible = fighter.alive;
      if (!fighter.alive) return;

      group.position.copy(fighter.position);
      group.rotation.y = fighter.yaw;
      group.scale.y = THREE.MathUtils.lerp(1, CROUCH_SCALE, fighter.crouchAmount);

      const target = fighter.onGround
        ? Math.min(fighter.horizontalSpeed / fighter.feel.walkSpeed, 1.3)
        : 0;
      swingAmplitude += (target - swingAmplitude) * Math.min(1, deltaSeconds * SWING_SMOOTHING_PER_SECOND);

      const phase = fighter.distanceTravelled * WALK_CYCLES_PER_METRE * Math.PI * 2;
      const legSwing = Math.sin(phase) * LEG_SWING_RADIANS * swingAmplitude;
      const armSwing = Math.sin(phase) * ARM_SWING_RADIANS * swingAmplitude;

      leftLeg.rotation.x = legSwing;
      rightLeg.rotation.x = -legSwing;
      leftArm.rotation.x = -armSwing;
      rightArm.rotation.x = armSwing;
    },

    dispose() {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    }
  };
}

function buildBodyGeometry(color) {
  const parts = [];

  const torsoTop = HIP_HEIGHT + TORSO_HEIGHT;
  const headBottom = torsoTop + NECK_HEIGHT;
  const headCentre = headBottom + HEAD_HEIGHT * 0.5;

  parts.push(
    paint(
      box(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH, 0, HIP_HEIGHT + TORSO_HEIGHT * 0.5, 0),
      color
    )
  );
  parts.push(
    paint(
      box(NECK_WIDTH, NECK_HEIGHT, NECK_WIDTH, 0, torsoTop + NECK_HEIGHT * 0.5, 0),
      SKIN_COLOR
    )
  );
  parts.push(
    paint(box(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, 0, headCentre, 0), SKIN_COLOR)
  );

  // Cap crown sits inside the head's top slice so the silhouette still ends at
  // exactly FIGHTER.standingHeight.
  const cap = new THREE.CylinderGeometry(CAP_RADIUS, CAP_RADIUS * 1.05, CAP_HEIGHT, 10);
  cap.translate(0, HEIGHT - CAP_HEIGHT * 0.5, 0);
  parts.push(paint(cap, color));

  parts.push(
    paint(
      box(
        HEAD_WIDTH * 1.05,
        BRIM_THICKNESS,
        BRIM_DEPTH,
        0,
        HEIGHT - CAP_HEIGHT,
        -(HEAD_DEPTH * 0.5 + BRIM_DEPTH * 0.5) * 0.9
      ),
      BRIM_COLOR
    )
  );

  const bibHeight = TORSO_HEIGHT * 0.62;
  const bibFrontZ = -(TORSO_DEPTH * 0.5 + 0.004);
  parts.push(
    paint(
      box(
        TORSO_WIDTH * 0.56,
        bibHeight,
        0.01,
        0,
        HIP_HEIGHT + bibHeight * 0.5,
        bibFrontZ
      ),
      DENIM_COLOR
    )
  );

  const strapHeight = torsoTop - (HIP_HEIGHT + bibHeight);
  for (const side of [-1, 1]) {
    parts.push(
      paint(
        box(
          TORSO_WIDTH * 0.12,
          strapHeight,
          0.01,
          side * TORSO_WIDTH * 0.2,
          HIP_HEIGHT + bibHeight + strapHeight * 0.5,
          bibFrontZ
        ),
        DENIM_COLOR
      )
    );
  }

  return mergeGeometries(parts);
}

function buildLegGeometry() {
  const legLength = HIP_HEIGHT - BOOT_HEIGHT;

  const thigh = paint(
    box(LEG_THICKNESS, legLength, LEG_THICKNESS, 0, -legLength * 0.5, 0),
    TROUSER_COLOR
  );
  const boot = paint(
    box(
      LEG_THICKNESS * 1.1,
      BOOT_HEIGHT,
      BOOT_DEPTH,
      0,
      -legLength - BOOT_HEIGHT * 0.5,
      -BOOT_DEPTH * 0.18
    ),
    BOOT_COLOR
  );

  return mergeGeometries([thigh, boot]);
}

function buildArmGeometry() {
  const sleeveLength = ARM_LENGTH * 0.55;
  const handLength = ARM_LENGTH - sleeveLength;

  const sleeve = paint(
    box(ARM_THICKNESS, sleeveLength, ARM_THICKNESS, 0, -sleeveLength * 0.5, 0),
    SKIN_COLOR
  );
  const forearm = paint(
    box(
      ARM_THICKNESS * 0.92,
      handLength,
      ARM_THICKNESS * 0.92,
      0,
      -sleeveLength - handLength * 0.5,
      0
    ),
    SKIN_COLOR
  );

  return mergeGeometries([sleeve, forearm]);
}

function box(width, height, depth, centreX, centreY, centreZ) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(centreX, centreY, centreZ);
  return geometry;
}

function paint(geometry, colorHex) {
  const color = new THREE.Color(colorHex);
  const vertexCount = geometry.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** @returns {import('three').Sprite} */
export function createNametag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = NAMETAG_CANVAS_WIDTH;
  canvas.height = NAMETAG_CANVAS_HEIGHT;

  const context = canvas.getContext('2d');
  const radius = 14;

  context.fillStyle = 'rgba(10, 13, 18, 0.62)';
  context.beginPath();
  context.roundRect(4, 8, canvas.width - 8, canvas.height - 16, radius);
  context.fill();

  context.fillStyle = cssColor(color);
  context.beginPath();
  context.roundRect(10, 16, 8, canvas.height - 32, 4);
  context.fill();

  context.font = 'bold 30px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 6;
  context.strokeStyle = 'rgba(5, 7, 10, 0.9)';
  context.strokeText(name, 28, canvas.height / 2, canvas.width - 40);
  context.fillStyle = '#ffffff';
  context.fillText(name, 28, canvas.height / 2, canvas.width - 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // depthTest stays on: that is the whole point of using a Sprite (DEC-16).
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });

  const sprite = new THREE.Sprite(material);
  sprite.userData.aspect = canvas.width / canvas.height;
  return sprite;
}

/** Moves the tag above the fighter and scales it so it stays legible at range. */
export function updateNametag(sprite, fighter, camera) {
  sprite.position.set(
    fighter.position.x,
    fighter.position.y + FIGHTER.standingHeight + NAMETAG_RISE_METRES,
    fighter.position.z
  );

  const distance = camera.position.distanceTo(sprite.position);
  const opacity =
    1 -
    THREE.MathUtils.clamp(
      (distance - NAMETAG_FADE_START_METRES) /
        (NAMETAG_FADE_END_METRES - NAMETAG_FADE_START_METRES),
      0,
      1
    );

  sprite.visible = fighter.alive && opacity > 0.01;
  if (!sprite.visible) return;

  sprite.material.opacity = opacity;

  const height =
    THREE.MathUtils.clamp(distance, NAMETAG_NEAREST_METRES, NAMETAG_FARTHEST_METRES) *
    NAMETAG_HEIGHT_PER_METRE;
  sprite.scale.set(height * sprite.userData.aspect, height, 1);
}

function cssColor(colorHex) {
  return `#${colorHex.toString(16).padStart(6, '0')}`;
}
