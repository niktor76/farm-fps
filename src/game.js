import * as THREE from 'three';
import { GameLoop } from './core/loop.js';
import { DebugStats } from './core/debugStats.js';
import { Random } from './core/rng.js';
import { CollisionWorld } from './world/collision.js';
import { buildFarm } from './world/map.js';
import { generateSpawnPoints, chooseSpawnPoint } from './world/spawns.js';
import { Player } from './entities/player.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { WeaponSystem } from './weapons/weapons.js';
import { EffectSystem } from './weapons/effects.js';
import { ViewModel } from './weapons/viewmodel.js';
import { CAMERA, MATCH } from './config/tunables.js';

/**
 * One match: owns the scene, the fighters, the fixed-timestep loop, the match
 * timer, scoring and respawning.
 *
 * M2 scope: one human fighter with working weapons. Bots arrive in M3, the
 * results flow in M4.
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
    // The view model is parented to the camera, and three.js does not render
    // children of a camera that sits outside the scene graph.
    this.scene.add(this.camera);

    this.random = new Random();
    this.collisionWorld = new CollisionWorld();
    this.farm = buildFarm({
      scene: this.scene,
      collisionWorld: this.collisionWorld,
      random: this.random
    });
    this.spawnPoints = generateSpawnPoints(this.collisionWorld, this.random);

    this.input = new Input(canvas);
    this.input.setDeviceMode(settings.deviceMode);
    this.hud = new Hud(uiRoot);
    this.effects = new EffectSystem(this.scene, this.farm.materials);
    this.viewModel = new ViewModel(this.camera, this.farm.materials);

    this.player = new Player({
      id: 0,
      name: 'You',
      color: 0xd8d2c4,
      feelKey: settings.feelKey,
      camera: this.camera,
      input: this.input
    });

    this.player.sensitivity = settings.sensitivity;
    this.player.setKeyboardTurnSpeed(settings.keyboardTurnDegreesPerSecond);

    this.fighters = [this.player];

    this.weapons = new WeaponSystem({
      collisionWorld: this.collisionWorld,
      fighters: this.fighters,
      effects: this.effects,
      audio: this.audio,
      random: this.random,
      onDamage: (target, amount, attacker, isHeadshot) =>
        this.applyDamage(target, amount, attacker, isHeadshot),
      onKill: (victim, killer, weaponId) => this.registerKill(victim, killer, weaponId)
    });

    this.spawn(this.player);
    this.viewModel.setWeapon(this.player.currentWeapon.id);

    this.stats = new DebugStats();
    this.loop = new GameLoop({
      onFixedStep: (deltaSeconds) => this.fixedStep(deltaSeconds),
      onRender: (frameSeconds) => this.render(frameSeconds)
    });

    this.canvas = canvas;
    this.handleResize = () => this.resize();
    this.handleCanvasClick = () => {
      this.audio.resume();
      this.input.requestLock();
    };
    canvas.addEventListener('click', this.handleCanvasClick);
    window.addEventListener('resize', this.handleResize);
    this.resize();
  }

  start() {
    this.hud.show();
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    this.hud.hide();
  }

  spawn(fighter) {
    const { position, yaw } = chooseSpawnPoint(
      this.spawnPoints,
      this.fighters,
      fighter,
      this.random
    );
    fighter.respawnAt(position, yaw);
    this.audio.play('spawn', fighter.isBot ? { position: fighter.position } : undefined);
  }

  applyDamage(target, amount, attacker, isHeadshot) {
    target.applyDamage(amount, attacker.id);

    if (target === this.player) {
      this.hud.showDamage(this.bearingTo(attacker.position));
    }
  }

  registerKill(victim, killer, weaponId) {
    killer.kills += 1;
    this.hud.addKillFeedEntry({
      killerName: killer.name,
      victimName: victim.name,
      weaponLabel: killer.weapons.find((weapon) => weapon.id === weaponId).label,
      involvesPlayer: killer === this.player || victim === this.player
    });
  }

  /** Angle from where the player is looking to a world position, for the damage indicator. */
  bearingTo(position) {
    const offsetX = position.x - this.player.position.x;
    const offsetZ = position.z - this.player.position.z;
    return Math.atan2(offsetX, -offsetZ) - this.player.yaw;
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

    this.handlePlayerWeaponInput();

    for (const fighter of this.fighters) {
      this.weapons.update(fighter, deltaSeconds);
      if (!fighter.alive && fighter.respawnTimer >= MATCH.respawnDelaySeconds) {
        this.spawn(fighter);
      }
    }

    this.player.update(deltaSeconds, this.collisionWorld);
    this.effects.update(deltaSeconds);
  }

  handlePlayerWeaponInput() {
    const requestedSlot = this.input.consumeWeaponSlot();
    if (requestedSlot !== null) this.weapons.switchTo(this.player, requestedSlot);

    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.weapons.cycle(this.player, wheel);

    if (requestedSlot !== null || wheel !== 0) {
      this.viewModel.setWeapon(this.player.currentWeapon.id);
    }

    if (this.input.wasPressed('reload')) {
      this.weapons.tryReload(this.player);
      if (this.player.reloading) {
        this.viewModel.playReload(this.player.currentWeapon.reloadSeconds);
      }
    }

    if (this.weapons.tryFire(this.player, this.input.isDown('fire'))) {
      const weapon = this.player.currentWeapon;
      if (weapon.kind === 'melee') this.viewModel.playMelee(weapon.swingSeconds);
      else this.viewModel.playFire();
    }
  }

  render(frameSeconds) {
    this.player.syncCamera();
    this.viewModel.update(frameSeconds, this.player);
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
