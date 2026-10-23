import * as THREE from 'three';
import { GameLoop } from './core/loop.js';
import { DebugStats } from './core/debugStats.js';
import { Random } from './core/rng.js';
import { CollisionWorld } from './world/collision.js';
import { buildFarm } from './world/map.js';
import { Player } from './entities/player.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { CAMERA, MATCH, FIGHTER, WORLD } from './config/tunables.js';

/**
 * One match: owns the scene, the fighters, the fixed-timestep loop, the match
 * timer, scoring and respawning.
 *
 * M1 scope: one human fighter walking the farm. Weapons arrive in M2, bots in
 * M3, scoring and the results flow in M4.
 */
export class Game {
  constructor({ canvas, uiRoot, settings, audio, onMatchEnd }) {
    this.settings = settings;
    this.audio = audio;
    this.onMatchEnd = onMatchEnd;
    this.secondsRemaining = MATCH.durationSeconds;
    this.finished = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fieldOfView,
      1,
      CAMERA.nearPlane,
      CAMERA.farPlane
    );
    this.camera.rotation.order = 'YXZ';

    this.random = new Random();
    this.collisionWorld = new CollisionWorld();
    this.farm = buildFarm({
      scene: this.scene,
      collisionWorld: this.collisionWorld,
      random: this.random
    });

    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot);

    this.player = new Player({
      id: 0,
      name: 'You',
      color: 0xd8d2c4,
      feelKey: settings.feelKey,
      camera: this.camera,
      input: this.input
    });
    this.player.respawnAt(this.findClearPosition(), 0);

    this.fighters = [this.player];
    this.stats = new DebugStats();

    this.loop = new GameLoop({
      onFixedStep: (deltaSeconds) => this.fixedStep(deltaSeconds),
      onRender: (frameSeconds) => this.render(frameSeconds)
    });

    this.handleResize = () => this.resize();
    this.handleCanvasClick = () => {
      this.audio.resume();
      this.input.requestLock();
    };
    this.canvas = canvas;
    canvas.addEventListener('click', this.handleCanvasClick);
    window.addEventListener('resize', this.handleResize);
    this.resize();
  }

  /** Temporary M1 placeholder; PH-6-effects replaces this with real spawn points. */
  findClearPosition() {
    const limit = WORLD.playHalfExtent - 4;
    const candidate = new THREE.Vector3();

    for (let attempt = 0; attempt < 200; attempt += 1) {
      candidate.set(this.random.range(-limit, limit), 0, this.random.range(-limit, limit));
      const overlapping = this.collisionWorld.overlapsAt(
        candidate.x,
        0,
        candidate.z,
        FIGHTER.radius * 1.5,
        FIGHTER.standingHeight
      );
      if (!overlapping) return candidate;
    }

    throw new Error('no clear spawn position found');
  }

  start() {
    this.hud.show();
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    this.hud.hide();
  }

  fixedStep(deltaSeconds) {
    if (this.finished) return;

    this.secondsRemaining -= deltaSeconds;
    if (this.secondsRemaining <= 0) {
      this.secondsRemaining = 0;
      this.finished = true;
      this.stop();
      this.onMatchEnd(this.fighters);
      return;
    }

    this.player.update(deltaSeconds, this.collisionWorld);
  }

  render(frameSeconds) {
    this.player.syncCamera();
    this.audio.setListener(this.player.position, this.player.yaw);

    const weapon = this.player.currentWeapon;
    this.hud.update({
      health: this.player.health,
      magazine: this.player.currentMagazine,
      magazineSize: weapon.magazineSize ?? 0,
      weaponLabel: weapon.label,
      reloading: this.player.reloading,
      secondsRemaining: this.secondsRemaining,
      kills: this.player.kills,
      alive: this.player.alive,
      respawnSecondsRemaining: Math.max(
        0,
        MATCH.respawnDelaySeconds - this.player.respawnTimer
      )
    });

    this.renderer.render(this.scene, this.camera);
    this.stats.sampleFrame(frameSeconds, this.renderer);
    this.input.endFrame();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this.input.dispose();
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
