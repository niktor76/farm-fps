/**
 * Reading and writing the stored settings, and moving old ones forward.
 *
 * Two mechanisms share the work, and knowing which one to reach for is the
 * whole point of this file.
 *
 * Field-by-field validation in the menu handles everything ADDITIVE. Each
 * field is read with its own fallback and key bindings are rebuilt from the
 * current action list, so a new option appears with its default in an old
 * save, and a deleted one is ignored. That needs no migration and no version
 * bump -- adding an option is free.
 *
 * A migration is for the cases validation cannot see: a field that changes
 * MEANING while keeping its name, a rename that should carry the old value
 * over rather than silently resetting it, or a value whose range moved. Those
 * are invisible to a validator, because the old data still looks valid.
 *
 * The envelope exists so that distinction can be made at all. Without a
 * version there is no way to tell "the user never set this" from "the user set
 * this under the old meaning".
 */

const STORAGE_KEY = 'farm-fps-settings';

/** Bump only when adding a migration below. */
export const SETTINGS_VERSION = 1;

/**
 * Index n moves a version-n payload to version n+1. Each one receives the
 * settings object and returns the next shape; they run in order, so a save
 * from any past version is carried the whole way forward.
 *
 * Version 0 is the original unversioned blob: a bare settings object written
 * straight to the key, with no envelope around it.
 */
const MIGRATIONS = [
  // 0 -> 1: the envelope itself. The fields were already what version 1 wants,
  // so nothing inside changes; this only records that the shape is now known.
  (settings) => settings
];

/**
 * The stored settings, migrated to the current version. Returns an empty
 * object when there is nothing usable, which leaves every field to its default.
 *
 * @returns {Record<string, unknown>}
 */
export function readStoredSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};

  // An unversioned payload is the original format, where the settings were the
  // whole document rather than a field in it.
  const versioned = typeof parsed.version === 'number';
  let version = versioned ? parsed.version : 0;
  let settings = versioned ? parsed.settings : parsed;

  if (typeof settings !== 'object' || settings === null) return {};

  // A save from a future version cannot be migrated backwards, and guessing at
  // it risks feeding the menu fields that no longer mean what they say.
  if (version > SETTINGS_VERSION) return {};

  while (version < SETTINGS_VERSION) {
    settings = MIGRATIONS[version](settings);
    version += 1;
  }

  return settings;
}

/** @param {Record<string, unknown>} settings */
export function writeStoredSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings }));
}
