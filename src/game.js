import * as THREE from 'three';
import { GameLoop } from './core/loop.js';
import { DebugStats } from './core/debugStats.js';
import { Random } from './core/rng.js';
import { CollisionWorld } from './world/collision.js';
import { buildFarm } from './world/map.js';
import { generateSpawnPoints, chooseSpawnPoint } from './world/spawns.js';
import { Player } from './entities/player.js';
import { Bot } from './entities/bot.js';
import { updateNametag } from './entities/models.js';
import { WaypointGraph } from './world/waypoints.js';
import { BOT_NAMES, BOT_COLORS } from './config/names.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Scoreboard } from './ui/scoreboard.js';
import { DebugPanel } from './ui/debug.js';
import { WeaponSystem } from './weapons/weapons.js';
import { EffectSystem } from './weapons/effects.js';
import { ViewModel } from './weapons/viewmodel.js';
import { CAMERA, MATCH } from './config/tunables.js';

/**
 * One match: owns the scene, the fighters, the fixed-timestep loop, the match
 * timer, scoring and respawning.
 *
 * M3 scope: the player and the bots fight. The results flow arrives in M4.
 */
export class Game {
  constructor({ canvas, uiRoot, settings, audio, onMatchEnd }) {
    this.settings = settings;
    this.difficultyKey = settings.difficultyKey;
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
    this.waypoints = WaypointGraph.build(this.collisionWorld, this.random, this.farm.coverPoints);

    this.input = new Input(canvas);
    this.input.setDeviceMode(settings.deviceMode);
    this.hud = new Hud(uiRoot);
    this.scoreboard = new Scoreboard(uiRoot);
    this.scoreboardVisible = false;
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

    this.bots = this.createBots(settings);
    this.fighters = [this.player, ...this.bots];

    this.weapons = new WeaponSystem({
      collisionWorld: this.collisionWorld,
      fighters: this.fighters,
      effects: this.effects,
      audio: this.audio,
      random: this.random,
      onDamage: (target, amount, attacker) => this.applyDamage(target, amount, attacker),
      onKill: (victim, killer, weapon) => this.registerKill(victim, killer, weapon)
    });

    this.spawn(this.player);
    for (const bot of this.bots) this.spawn(bot);

    this.botContext = {
      collisionWorld: this.collisionWorld,
      waypoints: this.waypoints,
      fighters: this.fighters,
      weapons: this.weapons,
      audio: this.audio,
      elapsed: 0
    };

    this.hudState = {
      health: 0,
      magazine: 0,
      magazineSize: 0,
      weaponLabel: '',
      reloading: false,
      secondsRemaining: 0,
      kills: 0,
      alive: true,
      respawnSecondsRemaining: 0
    };

    this.stats = new DebugStats();
    this.debugPanel = new DebugPanel(uiRoot, this);
    this.loop = new GameLoop({
      onFixedStep: (deltaSeconds, elapsed) => this.fixedStep(deltaSeconds, elapsed),
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

  createBots(settings) {
    const names = this.random.shuffled(BOT_NAMES);
    const bots = [];

    for (let index = 0; index < settings.botCount; index += 1) {
      const bot = new Bot({
        id: index + 1,
        name: names[index],
        color: BOT_COLORS[index % BOT_COLORS.length],
        feelKey: settings.feelKey,
        difficultyKey: settings.difficultyKey,
        random: this.random
      });

      this.scene.add(bot.model.group);
      bot.nametag.visible = settings.showNametags;
      this.scene.add(bot.nametag);
      bots.push(bot);
    }

    return bots;
  }

  start() {
    this.hud.show();
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    this.hud.hide();
    this.scoreboard.hide();
    this.scoreboardVisible = false;
  }

  /** Tab is held, not toggled, so the rows are rebuilt only on the transition. */
  updateScoreboard() {
    const wanted = this.input.isDown('scoreboard');
    if (wanted === this.scoreboardVisible) return;

    this.scoreboardVisible = wanted;
    if (wanted) this.scoreboard.show(this.fighters, this.player.id);
    else this.scoreboard.hide();
  }

  spawn(fighter) {
    const { position, yaw } = chooseSpawnPoint(
      this.spawnPoints,
      this.fighters,
      fighter,
      this.random,
      this.collisionWorld
    );
    if (fighter.isBot) this.waypoints.releaseAllFor(fighter.id);
    fighter.respawnAt(position, yaw);

    if (fighter === this.player) {
      this.viewModel.reset();
      this.viewModel.setWeapon(fighter.currentWeapon.id);
    }
    this.audio.play('spawn', fighter.isBot ? { position: fighter.position } : undefined);
  }

  applyDamage(target, amount, attacker) {
    const result = target.applyDamage(amount, attacker.id);

    if (attacker === this.player) this.hud.showHitmarker(result.killed);
    if (target === this.player) this.hud.showDamage(this.bearingTo(attacker.position));

    return result;
  }

  registerKill(victim, killer, weapon) {
    killer.kills += 1;
    this.hud.addKillFeedEntry({
      killerName: killer.name,
      victimName: victim.name,
      weaponLabel: weapon.label,
      involvesPlayer: killer === this.player || victim === this.player
    });
  }

  /** Angle from where the player is looking to a world position, for the damage indicator. */
  bearingTo(position) {
    const offsetX = position.x - this.player.position.x;
    const offsetZ = position.z - this.player.position.z;
    return Math.atan2(offsetX, -offsetZ) - this.player.yaw;
  }

  fixedStep(deltaSeconds, elapsed) {
    if (this.finished) return;

    this.secondsRemaining -= deltaSeconds;
    if (this.secondsRemaining <= 0) {
      this.secondsRemaining = 0;
      this.finished = true;
      this.stop();
      this.onMatchEnd(this.fighters);
      return;
    }

    this.botContext.elapsed = elapsed;
    this.updateScoreboard();
    this.handlePlayerWeaponInput();

    for (const fighter of this.fighters) {
      this.weapons.update(fighter, deltaSeconds);
      if (!fighter.alive && fighter.respawnTimer >= MATCH.respawnDelaySeconds) {
        this.spawn(fighter);
      }
    }

    this.player.update(deltaSeconds, this.collisionWorld);
    this.updateBots(deltaSeconds);
    this.effects.update(deltaSeconds);
  }

  /**
   * Each bot owns its own think schedule, with a randomised start phase so ten
   * bots do not all decide on the same frame.
   */
  updateBots(deltaSeconds) {
    for (const bot of this.bots) {
      bot.update(deltaSeconds, this.botContext);
    }
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
    const hudState = this.hudState;
    hudState.health = this.player.health;
    hudState.magazine = this.player.currentMagazine;
    hudState.magazineSize = weapon.magazineSize ?? 0;
    hudState.weaponLabel = weapon.label;
    hudState.reloading = this.player.reloading;
    hudState.secondsRemaining = this.secondsRemaining;
    hudState.kills = this.player.kills;
    hudState.alive = this.player.alive;
    hudState.respawnSecondsRemaining = Math.max(
      0,
      MATCH.respawnDelaySeconds - this.player.respawnTimer
    );
    this.hud.update(hudState);

    if (this.settings.showNametags) {
      for (const bot of this.bots) updateNametag(bot.nametag, bot, this.camera);
    }

    this.renderer.render(this.scene, this.camera);
    this.stats.sampleFrame(frameSeconds, this.renderer);
    this.debugPanel.update(this);
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
    for (const bot of this.bots) bot.dispose();
    this.input.dispose();
    this.debugPanel.dispose();
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
