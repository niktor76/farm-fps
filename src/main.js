import './style.css';
import * as THREE from 'three';
import { CollisionWorld } from './world/collision.js';
import { GameLoop } from './core/loop.js';
import { DebugStats } from './core/debugStats.js';
import { CAMERA, WORLD, FIGHTER } from './config/tunables.js';

/**
 * PH-0 bootstrap.
 *
 * Renders the bare play area so the toolchain, renderer configuration and
 * frame budget can be measured before any game content exists. M1 replaces
 * this with the real menu and match flow.
 */

const canvas = document.querySelector('#scene');
const uiRoot = document.querySelector('#ui-root');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e0);
scene.fog = new THREE.Fog(0x9fc4e0, 60, 180);

const camera = new THREE.PerspectiveCamera(
  CAMERA.fieldOfView,
  1,
  CAMERA.nearPlane,
  CAMERA.farPlane
);
camera.rotation.order = 'YXZ';
camera.position.set(0, FIGHTER.standingEyeHeight, 24);

const hemisphere = new THREE.HemisphereLight(0xbfd9ef, 0x53411f, 1.1);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xfff2d8, 3.0);
sun.position.set(38, 54, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.normalBias = 0.03;
fitShadowCamera(sun, WORLD.playHalfExtent + 6);
scene.add(sun);
scene.add(sun.target);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD.visualHalfExtent * 2, WORLD.visualHalfExtent * 2),
  new THREE.MeshStandardMaterial({ color: 0x6f8f4a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const collisionWorld = new CollisionWorld();
collisionWorld.addPlayBoundary();
scene.add(collisionWorld.buildDebugMesh());

const stats = new DebugStats();
const readout = document.createElement('div');
readout.style.cssText =
  'position:absolute;top:10px;left:12px;font:12px ui-monospace,monospace;' +
  'color:#cfe8ff;background:rgba(0,0,0,.45);padding:6px 9px;border-radius:5px;white-space:pre';
uiRoot.appendChild(readout);

const loop = new GameLoop({
  onFixedStep: () => {},
  onRender: (frameSeconds) => {
    camera.position.x = Math.sin(loop.elapsed * 0.15) * 26;
    camera.position.z = Math.cos(loop.elapsed * 0.15) * 26;
    camera.lookAt(0, 1.2, 0);

    renderer.render(scene, camera);
    stats.sampleFrame(frameSeconds, renderer);

    readout.textContent =
      `PH-0 foundation\n` +
      `${stats.framesPerSecond.toFixed(0)} fps  ` +
      `${stats.averageFrameMilliseconds.toFixed(2)} ms avg  ` +
      `${stats.worstFrameMilliseconds.toFixed(2)} ms worst\n` +
      `${stats.drawCalls} draw calls  ${stats.triangles} triangles\n` +
      `${collisionWorld.boxes.length} collision boxes`;
  }
});

function fitShadowCamera(light, halfExtent) {
  const shadowCamera = light.shadow.camera;
  shadowCamera.left = -halfExtent;
  shadowCamera.right = halfExtent;
  shadowCamera.top = halfExtent;
  shadowCamera.bottom = -halfExtent;
  shadowCamera.near = 1;
  shadowCamera.far = 160;
  shadowCamera.updateProjectionMatrix();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();
loop.start();
