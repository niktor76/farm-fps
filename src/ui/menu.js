import {
  MATCH,
  INPUT,
  CAMERA,
  DIFFICULTIES,
  FEEL_PRESETS,
  DEFAULT_FEEL,
  DEFAULT_DIFFICULTY,
  AUDIO,
  DAY_CYCLES,
  DEFAULT_DAY_CYCLE,
  BINDABLE_ACTIONS,
  DEFAULT_KEY_BINDINGS,
  WEAPON_SLOT_KEY_CODES
} from '../config/tunables.js';

const STORAGE_KEY = 'farm-fps-settings';

const FEEL_DESCRIPTIONS = {
  arcade: 'Faster movement, longer time to kill.',
  balanced: 'The default middle ground.',
  tactical: 'Slower movement, fast and punishing time to kill.'
};

/**
 * Start screen: play button, bot count slider, difficulty, feel preset, time of
 * day, rebindable keys, and settings for input device, look sensitivity,
 * keyboard turn speed and volume. Settings persist in localStorage.
 *
 * Owned by PH-4-ui-shell, completed by PH-11-menu, extended by PH-13-trackpad
 * and PH-14-bindings.
 */
export class Menu {
  /**
   * @param {HTMLElement} root
   * @param {{ onPlay: (settings: MatchSettings) => void }} handlers
   */
  constructor(root, handlers) {
    this.handlers = handlers;
    this.settings = loadSettings();
    this.capture = null;

    this.container = document.createElement('div');
    this.container.className = 'menu';

    this.container.appendChild(this.buildTitleSection());
    this.container.appendChild(this.buildBotCountSection());
    this.container.appendChild(this.buildDifficultySection());
    this.container.appendChild(this.buildFeelSection());
    this.container.appendChild(this.buildDayCycleSection());
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

  buildDayCycleSection() {
    const section = document.createElement('div');
    section.className = 'menu-section';

    const label = document.createElement('label');
    label.className = 'menu-label';
    label.textContent = 'Time of day';
    section.appendChild(label);

    const group = document.createElement('div');
    group.className = 'menu-segmented-group menu-segmented-group--wrapped';

    for (const dayCycleKey of Object.keys(DAY_CYCLES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-segmented-button';
      button.textContent = DAY_CYCLES[dayCycleKey].label;
      button.dataset.key = dayCycleKey;
      button.classList.toggle('is-selected', dayCycleKey === this.settings.dayCycleKey);

      button.addEventListener('click', () => {
        this.settings.dayCycleKey = dayCycleKey;
        for (const sibling of group.children) {
          sibling.classList.toggle('is-selected', sibling.dataset.key === dayCycleKey);
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

    section.appendChild(this.buildDeviceModeRow());

    const device = INPUT.devices[this.settings.deviceMode];
    this.sensitivityControl = this.buildRangeRow({
      label: 'Look sensitivity',
      minimum: device.minimumSensitivity,
      maximum: device.maximumSensitivity,
      step: sensitivityStep(device),
      value: this.settings.sensitivity,
      formatValue: (value) => value.toFixed(4),
      onChange: (value) => {
        this.settings.sensitivity = value;
      }
    });
    section.appendChild(this.sensitivityControl.element);

    section.appendChild(
      this.buildRangeRow({
        label: 'Keyboard turn speed',
        minimum: INPUT.keyboardLook.minimumYawDegreesPerSecond,
        maximum: INPUT.keyboardLook.maximumYawDegreesPerSecond,
        step: INPUT.keyboardLook.stepDegreesPerSecond,
        value: this.settings.keyboardTurnDegreesPerSecond,
        formatValue: (value) => `${Math.round(value)}°/s`,
        onChange: (value) => {
          this.settings.keyboardTurnDegreesPerSecond = value;
        }
      }).element
    );

    section.appendChild(
      this.buildRangeRow({
        label: 'Field of view',
        minimum: CAMERA.minimumFieldOfView,
        maximum: CAMERA.maximumFieldOfView,
        step: 1,
        value: this.settings.fieldOfView,
        formatValue: (value) => `${Math.round(value)}°`,
        onChange: (value) => {
          this.settings.fieldOfView = value;
        }
      }).element
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
      }).element
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

  /**
   * Picking the device swaps the sensitivity range as well as the value: a
   * sensible mouse number is a useless trackpad number.
   */
  buildDeviceModeRow() {
    const row = document.createElement('div');
    row.className = 'menu-slider-row';

    const text = document.createElement('label');
    text.className = 'menu-slider-label';
    text.textContent = 'Input device';
    row.appendChild(text);

    const group = document.createElement('div');
    group.className = 'menu-segmented-group';

    for (const deviceKey of Object.keys(INPUT.devices)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-segmented-button';
      button.textContent = INPUT.devices[deviceKey].label;
      button.dataset.key = deviceKey;
      button.classList.toggle('is-selected', deviceKey === this.settings.deviceMode);

      button.addEventListener('click', () => {
        const device = INPUT.devices[deviceKey];
        this.settings.deviceMode = deviceKey;
        this.settings.sensitivity = device.defaultSensitivity;

        this.sensitivityControl.setRange({
          minimum: device.minimumSensitivity,
          maximum: device.maximumSensitivity,
          step: sensitivityStep(device),
          value: device.defaultSensitivity
        });

        for (const sibling of group.children) {
          sibling.classList.toggle('is-selected', sibling.dataset.key === deviceKey);
        }
        this.persist();
      });

      group.appendChild(button);
    }

    row.appendChild(group);
    return row;
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

    return {
      element: row,
      setRange: ({ minimum: newMinimum, maximum: newMaximum, step: newStep, value: newValue }) => {
        slider.min = String(newMinimum);
        slider.max = String(newMaximum);
        slider.step = String(newStep);
        slider.value = String(newValue);
        valueDisplay.textContent = formatValue(newValue);
      }
    };
  }

  buildControlsSection() {
    const section = document.createElement('div');
    section.className = 'menu-section menu-controls';

    const heading = document.createElement('div');
    heading.className = 'menu-label';
    heading.textContent = 'Controls';
    section.appendChild(heading);

    this.bindingRows = new Map();

    const list = document.createElement('div');
    list.className = 'menu-binding-list';
    for (const { action, label } of BINDABLE_ACTIONS) {
      list.appendChild(this.buildBindingRow(action, label));
    }
    section.appendChild(list);

    this.bindingMessage = document.createElement('p');
    this.bindingMessage.className = 'menu-binding-message';
    section.appendChild(this.bindingMessage);

    const note = document.createElement('p');
    note.className = 'menu-binding-note';
    note.textContent = `${WEAPON_SLOT_KEY_CODES.map(formatKeyCode).join(' ')} and the mouse wheel switch weapons, the left mouse button fires. Those are fixed.`;
    section.appendChild(note);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'menu-binding-reset';
    resetButton.textContent = 'Reset to defaults';
    resetButton.addEventListener('click', () => {
      this.cancelCapture();
      this.settings.keyBindings = cloneBindings(DEFAULT_KEY_BINDINGS);
      for (const action of this.bindingRows.keys()) this.refreshBindingRow(action);
      this.bindingMessage.textContent = '';
      this.persist();
    });
    section.appendChild(resetButton);

    return section;
  }

  buildBindingRow(action, label) {
    const row = document.createElement('div');
    row.className = 'menu-binding-row';

    const name = document.createElement('span');
    name.className = 'menu-binding-label';
    name.textContent = label;

    const keys = document.createElement('span');
    keys.className = 'menu-binding-keys';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-binding-button';
    button.textContent = 'Rebind';
    button.addEventListener('click', () => this.startCapture(action));

    row.appendChild(name);
    row.appendChild(keys);
    row.appendChild(button);

    this.bindingRows.set(action, { row, keys, button });
    this.refreshBindingRow(action);
    return row;
  }

  refreshBindingRow(action) {
    const { keys } = this.bindingRows.get(action);
    const keyCodes = this.settings.keyBindings[action];

    keys.textContent = keyCodes.length
      ? keyCodes.map(formatKeyCode).join(' / ')
      : KEYLESS_ACTION_LABELS[action] ?? 'Unbound';
    keys.classList.toggle('is-keyless', keyCodes.length === 0);
  }

  /**
   * The next keydown anywhere becomes the binding. The listener runs in the
   * capture phase so the key never reaches the control it was pressed over.
   */
  startCapture(action) {
    this.cancelCapture();
    this.bindingMessage.textContent = '';

    const { row, button } = this.bindingRows.get(action);
    row.classList.add('is-capturing');
    button.textContent = 'Press a key';

    const onKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancelCapture();
      if (event.code === 'Escape') return;
      this.applyBinding(action, event.code);
    };

    this.capture = { action, onKeyDown };
    window.addEventListener('keydown', onKeyDown, true);
  }

  cancelCapture() {
    if (!this.capture) return;

    window.removeEventListener('keydown', this.capture.onKeyDown, true);
    const { row, button } = this.bindingRows.get(this.capture.action);
    row.classList.remove('is-capturing');
    button.textContent = 'Rebind';
    this.capture = null;
  }

  /**
   * One key drives one action. A key taken from another action is removed
   * there, unless it was that action's last key: an action with no key left
   * could never be performed again, so the rebind is refused instead. The
   * exception is an action in KEYLESS_ACTION_LABELS, which the mouse covers.
   */
  applyBinding(action, keyCode) {
    const keyLabel = formatKeyCode(keyCode);

    if (WEAPON_SLOT_KEY_CODES.includes(keyCode)) {
      this.bindingMessage.textContent = `${keyLabel} switches weapons and cannot be rebound.`;
      return;
    }

    const bindings = this.settings.keyBindings;
    const conflicting = BINDABLE_ACTIONS.find(
      (entry) => entry.action !== action && bindings[entry.action].includes(keyCode)
    );

    const emptyingConflicting =
      conflicting &&
      bindings[conflicting.action].length === 1 &&
      !(conflicting.action in KEYLESS_ACTION_LABELS);

    if (emptyingConflicting) {
      this.bindingMessage.textContent = `${keyLabel} is the only key for ${conflicting.label} and stays there.`;
      return;
    }

    bindings[action] = [keyCode];

    if (conflicting) {
      bindings[conflicting.action] = bindings[conflicting.action].filter(
        (boundKeyCode) => boundKeyCode !== keyCode
      );
      this.refreshBindingRow(conflicting.action);
      this.bindingMessage.textContent = `${keyLabel} taken from ${conflicting.label}.`;
    }

    this.refreshBindingRow(action);
    this.persist();
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
    this.cancelCapture();
    this.container.classList.add('is-hidden');
  }

  /** @returns {MatchSettings} */
  getSettings() {
    return { ...this.settings, keyBindings: cloneBindings(this.settings.keyBindings) };
  }
}

/**
 * Actions that stay performable with no key bound, and what the controls list
 * shows instead of a key. Fire is the only one: the mouse button always fires
 * and is not rebindable, so an empty list is a valid state for it alone.
 */
const KEYLESS_ACTION_LABELS = { fire: 'Mouse click' };

const MODIFIER_LABELS = { Shift: 'Shift', Control: 'Control', Alt: 'Alt', Meta: 'Command' };

/** Turns a KeyboardEvent.code into something a player recognises on sight. */
function formatKeyCode(keyCode) {
  if (keyCode.startsWith('Key')) return keyCode.slice(3);
  if (keyCode.startsWith('Digit')) return keyCode.slice(5);
  if (keyCode.startsWith('Arrow')) return keyCode.slice(5);
  if (keyCode.startsWith('Numpad')) return `Numpad ${keyCode.slice(6)}`;

  const sided = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(keyCode);
  if (sided) return `${sided[2]} ${MODIFIER_LABELS[sided[1]]}`;

  return keyCode.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function cloneBindings(bindings) {
  return Object.fromEntries(
    Object.entries(bindings).map(([action, keyCodes]) => [action, [...keyCodes]])
  );
}

function sensitivityStep(device) {
  return (device.maximumSensitivity - device.minimumSensitivity) / INPUT.sensitivitySliderSteps;
}

/**
 * Stored settings are editable by hand, so a value is only accepted when it is
 * both finite and inside its control's range. An out-of-range bot count would
 * otherwise spawn until the browser gave up.
 */
function storedNumber(value, fallback, minimum, maximum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function readStoredSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return {};
  }
  return typeof parsed === 'object' && parsed !== null ? parsed : {};
}

/** @returns {MatchSettings} */
function loadSettings() {
  const parsed = readStoredSettings();
  const deviceMode = INPUT.devices[parsed.deviceMode] ? parsed.deviceMode : INPUT.defaultDeviceMode;
  const device = INPUT.devices[deviceMode];

  return {
    botCount: Math.round(
      storedNumber(parsed.botCount, MATCH.defaultBotCount, MATCH.minimumBotCount, MATCH.maximumBotCount)
    ),
    difficultyKey: DIFFICULTIES[parsed.difficultyKey] ? parsed.difficultyKey : DEFAULT_DIFFICULTY,
    feelKey: FEEL_PRESETS[parsed.feelKey] ? parsed.feelKey : DEFAULT_FEEL,
    deviceMode,
    sensitivity: storedNumber(
      parsed.sensitivity,
      device.defaultSensitivity,
      device.minimumSensitivity,
      device.maximumSensitivity
    ),
    keyboardTurnDegreesPerSecond: storedNumber(
      parsed.keyboardTurnDegreesPerSecond,
      INPUT.keyboardLook.yawDegreesPerSecond,
      INPUT.keyboardLook.minimumYawDegreesPerSecond,
      INPUT.keyboardLook.maximumYawDegreesPerSecond
    ),
    fieldOfView: storedNumber(
      parsed.fieldOfView,
      CAMERA.fieldOfView,
      CAMERA.minimumFieldOfView,
      CAMERA.maximumFieldOfView
    ),
    volume: storedNumber(parsed.volume, AUDIO.defaultVolume, 0, 1),
    showNametags: typeof parsed.showNametags === 'boolean' ? parsed.showNametags : true,
    dayCycleKey: DAY_CYCLES[parsed.dayCycleKey] ? parsed.dayCycleKey : DEFAULT_DAY_CYCLE,
    keyBindings: loadKeyBindings(parsed.keyBindings)
  };
}

/**
 * An action falls back to its default unless it stored a list of key codes.
 * The list may only be empty for an action the mouse covers on its own.
 */
function loadKeyBindings(stored) {
  const bindings = {};

  for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
    const keyCodes = stored?.[action];
    const usable =
      Array.isArray(keyCodes) &&
      (keyCodes.length > 0 || action in KEYLESS_ACTION_LABELS) &&
      keyCodes.every((keyCode) => typeof keyCode === 'string');

    bindings[action] = usable ? [...keyCodes] : [...DEFAULT_KEY_BINDINGS[action]];
  }

  return bindings;
}

/**
 * @typedef {{
 *   botCount: number,
 *   difficultyKey: 'easy'|'medium'|'hard',
 *   feelKey: 'arcade'|'balanced'|'tactical',
 *   deviceMode: 'mouse'|'trackpad',
 *   sensitivity: number,
 *   keyboardTurnDegreesPerSecond: number,
 *   fieldOfView: number,
 *   volume: number,
 *   showNametags: boolean,
 *   dayCycleKey: 'morning'|'noon'|'evening'|'night',
 *   keyBindings: Record<string, string[]>
 * }} MatchSettings
 */
