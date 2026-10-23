import { FIGHTER, STAMINA } from '../config/tunables.js';

const KILL_FEED_ENTRY_LIFETIME_SECONDS = 5;
const KILL_FEED_ENTRY_FADE_SECONDS = 1;
const LOW_HEALTH_FRACTION = 0.35;
/** The stamina bar stays marked as exhausted until a sprint can be started again. */
const STAMINA_READY_PERCENT = Math.ceil(
  (STAMINA.minimumSecondsToStartSprint / STAMINA.maximumSeconds) * 100
);
const TIMER_URGENT_SECONDS = 30;
const HITMARKER_VISIBLE_SECONDS = 0.25;
const DAMAGE_FLASH_VISIBLE_SECONDS = 0.5;

/**
 * In-match overlay: crosshair, health, ammunition, current weapon, match timer,
 * kill feed, hitmarker, damage flash and the respawn countdown.
 *
 * Owned by PH-4-ui-shell.
 */

export class Hud {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.container = document.createElement('div');
    this.container.className = 'hud';

    this.container.appendChild(this.buildCrosshair());
    this.container.appendChild(this.buildHealthSection());
    this.container.appendChild(this.buildAmmunitionSection());
    this.container.appendChild(this.buildTimerSection());
    this.container.appendChild(this.buildKillFeedSection());
    this.container.appendChild(this.buildDamageVignette());
    this.container.appendChild(this.buildRespawnOverlay());

    root.appendChild(this.container);

    this.killFeedEntries = [];
    this.hitmarkerTimeoutHandle = null;
    this.damageFlashTimeoutHandle = null;

    this.previousState = {
      health: null,
      staminaPercent: null,
      magazine: null,
      magazineSize: null,
      weaponLabel: null,
      reloading: null,
      secondsRemaining: null,
      kills: null,
      alive: null,
      respawnSecondsRemaining: null
    };
  }

  buildCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.className = 'hud-crosshair';

    const top = document.createElement('div');
    top.className = 'hud-crosshair-line hud-crosshair-line--top';
    const bottom = document.createElement('div');
    bottom.className = 'hud-crosshair-line hud-crosshair-line--bottom';
    const left = document.createElement('div');
    left.className = 'hud-crosshair-line hud-crosshair-line--left';
    const right = document.createElement('div');
    right.className = 'hud-crosshair-line hud-crosshair-line--right';
    const dot = document.createElement('div');
    dot.className = 'hud-crosshair-dot';

    this.hitmarkerElement = document.createElement('div');
    this.hitmarkerElement.className = 'hud-hitmarker';

    crosshair.appendChild(top);
    crosshair.appendChild(bottom);
    crosshair.appendChild(left);
    crosshair.appendChild(right);
    crosshair.appendChild(dot);
    crosshair.appendChild(this.hitmarkerElement);

    return crosshair;
  }

  buildHealthSection() {
    const section = document.createElement('div');
    section.className = 'hud-health';

    this.staminaBarFillElement = document.createElement('div');
    this.staminaBarFillElement.className = 'hud-health-bar-fill hud-stamina-bar-fill';

    this.staminaBarTrackElement = document.createElement('div');
    this.staminaBarTrackElement.className = 'hud-health-bar-track hud-stamina-bar-track';
    this.staminaBarTrackElement.appendChild(this.staminaBarFillElement);

    this.healthBarFillElement = document.createElement('div');
    this.healthBarFillElement.className = 'hud-health-bar-fill';

    const barTrack = document.createElement('div');
    barTrack.className = 'hud-health-bar-track';
    barTrack.appendChild(this.healthBarFillElement);

    const barColumn = document.createElement('div');
    barColumn.className = 'hud-health-bars';
    barColumn.appendChild(this.staminaBarTrackElement);
    barColumn.appendChild(barTrack);

    this.healthNumberElement = document.createElement('div');
    this.healthNumberElement.className = 'hud-health-number';

    section.appendChild(barColumn);
    section.appendChild(this.healthNumberElement);

    return section;
  }

  buildAmmunitionSection() {
    const section = document.createElement('div');
    section.className = 'hud-ammunition';

    this.magazineElement = document.createElement('div');
    this.magazineElement.className = 'hud-ammunition-magazine';

    this.weaponLabelElement = document.createElement('div');
    this.weaponLabelElement.className = 'hud-ammunition-weapon';

    this.reloadingElement = document.createElement('div');
    this.reloadingElement.className = 'hud-ammunition-reloading';
    this.reloadingElement.textContent = 'RELOADING';

    section.appendChild(this.magazineElement);
    section.appendChild(this.weaponLabelElement);
    section.appendChild(this.reloadingElement);

    return section;
  }

  buildTimerSection() {
    const section = document.createElement('div');
    section.className = 'hud-timer';

    this.timerElement = document.createElement('div');
    this.timerElement.className = 'hud-timer-clock';

    this.killsElement = document.createElement('div');
    this.killsElement.className = 'hud-timer-kills';

    section.appendChild(this.timerElement);
    section.appendChild(this.killsElement);

    return section;
  }

  buildKillFeedSection() {
    this.killFeedElement = document.createElement('div');
    this.killFeedElement.className = 'hud-kill-feed';
    return this.killFeedElement;
  }

  buildDamageVignette() {
    this.damageVignetteElement = document.createElement('div');
    this.damageVignetteElement.className = 'hud-damage-vignette';
    return this.damageVignetteElement;
  }

  buildRespawnOverlay() {
    this.respawnOverlayElement = document.createElement('div');
    this.respawnOverlayElement.className = 'hud-respawn-overlay';

    const message = document.createElement('div');
    message.className = 'hud-respawn-message';
    message.textContent = 'ELIMINATED';

    this.respawnCountdownElement = document.createElement('div');
    this.respawnCountdownElement.className = 'hud-respawn-countdown';

    this.respawnOverlayElement.appendChild(message);
    this.respawnOverlayElement.appendChild(this.respawnCountdownElement);

    return this.respawnOverlayElement;
  }

  show() {
    this.container.classList.remove('is-hidden');
  }

  hide() {
    this.container.classList.add('is-hidden');
  }

  dispose() {
    clearTimeout(this.hitmarkerTimeoutHandle);
    clearTimeout(this.damageFlashTimeoutHandle);
    this.container.remove();
  }

  /**
   * @param {{
   *   health: number, staminaFraction: number,
   *   magazine: number, magazineSize: number,
   *   weaponLabel: string, reloading: boolean,
   *   secondsRemaining: number, kills: number,
   *   alive: boolean, respawnSecondsRemaining: number
   * }} state
   */
  update(state) {
    const previous = this.previousState;

    if (state.health !== previous.health) {
      const clampedHealth = Math.max(0, Math.min(FIGHTER.maximumHealth, state.health));
      const healthFraction = clampedHealth / FIGHTER.maximumHealth;
      this.healthBarFillElement.style.width = `${healthFraction * 100}%`;
      this.healthBarFillElement.classList.toggle('is-low', state.health < FIGHTER.maximumHealth * LOW_HEALTH_FRACTION);
      this.healthNumberElement.textContent = Math.ceil(state.health);
      previous.health = state.health;
    }

    const staminaPercent = Math.round(state.staminaFraction * 100);
    if (staminaPercent !== previous.staminaPercent) {
      this.staminaBarFillElement.style.width = `${staminaPercent}%`;
      this.staminaBarTrackElement.classList.toggle(
        'is-exhausted',
        staminaPercent < STAMINA_READY_PERCENT
      );
      previous.staminaPercent = staminaPercent;
    }

    if (state.magazine !== previous.magazine || state.magazineSize !== previous.magazineSize) {
      this.magazineElement.textContent = `${state.magazine} / ${state.magazineSize}`;
      previous.magazine = state.magazine;
      previous.magazineSize = state.magazineSize;
    }

    if (state.weaponLabel !== previous.weaponLabel) {
      this.weaponLabelElement.textContent = state.weaponLabel;
      previous.weaponLabel = state.weaponLabel;
    }

    if (state.reloading !== previous.reloading) {
      this.reloadingElement.classList.toggle('is-visible', state.reloading);
      previous.reloading = state.reloading;
    }

    const wholeSecondsRemaining = Math.ceil(state.secondsRemaining);
    if (wholeSecondsRemaining !== previous.secondsRemaining) {
      this.timerElement.textContent = formatClock(wholeSecondsRemaining);
      this.timerElement.classList.toggle('is-urgent', wholeSecondsRemaining <= TIMER_URGENT_SECONDS);
      previous.secondsRemaining = wholeSecondsRemaining;
    }

    if (state.kills !== previous.kills) {
      this.killsElement.textContent = state.kills === 1 ? '1 kill' : `${state.kills} kills`;
      previous.kills = state.kills;
    }

    if (state.alive !== previous.alive) {
      this.respawnOverlayElement.classList.toggle('is-visible', !state.alive);
      previous.alive = state.alive;
    }

    const wholeRespawnSeconds = Math.ceil(state.respawnSecondsRemaining);
    if (!state.alive && wholeRespawnSeconds !== previous.respawnSecondsRemaining) {
      this.respawnCountdownElement.textContent = `Respawning in ${wholeRespawnSeconds}s`;
      previous.respawnSecondsRemaining = wholeRespawnSeconds;
    }

    this.pruneKillFeedEntries();
  }

  /** Crosshair tick confirming damage was dealt. */
  showHitmarker(isKill) {
    this.hitmarkerElement.classList.remove('is-visible', 'is-kill');
    // Force a reflow so the animation restarts when triggered in quick succession.
    void this.hitmarkerElement.offsetWidth;
    this.hitmarkerElement.classList.add('is-visible');
    this.hitmarkerElement.classList.toggle('is-kill', isKill);

    if (this.hitmarkerTimeoutHandle !== null) clearTimeout(this.hitmarkerTimeoutHandle);
    this.hitmarkerTimeoutHandle = setTimeout(() => {
      this.hitmarkerElement.classList.remove('is-visible');
      this.hitmarkerTimeoutHandle = null;
    }, HITMARKER_VISIBLE_SECONDS * 1000);
  }

  /** Red vignette pulse when the player takes damage. */
  showDamage(directionRadians) {
    const horizontalBias = Math.sin(directionRadians);
    const verticalBias = -Math.cos(directionRadians);
    this.damageVignetteElement.style.setProperty('--hud-damage-x', horizontalBias.toFixed(3));
    this.damageVignetteElement.style.setProperty('--hud-damage-y', verticalBias.toFixed(3));

    this.damageVignetteElement.classList.remove('is-visible');
    void this.damageVignetteElement.offsetWidth;
    this.damageVignetteElement.classList.add('is-visible');

    if (this.damageFlashTimeoutHandle !== null) clearTimeout(this.damageFlashTimeoutHandle);
    this.damageFlashTimeoutHandle = setTimeout(() => {
      this.damageVignetteElement.classList.remove('is-visible');
      this.damageFlashTimeoutHandle = null;
    }, DAMAGE_FLASH_VISIBLE_SECONDS * 1000);
  }

  /** @param {{ killerName: string, victimName: string, weaponLabel: string, involvesPlayer: boolean }} entry */
  addKillFeedEntry(entry) {
    const element = document.createElement('div');
    element.className = 'hud-kill-feed-entry';
    element.classList.toggle('involves-player', entry.involvesPlayer);

    const killer = document.createElement('span');
    killer.className = 'hud-kill-feed-killer';
    killer.textContent = entry.killerName;

    const weapon = document.createElement('span');
    weapon.className = 'hud-kill-feed-weapon';
    weapon.textContent = entry.weaponLabel;

    const victim = document.createElement('span');
    victim.className = 'hud-kill-feed-victim';
    victim.textContent = entry.victimName;

    element.appendChild(killer);
    element.appendChild(weapon);
    element.appendChild(victim);

    this.killFeedElement.insertBefore(element, this.killFeedElement.firstChild);

    this.killFeedEntries.push({
      element,
      expiresAtSeconds: nowInSeconds() + KILL_FEED_ENTRY_LIFETIME_SECONDS,
      isFading: false
    });
  }

  pruneKillFeedEntries() {
    if (this.killFeedEntries.length === 0) return;

    const now = nowInSeconds();
    let writeIndex = 0;

    for (const entry of this.killFeedEntries) {
      if (now >= entry.expiresAtSeconds) {
        entry.element.remove();
        continue;
      }

      const shouldFade = entry.expiresAtSeconds - now <= KILL_FEED_ENTRY_FADE_SECONDS;
      if (shouldFade !== entry.isFading) {
        entry.element.classList.toggle('is-fading', shouldFade);
        entry.isFading = shouldFade;
      }

      this.killFeedEntries[writeIndex] = entry;
      writeIndex += 1;
    }

    this.killFeedEntries.length = writeIndex;
  }
}

function nowInSeconds() {
  return performance.now() / 1000;
}

function formatClock(secondsRemaining) {
  const clampedSeconds = Math.max(0, Math.ceil(secondsRemaining));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
