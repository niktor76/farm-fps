import * as THREE from 'three';
import { GameLoop } from './core/loop.js';
import { DebugStats } from './core/debugStats.js';
import { Random } from './core/rng.js';
import { CollisionWorld } from './world/collision.js';
import { buildFarm, updateWind } from './world/map.js';
import { createSkyEnvironments } from './world/environment.js';
import { DayCycleClock, isMovingCycle } from './world/dayCycle.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { applyCycle } from './world/lighting.js';
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
import { PlantingSystem } from './world/planting.js';
import { Balloon } from './world/balloon.js';
import { CAMERA, MATCH, DAY_CYCLE_MOTION, AMBIENT_OCCLUSION } from './config/tunables.js';

/**
 * One match: owns the scene, the fighters, the fixed-timestep loop, the match
 * timer, scoring and respawning.
 *
 * M3 scope: the player and the bots fight. The results flow arrives in M4.
 */
export class Game {
  constructor({ canvas, uiRoot, settings, audio, onMatchEnd, onPause = () => {} }) {
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
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      settings.fieldOfView,
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
    this.environments = createSkyEnvironments(this.renderer);
    this.dayClock = isMovingCycle(settings.dayCycleKey)
      ? new DayCycleClock(this.random.next())
      : null;
    this.movingEnvironment = null;
    this.secondsSinceEnvironmentRebuild = 0;
    this.farm = buildFarm({
      scene: this.scene,
      collisionWorld: this.collisionWorld,
      random: this.random,
      dayCycleKey: this.dayClock === null ? settings.dayCycleKey : this.dayClock.nearestKey,
      environments: this.environments
    });
    this.spawnPoints = generateSpawnPoints(this.collisionWorld, this.random);
    this.waypoints = WaypointGraph.build(this.collisionWorld, this.random, this.farm.coverPoints);

    this.paused = false;
    this.onPause = onPause;
    this.input = new Input(canvas, settings.keyBindings, () => this.pause());
    this.input.setDeviceMode(settings.deviceMode);
    this.hud = new Hud(uiRoot);
    this.scoreboard = new Scoreboard(uiRoot);
    this.scoreboardVisible = false;
    this.effects = new EffectSystem(this.scene, this.farm.materials);
    this.viewModel = new ViewModel(
      this.camera,
      this.farm.materials,
      this.dayClock === null ? settings.dayCycleKey : this.dayClock.nearestKey,
      this.environments
    );

    this.player = new Player({
      id: 0,
      name: 'You',
      color: 0xd8d2c4,
      feelKey: settings.feelKey,
      camera: this.camera,
      input: this.input,
      fieldOfView: settings.fieldOfView
    });

    this.player.sensitivity = settings.sensitivity;
    this.player.setKeyboardTurnSpeed(settings.keyboardTurnDegreesPerSecond);

    this.bots = this.createBots(settings);
    this.fighters = [this.player, ...this.bots];

    this.planting = new PlantingSystem({
      wheat: this.farm.wheat,
      concealment: this.farm.concealment,
      collisionWorld: this.collisionWorld,
      random: this.random
    });

    // After the waypoint graph and the spawn points, so neither treats the
    // basket as ground the bots should path onto or spawn on.
    this.balloon = new Balloon({
      scene: this.scene,
      materials: this.farm.materials,
      collisionWorld: this.collisionWorld,
      fighters: this.fighters
    });

    this.weapons = new WeaponSystem({
      collisionWorld: this.collisionWorld,
      fighters: this.fighters,
      effects: this.effects,
      audio: this.audio,
      random: this.random,
      onDamage: (target, amount, attacker) => this.applyDamage(target, amount, attacker),
      onKill: (victim, killer, weapon) => this.registerKill(victim, killer, weapon),
      resolveMuzzle: (fighter, target) => this.resolveMuzzle(fighter, target),
      plantSeed: (eyePosition, aimDirection) => this.planting.plantFrom(eyePosition, aimDirection)
    });

    this.spawn(this.player);
    for (const bot of this.bots) this.spawn(bot);

    this.botContext = {
      collisionWorld: this.collisionWorld,
      waypoints: this.waypoints,
      fighters: this.fighters,
      weapons: this.weapons,
      audio: this.audio,
      concealment: this.farm.concealment,
      elapsed: 0
    };

    this.elapsedRenderSeconds = 0;
    this.hudState = {
      health: 0,
      magazine: 0,
      magazineSize: 0,
      weaponLabel: '',
      reloading: false,
      secondsRemaining: 0,
      kills: 0,
      alive: true,
      respawnSecondsRemaining: 0,
      staminaFraction: 1,
      aimFraction: 0,
      movementSpread: 0,
      scopeFraction: 0
    };

    this.composer = this.createComposer();

    this.stats = new DebugStats();
    this.debugPanel = new DebugPanel(uiRoot, this);
    this.loop = new GameLoop({
      onFixedStep: (deltaSeconds, elapsed) => this.fixedStep(deltaSeconds, elapsed),
      onRender: (frameSeconds) => this.render(frameSeconds)
    });

    this.canvas = canvas;
    this.handleResize = () => this.resize();
    this.handleVisibilityChange = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
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
    this.input.setEnabled(true);
    this.hud.show();
    this.loop.start();
  }

  /**
   * Freezes everything, the match clock included: this is a solo match against
   * bots, so there is no fairness argument for letting the round burn down
   * while a menu is open. GameLoop.start resets its own timestamp, so resuming
   * cannot produce the huge first frame that would teleport every bot.
   */
  pause() {
    if (this.paused || this.finished || !this.loop.running) return;

    this.paused = true;
    this.loop.stop();
    this.input.setEnabled(false);
    this.audio.suspend();
    // The crosshair sits dead centre, which is straight through the panel.
    this.hud.hide();
    this.onPause();
  }

  resume() {
    if (!this.paused) return;

    this.paused = false;
    this.audio.resume();
    this.hud.show();
    this.input.setEnabled(true);
    this.loop.start();
    this.input.requestLock();
  }

  stop() {
    this.loop.stop();
    this.input.releaseLock();
    this.input.setEnabled(false);
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

  /**
   * The player's muzzle is the barrel tip of the view model, so the flash and
   * the tracer leave the gun the player can actually see. Bots have no view
   * model, so they fall back to the weapon system's approximation.
   */
  resolveMuzzle(fighter, target) {
    if (fighter !== this.player) return false;
    this.viewModel.getMuzzleWorldPosition(target);
    return true;
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
    this.planting.step(deltaSeconds);
    this.balloon.step(deltaSeconds);
    this.input.endFrame();
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
      if (weapon.kind === 'gun') this.viewModel.playFire();
      else this.viewModel.playMelee(weapon.cooldownSeconds);
    }
  }

  /**
   * Ambient occlusion, through three's own GTAO pass rather than anything
   * hand-rolled. The world goes through the composer; the weapon does not,
   * because it lives in its own scene drawn after a depth clear and has no
   * business being occluded against the farm behind it.
   *
   * Routing through a composer means the canvas-level `antialias` flag stops
   * applying -- it only covers the default framebuffer, and the scene now
   * lands in an offscreen target first. The target asks for multisampling
   * itself to get it back.
   */
  createComposer() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const target = new THREE.WebGLRenderTarget(width, height, {
      samples: AMBIENT_OCCLUSION.multisampling,
      type: THREE.HalfFloatType
    });

    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const gtao = new GTAOPass(this.scene, this.camera, width, height);
    // The default radius is a quarter of a metre, which is tuned for a desk
    // ornament. A barn wall is six metres tall and needs to darken the ground
    // well out from its base before any of this reads as occlusion.
    gtao.updateGtaoMaterial({
      radius: AMBIENT_OCCLUSION.radiusMetres,
      distanceExponent: AMBIENT_OCCLUSION.distanceExponent,
      thickness: AMBIENT_OCCLUSION.thickness,
      scale: AMBIENT_OCCLUSION.scale,
      screenSpaceRadius: false
    });
    gtao.blendIntensity = AMBIENT_OCCLUSION.blendIntensity;
    composer.addPass(gtao);
    this.gtaoPass = gtao;

    composer.addPass(new OutputPass());
    return composer;
  }

  /**
   * The sky itself is cheap to move, but its prefiltered reflection is not, so
   * the lights and fog follow the clock every frame while the environment is
   * rebuilt on a slow tick. A sky that updates in steps of a second reads as
   * continuous, and the swap happens before the old texture is released
   * because freeing one the renderer still holds flashes the scene.
   */
  advanceDayCycle(frameSeconds) {
    if (this.dayClock === null) return;

    const cycle = this.dayClock.advance(frameSeconds);
    applyCycle(this.farm.lighting, this.scene, cycle);

    this.secondsSinceEnvironmentRebuild += frameSeconds;
    if (this.secondsSinceEnvironmentRebuild >= DAY_CYCLE_MOTION.environmentRebuildSeconds) {
      this.secondsSinceEnvironmentRebuild = 0;
      const replaced = this.movingEnvironment;
      this.movingEnvironment = this.environments.build(cycle);
      if (replaced !== null) replaced.dispose();
    }

    this.viewModel.applyCycle(cycle, this.movingEnvironment);
    if (this.movingEnvironment !== null) {
      this.scene.environment = this.movingEnvironment;
    }
  }

  render(frameSeconds) {
    this.elapsedRenderSeconds += frameSeconds;
    updateWind(this.elapsedRenderSeconds);
    this.advanceDayCycle(frameSeconds);
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
    hudState.staminaFraction = this.player.staminaFraction;
    hudState.aimFraction = this.player.aimFraction;
    hudState.movementSpread = this.player.movementSpread;
    hudState.scopeFraction = this.player.scopeFraction;
    hudState.respawnSecondsRemaining = Math.max(
      0,
      MATCH.respawnDelaySeconds - this.player.respawnTimer
    );
    this.hud.update(hudState);

    if (this.settings.showNametags) {
      for (const bot of this.bots) updateNametag(bot.nametag, bot, this.camera);
    }

    this.renderer.info.reset();
    this.renderer.clear();
    this.composer.render();
    this.renderer.clearDepth();
    this.viewModel.render(this.renderer);
    this.stats.sampleFrame(frameSeconds, this.renderer);
    this.debugPanel.update(this);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(width / height);
  }

  dispose() {
    this.stop();
    for (const bot of this.bots) bot.dispose();
    this.input.dispose();
    this.debugPanel.dispose();
    this.hud.dispose();
    this.scoreboard.dispose();
    this.viewModel.dispose();
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    disposeSceneResources(this.scene);
    // scene.environment is not in the graph, so the walk above never sees it.
    if (this.movingEnvironment !== null) this.movingEnvironment.dispose();
    this.environments.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}


/**
 * Frees the geometry, materials and textures of a finished match. The renderer
 * keeps its WebGL context across matches, so anything not released here stays
 * resident on the GPU for the rest of the session.
 */
function disposeSceneResources(scene) {
  const seenMaterials = new Set();

  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();

    const material = object.material;
    if (!material) return;

    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if (seenMaterials.has(entry)) continue;
      seenMaterials.add(entry);
      if (entry.map) entry.map.dispose();
      entry.dispose();
    }
  });

  scene.clear();
}
