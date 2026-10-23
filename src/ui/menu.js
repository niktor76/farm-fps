import {
  MATCH,
  CAMERA,
  DIFFICULTIES,
  FEEL_PRESETS,
  DEFAULT_FEEL,
  DEFAULT_DIFFICULTY,
  AUDIO
} from '../config/tunables.js';

const STORAGE_KEY = 'farm-fps-settings';

const FEEL_DESCRIPTIONS = {
  arcade: 'Faster movement, longer time to kill.',
  balanced: 'The default middle ground.',
  tactical: 'Slower movement, fast and punishing time to kill.'
};

/**
 * Start screen: play button, bot count slider, difficulty, feel preset, and
 * settings for mouse sensitivity and volume. Settings persist in localStorage.
 *
 * Owned by PH-4-ui-shell, completed by PH-11-menu.
 */
export class Menu {
  /**
   * @param {HTMLElement} root
   * @param {{ onPlay: (settings: MatchSettings) => void }} handlers
   */
  constructor(root, handlers) {
    this.handlers = handlers;
    this.settings = loadSettings();

    this.container = document.createElement('div');
    this.container.className = 'menu';

    this.container.appendChild(this.buildTitleSection());
    this.container.appendChild(this.buildBotCountSection());
    this.container.appendChild(this.buildDifficultySection());
    this.container.appendChild(this.buildFeelSection());
    this.container.appendChild(this.buildSettingsSection());
    this.container.appendChild(this.buildControlsSection());
    this.container.appendChild(this.buildPlaySection());

    root.appendChild(this.container);
  }

  buildTitleSection() {
    const section = document.createElement('div');
    section.className = 'menu-title';

    const heading = document.createElement('h1');
    heading.textContent = 'Farm FPS';
    section.appendChild(heading);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Free-for-all deathmatch on a working farm.';
    section.appendChild(subtitle);

    return section;
  }

  buildBotCountSection() {
    const section = document.createElement('div');
    section.className = 'menu-section';

    const label = document.createElement('label');
    label.className = 'menu-label';
    label.textContent = 'Bots';
    section.appendChild(label);

    const row = document.createElement('div');
    row.className = 'menu-slider-row';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(MATCH.minimumBotCount);
    slider.max = String(MATCH.maximumBotCount);
    slider.step = '1';
    slider.value = String(this.settings.botCount);
    slider.className = 'menu-slider';

    const value = document.createElement('span');
    value.className = 'menu-slider-value';
    value.textContent = String(this.settings.botCount);

    slider.addEventListener('input', () => {
      this.settings.botCount = Number(slider.value);
      value.textContent = slider.value;
      this.persist();
    });

    row.appendChild(slider);
    row.appendChild(value);
    section.appendChild(row);

    return section;
  }

  buildDifficultySection() {
    const section = document.createElement('div');
    section.className = 'menu-section';

    const label = document.createElement('label');
    label.className = 'menu-label';
    label.textContent = 'Difficulty';
    section.appendChild(label);

    const group = document.createElement('div');
    group.className = 'menu-segmented-group';

    for (const difficultyKey of Object.keys(DIFFICULTIES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-segmented-button';
      button.textContent = DIFFICULTIES[difficultyKey].label;
      button.dataset.key = difficultyKey;
      button.classList.toggle('is-selected', difficultyKey === this.settings.difficultyKey);

      button.addEventListener('click', () => {
        this.settings.difficultyKey = difficultyKey;
        for (const sibling of group.children) {
          sibling.classList.toggle('is-selected', sibling.dataset.key === difficultyKey);
        }
        this.persist();
      });

      group.appendChild(button);
    }

    section.appendChild(group);
    return section;
  }

  buildFeelSection() {
    const section = document.createElement('div');
    section.className = 'menu-section';

    const label = document.createElement('label');
    label.className = 'menu-label';
    label.textContent = 'Feel';
    section.appendChild(label);

    const group = document.createElement('div');
    group.className = 'menu-segmented-group menu-segmented-group--described';

    for (const feelKey of Object.keys(FEEL_PRESETS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-segmented-button menu-segmented-button--described';
      button.dataset.key = feelKey;
      button.classList.toggle('is-selected', feelKey === this.settings.feelKey);

      const name = document.createElement('span');
      name.className = 'menu-segmented-button-name';
      name.textContent = FEEL_PRESETS[feelKey].label;

      const description = document.createElement('span');
      description.className = 'menu-segmented-button-description';
      description.textContent = FEEL_DESCRIPTIONS[feelKey];

      button.appendChild(name);
      button.appendChild(description);

      button.addEventListener('click', () => {
        this.settings.feelKey = feelKey;
        for (const sibling of group.children) {
          sibling.classList.toggle('is-selected', sibling.dataset.key === feelKey);
        }
        this.persist();
      });

      group.appendChild(button);
    }

    section.appendChild(group);
    return section;
  }

  buildSettingsSection() {
    const section = document.createElement('div');
    section.className = 'menu-section menu-settings';

    const heading = document.createElement('div');
    heading.className = 'menu-label';
    heading.textContent = 'Settings';
    section.appendChild(heading);

    section.appendChild(
      this.buildRangeRow({
        label: 'Mouse sensitivity',
        minimum: CAMERA.minimumSensitivity,
        maximum: CAMERA.maximumSensitivity,
        step: (CAMERA.maximumSensitivity - CAMERA.minimumSensitivity) / 100,
        value: this.settings.sensitivity,
        formatValue: (value) => value.toFixed(4),
        onChange: (value) => {
          this.settings.sensitivity = value;
        }
      })
    );

    section.appendChild(
      this.buildRangeRow({
        label: 'Volume',
        minimum: 0,
        maximum: 1,
        step: 0.01,
        value: this.settings.volume,
        formatValue: (value) => `${Math.round(value * 100)}%`,
        onChange: (value) => {
          this.settings.volume = value;
        }
      })
    );

    const checkboxRow = document.createElement('label');
    checkboxRow.className = 'menu-checkbox-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.settings.showNametags;
    checkbox.addEventListener('change', () => {
      this.settings.showNametags = checkbox.checked;
      this.persist();
    });

    const checkboxLabel = document.createElement('span');
    checkboxLabel.textContent = 'Show bot nametags';

    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(checkboxLabel);
    section.appendChild(checkboxRow);

    return section;
  }

  buildRangeRow({ label, minimum, maximum, step, value, formatValue, onChange }) {
    const row = document.createElement('div');
    row.className = 'menu-slider-row';

    const text = document.createElement('label');
    text.className = 'menu-slider-label';
    text.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(minimum);
    slider.max = String(maximum);
    slider.step = String(step);
    slider.value = String(value);
    slider.className = 'menu-slider';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'menu-slider-value';
    valueDisplay.textContent = formatValue(value);

    slider.addEventListener('input', () => {
      const numericValue = Number(slider.value);
      onChange(numericValue);
      valueDisplay.textContent = formatValue(numericValue);
      this.persist();
    });

    row.appendChild(text);
    row.appendChild(slider);
    row.appendChild(valueDisplay);
    return row;
  }

  buildControlsSection() {
    const section = document.createElement('div');
    section.className = 'menu-section menu-controls';

    const heading = document.createElement('div');
    heading.className = 'menu-label';
    heading.textContent = 'Controls';
    section.appendChild(heading);

    const list = document.createElement('dl');
    list.className = 'menu-controls-list';

    const entries = [
      ['W A S D', 'Move'],
      ['Shift', 'Sprint'],
      ['Space', 'Jump'],
      ['Control / C', 'Crouch'],
      ['1-5 / Wheel', 'Switch weapon'],
      ['R', 'Reload'],
      ['Tab', 'Scoreboard']
    ];

    for (const [keys, action] of entries) {
      const term = document.createElement('dt');
      term.textContent = keys;
      const description = document.createElement('dd');
      description.textContent = action;
      list.appendChild(term);
      list.appendChild(description);
    }

    section.appendChild(list);
    return section;
  }

  buildPlaySection() {
    const section = document.createElement('div');
    section.className = 'menu-play-section';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-play-button';
    button.textContent = 'Play';
    button.addEventListener('click', () => {
      this.handlers.onPlay(this.getSettings());
    });

    section.appendChild(button);
    return section;
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  show() {
    this.container.classList.remove('is-hidden');
  }

  hide() {
    this.container.classList.add('is-hidden');
  }

  /** @returns {MatchSettings} */
  getSettings() {
    return { ...this.settings };
  }
}

/** @returns {MatchSettings} */
function loadSettings() {
  const defaults = {
    botCount: MATCH.defaultBotCount,
    difficultyKey: DEFAULT_DIFFICULTY,
    feelKey: DEFAULT_FEEL,
    sensitivity: CAMERA.defaultSensitivity,
    volume: AUDIO.defaultVolume,
    showNametags: true
  };

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaults;

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return defaults;
  }
  if (typeof parsed !== 'object' || parsed === null) return defaults;

  return {
    botCount: Number.isFinite(parsed.botCount) ? parsed.botCount : defaults.botCount,
    difficultyKey: DIFFICULTIES[parsed.difficultyKey] ? parsed.difficultyKey : defaults.difficultyKey,
    feelKey: FEEL_PRESETS[parsed.feelKey] ? parsed.feelKey : defaults.feelKey,
    sensitivity: Number.isFinite(parsed.sensitivity) ? parsed.sensitivity : defaults.sensitivity,
    volume: Number.isFinite(parsed.volume) ? parsed.volume : defaults.volume,
    showNametags: typeof parsed.showNametags === 'boolean' ? parsed.showNametags : defaults.showNametags
  };
}

/**
 * @typedef {{
 *   botCount: number,
 *   difficultyKey: 'easy'|'medium'|'hard',
 *   feelKey: 'arcade'|'balanced'|'tactical',
 *   sensitivity: number,
 *   volume: number,
 *   showNametags: boolean
 * }} MatchSettings
 */
