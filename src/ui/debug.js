import { DIFFICULTIES } from '../config/tunables.js';

/**
 * Development overlay, toggled with the backtick key. Shows frame time, draw
 * calls, triangle count and bot states, and can draw the collision boxes and
 * waypoint graph as wireframes.
 *
 * Also exposes the bot difficulty numbers for live tuning, so a playtest can
 * retune without a rebuild (DEC-6).
 *
 * Owned by PH-11-menu.
 */

const FRAME_BUDGET_MILLISECONDS = 16.6;

/**
 * One slider per tunable difficulty field. Ranges are sized around the span
 * the easy/medium/hard tiers already cover in tunables.js, with headroom on
 * both sides for an out-of-tier playtest value.
 */
const DIFFICULTY_SLIDERS = [
  { key: 'reactionDelay', label: 'Reaction delay', minimum: 0, maximum: 1, step: 0.01, decimals: 2 },
  { key: 'initialAimErrorDegrees', label: 'Aim error (deg)', minimum: 0, maximum: 40, step: 0.5, decimals: 1 },
  { key: 'aimErrorDecayPerSecond', label: 'Aim decay', minimum: 0, maximum: 3, step: 0.05, decimals: 2 },
  { key: 'reaimInterval', label: 'Reaim interval', minimum: 0.1, maximum: 2, step: 0.05, decimals: 2 },
  { key: 'movementSpeedFactor', label: 'Move speed', minimum: 0.1, maximum: 1.5, step: 0.05, decimals: 2 },
  { key: 'viewDistance', label: 'View distance', minimum: 10, maximum: 150, step: 1, decimals: 0 },
  { key: 'fieldOfViewDegrees', label: 'Field of view', minimum: 30, maximum: 180, step: 1, decimals: 0 },
  { key: 'coverSeekChance', label: 'Cover seek chance', minimum: 0, maximum: 1, step: 0.01, decimals: 2 },
  { key: 'burstRestMinimum', label: 'Burst rest min', minimum: 0, maximum: 1, step: 0.01, decimals: 2 },
  { key: 'burstRestMaximum', label: 'Burst rest max', minimum: 0, maximum: 2, step: 0.01, decimals: 2 }
];

export class DebugPanel {
  /**
   * @param {HTMLElement} root
   * @param {{
   *   renderer: import('three').WebGLRenderer,
   *   stats: import('../core/debugStats.js').DebugStats,
   *   collisionWorld: import('../world/collision.js').CollisionWorld,
   *   waypoints: import('../world/waypoints.js').WaypointGraph,
   *   scene: import('three').Scene,
   *   fighters: import('../entities/fighter.js').Fighter[],
   *   bots: import('../entities/bot.js').Bot[],
   *   effects: import('../weapons/effects.js').EffectSystem,
   *   difficultyKey: string
   * }} context
   */
  constructor(root, context) {
    this.context = context;
    this.visible = false;
    this.collisionMesh = null;
    this.waypointMesh = null;
    this.overAverageBudget = false;
    this.overWorstBudget = false;

    this.element = document.createElement('div');
    this.element.className = 'debug-panel is-hidden';
    root.appendChild(this.element);

    const performanceSection = this.buildSection('Performance');
    this.framesPerSecond = this.buildStatRow(performanceSection, 'FPS');
    this.averageFrameTime = this.buildStatRow(performanceSection, 'Frame avg (ms)');
    this.worstFrameTime = this.buildStatRow(performanceSection, 'Frame worst (ms)');
    this.drawCalls = this.buildStatRow(performanceSection, 'Draw calls');
    this.triangles = this.buildStatRow(performanceSection, 'Triangles');
    this.programs = this.buildStatRow(performanceSection, 'Programs');
    this.geometries = this.buildStatRow(performanceSection, 'Geometries');
    this.textures = this.buildStatRow(performanceSection, 'Textures');

    const worldSection = this.buildSection('World');
    this.collisionBoxes = this.buildStatRow(worldSection, 'Collision boxes');
    this.waypointNodes = this.buildStatRow(worldSection, 'Waypoint nodes');
    this.waypointEdges = this.buildStatRow(worldSection, 'Waypoint edges');
    this.activeEffects = this.buildStatRow(worldSection, 'Active effects');
    this.fightersAlive = this.buildStatRow(worldSection, 'Fighters alive');

    this.buildBotSection(context.bots);
    this.buildWireframeSection(context);
    this.buildDifficultySection(context.difficultyKey);

    this.handleKeyDown = (event) => {
      if (event.code === 'Backquote') this.toggle();
    };
    window.addEventListener('keydown', this.handleKeyDown);
  }

  buildSection(title) {
    const section = document.createElement('div');
    section.className = 'debug-panel-section';

    const heading = document.createElement('div');
    heading.className = 'debug-panel-section-title';
    heading.textContent = title;
    section.appendChild(heading);

    this.element.appendChild(section);
    return section;
  }

  /** @returns {{ element: HTMLElement, lastValue: string | null }} */
  buildStatRow(section, label) {
    const row = document.createElement('div');
    row.className = 'debug-panel-row';

    const labelElement = document.createElement('span');
    labelElement.textContent = label;

    const valueElement = document.createElement('span');
    valueElement.className = 'debug-panel-row-value';

    row.appendChild(labelElement);
    row.appendChild(valueElement);
    section.appendChild(row);

    return { element: valueElement, lastValue: null };
  }

  writeStat(entry, text) {
    if (entry.lastValue === text) return;
    entry.lastValue = text;
    entry.element.textContent = text;
  }

  buildBotSection(bots) {
    const section = this.buildSection('Bots');

    const table = document.createElement('table');
    table.className = 'debug-panel-bot-table';

    const head = document.createElement('tr');
    for (const title of ['Name', 'State', 'HP', 'K', 'Rsv']) {
      const headCell = document.createElement('th');
      headCell.textContent = title;
      head.appendChild(headCell);
    }
    table.appendChild(head);

    this.botRows = bots.map((bot) => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = bot.name;

      const stateCell = document.createElement('td');
      const healthCell = document.createElement('td');
      const killsCell = document.createElement('td');
      const reservationCell = document.createElement('td');

      row.appendChild(nameCell);
      row.appendChild(stateCell);
      row.appendChild(healthCell);
      row.appendChild(killsCell);
      row.appendChild(reservationCell);
      table.appendChild(row);

      return {
        bot,
        row,
        state: { element: stateCell, lastValue: null },
        health: { element: healthCell, lastValue: null },
        kills: { element: killsCell, lastValue: null },
        reservation: { element: reservationCell, lastValue: null },
        lastAlive: null
      };
    });

    section.appendChild(table);
  }

  buildWireframeSection(context) {
    const section = this.buildSection('Wireframes');

    section.appendChild(
      this.buildCheckboxRow('Collision boxes', (checked) => {
        if (checked && this.collisionMesh === null) {
          this.collisionMesh = context.collisionWorld.buildDebugMesh();
          context.scene.add(this.collisionMesh);
        }
        if (this.collisionMesh !== null) this.collisionMesh.visible = checked;
      })
    );

    section.appendChild(
      this.buildCheckboxRow('Waypoint graph', (checked) => {
        if (checked && this.waypointMesh === null) {
          this.waypointMesh = context.waypoints.buildDebugMesh();
          context.scene.add(this.waypointMesh);
        }
        if (this.waypointMesh !== null) this.waypointMesh.visible = checked;
      })
    );
  }

  buildCheckboxRow(label, onChange) {
    const row = document.createElement('label');
    row.className = 'menu-checkbox-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    const text = document.createElement('span');
    text.textContent = label;

    row.appendChild(checkbox);
    row.appendChild(text);
    return row;
  }

  buildDifficultySection(difficultyKey) {
    const section = this.buildSection(`Difficulty (${DIFFICULTIES[difficultyKey].label})`);
    const difficulty = DIFFICULTIES[difficultyKey];

    for (const field of DIFFICULTY_SLIDERS) {
      const row = document.createElement('div');
      row.className = 'menu-slider-row';

      const label = document.createElement('span');
      label.className = 'menu-slider-label';
      label.textContent = field.label;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'menu-slider';
      slider.min = field.minimum;
      slider.max = field.maximum;
      slider.step = field.step;
      slider.value = difficulty[field.key];

      const value = document.createElement('span');
      value.className = 'menu-slider-value';
      value.textContent = difficulty[field.key].toFixed(field.decimals);

      slider.addEventListener('input', () => {
        const parsed = Number(slider.value);
        difficulty[field.key] = parsed;
        value.textContent = parsed.toFixed(field.decimals);
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(value);
      section.appendChild(row);
    }
  }

  toggle() {
    this.visible = !this.visible;
    this.element.classList.toggle('is-hidden', !this.visible);
  }

  update(context) {
    if (!this.visible) return;

    this.writeStat(this.framesPerSecond, context.stats.framesPerSecond.toFixed(0));

    const averageFrameMilliseconds = context.stats.averageFrameMilliseconds;
    const worstFrameMilliseconds = context.stats.worstFrameMilliseconds;
    this.writeStat(this.averageFrameTime, averageFrameMilliseconds.toFixed(2));
    this.writeStat(this.worstFrameTime, worstFrameMilliseconds.toFixed(2));

    const overAverageBudget = averageFrameMilliseconds > FRAME_BUDGET_MILLISECONDS;
    if (overAverageBudget !== this.overAverageBudget) {
      this.overAverageBudget = overAverageBudget;
      this.averageFrameTime.element.classList.toggle('is-over-budget', overAverageBudget);
    }

    const overWorstBudget = worstFrameMilliseconds > FRAME_BUDGET_MILLISECONDS;
    if (overWorstBudget !== this.overWorstBudget) {
      this.overWorstBudget = overWorstBudget;
      this.worstFrameTime.element.classList.toggle('is-over-budget', overWorstBudget);
    }

    const info = context.renderer.info;
    this.writeStat(this.drawCalls, String(info.render.calls));
    this.writeStat(this.triangles, String(info.render.triangles));
    this.writeStat(this.programs, String(info.programs?.length ?? 0));
    this.writeStat(this.geometries, String(info.memory.geometries));
    this.writeStat(this.textures, String(info.memory.textures));

    this.writeStat(this.collisionBoxes, String(context.collisionWorld.boxes.length));
    this.writeStat(this.waypointNodes, String(context.waypoints.nodeCount));
    this.writeStat(this.waypointEdges, String(context.waypoints.edgeTarget.length));
    this.writeStat(this.activeEffects, String(context.effects.activeCount));

    const livingFighters = context.fighters.filter((fighter) => fighter.alive).length;
    this.writeStat(this.fightersAlive, `${livingFighters} / ${context.fighters.length}`);

    for (const entry of this.botRows) {
      const bot = entry.bot;
      if (bot.alive !== entry.lastAlive) {
        entry.lastAlive = bot.alive;
        entry.row.classList.toggle('is-dead', !bot.alive);
      }

      this.writeStat(entry.state, bot.state);
      this.writeStat(entry.health, String(Math.ceil(bot.health)));
      this.writeStat(entry.kills, String(bot.kills));
      this.writeStat(entry.reservation, bot.reservedNode !== -1 ? 'yes' : '-');
    }
  }
}
