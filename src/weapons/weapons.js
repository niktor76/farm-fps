/**
 * Weapon state machine shared by the player and bots: firing, cooldown,
 * reloading (including shell-by-shell for the shotgun), and switching.
 *
 * Every number read here comes from the resolved weapon definitions the
 * Fighter already carries. Damage is reported through onDamage / onKill rather
 * than applied here, so the match layer sees every hit.
 *
 * Owned by PH-5-weapons.
 */

import * as THREE from 'three';
import { traceShot, traceMelee, spreadDirection } from './hitscan.js';

const scratchOrigin = new THREE.Vector3();
const scratchAim = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchMuzzle = new THREE.Vector3();
const scratchImpactNormal = new THREE.Vector3();
const scratchSoundPosition = new THREE.Vector3();
const scratchTargetBox = new THREE.Box3();
const scratchTargetCenter = new THREE.Vector3();

/** Distance from the eye to where the tracer and flash appear to leave the barrel. */
const MUZZLE_FORWARD_OFFSET = 0.5;
const MUZZLE_DOWN_OFFSET = 0.12;

/** The two melee weapons share one sound sample and are separated by pitch. */
const MELEE_PITCH = { karambit: 1.0, pitchfork: 0.7 };

export class WeaponSystem {
  /**
   * @param {{
   *   collisionWorld: import('../world/collision.js').CollisionWorld,
   *   fighters: import('../entities/fighter.js').Fighter[],
   *   effects: import('./effects.js').EffectSystem,
   *   audio: import('../audio/audio.js').AudioEngine,
   *   random: import('../core/rng.js').Random,
   *   onDamage: (target, amount, attacker) => { killed: boolean, remaining: number },
   *   onKill: (victim, killer, weapon) => void,
   *   plantSeed: (eyePosition, aimDirection) => boolean
   * }} options
   */
  constructor({
    collisionWorld,
    fighters,
    effects,
    audio,
    random,
    onDamage,
    onKill,
    resolveMuzzle,
    plantSeed
  }) {
    this.collisionWorld = collisionWorld;
    this.fighters = fighters;
    this.effects = effects;
    this.audio = audio;
    this.random = random;
    this.onDamage = onDamage;
    this.onKill = onKill;
    this.resolveMuzzle = resolveMuzzle;
    this.plantSeed = plantSeed;

    this.triggerWasHeld = new Map();

    this.shot = {
      shooter: null,
      origin: scratchOrigin,
      direction: scratchDirection,
      weapon: null,
      collisionWorld,
      fighters
    };

    this.positionedSound = { position: scratchSoundPosition, pitchVariation: 1 };
    this.localSound = { pitchVariation: 1 };
  }

  /** Ticks cooldowns and reload timers for one fighter. Spread recovery is Fighter.step's job. */
  update(fighter, deltaSeconds) {
    if (fighter.cooldownTimer > 0) fighter.cooldownTimer -= deltaSeconds;
    if (!fighter.reloading) return;

    fighter.reloadTimer -= deltaSeconds;
    if (fighter.reloadTimer > 0) return;

    const weapon = fighter.currentWeapon;

    if (weapon.shellByShellReload) {
      fighter.magazines[fighter.weaponIndex] += 1;
      this.playSound(fighter, 'shell', 1);

      if (fighter.currentMagazine >= weapon.magazineSize) {
        fighter.reloading = false;
        fighter.reloadTimer = 0;
        return;
      }

      fighter.reloadTimer = weapon.reloadSeconds;
      return;
    }

    fighter.magazines[fighter.weaponIndex] = weapon.magazineSize;
    fighter.reloading = false;
    fighter.reloadTimer = 0;
  }

  /**
   * Attempts to fire. Returns false when blocked by cooldown, reload or an
   * empty magazine. Triggers an automatic reload when the magazine runs dry.
   */
  tryFire(fighter, triggerHeld) {
    const wasHeld = this.triggerWasHeld.get(fighter) === true;
    this.triggerWasHeld.set(fighter, triggerHeld);

    if (!triggerHeld) return false;
    if (!fighter.alive) return false;

    const weapon = fighter.currentWeapon;
    if (weapon.fireMode === 'semi' && wasHeld) return false;
    if (fighter.cooldownTimer > 0) return false;

    if (weapon.kind === 'melee') return this.fireMelee(fighter, weapon);

    if (fighter.reloading) {
      // A shell-by-shell reload is interruptible once there is something to fire.
      if (!weapon.shellByShellReload) return false;
      if (fighter.currentMagazine === 0) return false;
      fighter.reloading = false;
      fighter.reloadTimer = 0;
    }

    if (fighter.currentMagazine === 0) {
      this.playSound(fighter, 'empty', 1);
      this.tryReload(fighter);
      return false;
    }

    if (weapon.kind === 'tool') return this.useTool(fighter, weapon);
    return this.fireGun(fighter, weapon);
  }

  fireGun(fighter, weapon) {
    fighter.magazines[fighter.weaponIndex] -= 1;
    fighter.cooldownTimer = weapon.cooldownSeconds;

    fighter.getEyePosition(scratchOrigin);
    fighter.getAimDirection(scratchAim);

    // The local player's flash comes off the actual barrel tip of the view
    // model. Bots have no view model, so they keep the approximation.
    if (!this.resolveMuzzle(fighter, scratchMuzzle)) {
      scratchMuzzle
        .copy(scratchOrigin)
        .addScaledVector(scratchAim, MUZZLE_FORWARD_OFFSET);
      scratchMuzzle.y -= MUZZLE_DOWN_OFFSET;
    }

    this.effects.spawnMuzzleFlash(scratchMuzzle, scratchAim);

    const shot = this.shot;
    shot.shooter = fighter;
    shot.weapon = weapon;

    const spread = Math.max(weapon.baseSpread, fighter.effectiveSpread);

    for (let pellet = 0; pellet < weapon.pelletCount; pellet += 1) {
      spreadDirection(scratchAim, spread, this.random, scratchDirection);
      const result = traceShot(shot);

      this.effects.spawnTracer(scratchMuzzle, result.point);

      if (result.target === null) {
        scratchImpactNormal.copy(scratchDirection).negate();
        this.effects.spawnImpact(result.point, scratchImpactNormal);
        continue;
      }

      this.effects.spawnBloodHit(result.point);
      this.deliverDamage(fighter, result.target, result.damage, weapon);
    }

    fighter.currentSpread = Math.min(
      weapon.maximumSpread,
      Math.max(weapon.baseSpread, fighter.currentSpread) + weapon.spreadPerShot
    );
    fighter.recoilPitch += weapon.recoilVertical;
    fighter.recoilYaw += (this.random.next() * 2 - 1) * weapon.recoilHorizontal;

    this.playSound(fighter, weapon.id, 1);
    return true;
  }

  /**
   * The seed bag. A charge is spent only when a patch is actually sown, so
   * aiming at a wall or at the sky costs nothing but the cooldown.
   */
  useTool(fighter, weapon) {
    fighter.getEyePosition(scratchOrigin);
    fighter.getAimDirection(scratchAim);

    fighter.cooldownTimer = weapon.cooldownSeconds;

    if (!this.plantSeed(scratchOrigin, scratchAim)) {
      this.playSound(fighter, 'empty', 1);
      return false;
    }

    fighter.magazines[fighter.weaponIndex] -= 1;
    this.playSound(fighter, weapon.id, 1);
    return true;
  }

  fireMelee(fighter, weapon) {
    fighter.cooldownTimer = weapon.cooldownSeconds;
    this.playSound(fighter, 'melee', MELEE_PITCH[weapon.id]);

    const target = traceMelee(fighter, weapon, this.fighters, this.collisionWorld);
    if (target === null) return true;

    target.getBodyBox(scratchTargetBox);
    scratchTargetBox.getCenter(scratchTargetCenter);
    this.effects.spawnBloodHit(scratchTargetCenter);

    this.deliverDamage(fighter, target, weapon.damage, weapon);
    return true;
  }

  /**
   * The match layer owns applyDamage, so a kill is detected by the target's
   * alive flag flipping across the callback rather than from a return value.
   */
  deliverDamage(attacker, target, amount, weapon) {
    const result = this.onDamage(target, amount, attacker);

    if (!attacker.isBot) this.audio.play('hitmarker');
    if (!target.isBot) this.audio.play('hit');

    if (!result.killed) return;

    this.onKill(target, attacker, weapon);
    if (!attacker.isBot) this.audio.play('death');
  }

  tryReload(fighter) {
    const weapon = fighter.currentWeapon;
    if (weapon.magazineSize === undefined) return false;
    if (fighter.reloading) return false;
    if (fighter.currentMagazine >= weapon.magazineSize) return false;

    fighter.reloading = true;
    fighter.reloadTimer = weapon.reloadSeconds;
    this.playSound(fighter, 'reload', 1);
    return true;
  }

  switchTo(fighter, weaponIndex) {
    if (weaponIndex === fighter.weaponIndex) return false;

    fighter.weaponIndex = weaponIndex;
    fighter.reloading = false;
    fighter.reloadTimer = 0;

    const weapon = fighter.currentWeapon;
    fighter.currentSpread = weapon.kind === 'gun' ? weapon.baseSpread : 0;
    return true;
  }

  /** @param {number} direction -1 or 1, for the mouse wheel */
  cycle(fighter, direction) {
    const count = fighter.weapons.length;
    const next = (((fighter.weaponIndex + direction) % count) + count) % count;
    return this.switchTo(fighter, next);
  }

  /** A bot's weapon is heard from where it stands; the player's own is centred and unattenuated. */
  playSound(fighter, name, pitchVariation) {
    if (fighter.isBot) {
      fighter.getEyePosition(scratchSoundPosition);
      this.positionedSound.pitchVariation = pitchVariation;
      this.audio.play(name, this.positionedSound);
      return;
    }

    this.localSound.pitchVariation = pitchVariation;
    this.audio.play(name, this.localSound);
  }
}
