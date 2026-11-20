import {
  isBotModeSortMode,
  type BotModeSortMode,
} from '@botharness/host-client/shared/bot-mode-settings';
import { uniqueStrings } from './roster.js';

export interface RosterConfig {
  collapsed: Record<string, boolean>;
}

export interface ConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LegacyRosterSection {
  id: string;
  name: string;
  channels: string[];
  collapsed?: boolean;
}

export interface LegacyRosterArrangement {
  pins: string[];
  sections: LegacyRosterSection[];
}

export interface LegacySortPreference {
  global?: BotModeSortMode;
  sections: Record<string, BotModeSortMode>;
}

export const ROSTER_CONFIG_KEY = 'botharness/roster.json';

export const ROSTER_BACKUP_KEY = 'botharness/roster.json.backup';

export const ROSTER_MIGRATED_KEY = 'botharness/roster.migrated';

function emptyConfig(): RosterConfig {
  return { collapsed: {} };
}

function legacyMode(value: unknown): BotModeSortMode | undefined {
  if (value === 'auto') return 'updated';
  return isBotModeSortMode(value) ? value : undefined;
}

function legacyRecord(storage: ConfigStorage | undefined): Record<string, unknown> | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function collapsedMap(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const collapsed: Record<string, boolean> = {};
  for (const [id, flag] of Object.entries(value as Record<string, unknown>)) {
    if (id.length > 0 && flag === true) collapsed[id] = true;
  }
  return collapsed;
}

export function parseRosterConfig(value: unknown): RosterConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyConfig();
  const record = value as Record<string, unknown>;
  const collapsed = collapsedMap(record['collapsed']);
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      if (typeof id === 'string' && id.length > 0 && raw['collapsed'] === true) {
        collapsed[id] = true;
      }
    }
  }
  return { collapsed };
}

export function loadRosterConfig(storage: ConfigStorage | undefined): RosterConfig {
  if (storage === undefined) return emptyConfig();
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return emptyConfig();
    return parseRosterConfig(JSON.parse(raw));
  } catch {
    return emptyConfig();
  }
}

export function saveRosterConfig(
  config: RosterConfig,
  storage: ConfigStorage | undefined,
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(ROSTER_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function toggleSectionCollapsed(config: RosterConfig, sectionId: string): RosterConfig {
  const collapsed = { ...config.collapsed };
  if (collapsed[sectionId] === true) delete collapsed[sectionId];
  else collapsed[sectionId] = true;
  return { collapsed };
}

export function parseLegacyRosterArrangement(value: unknown): LegacyRosterArrangement | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sections: LegacyRosterSection[] = [];
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      const name = raw['name'];
      if (typeof id !== 'string' || id.length === 0) continue;
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      const section: LegacyRosterSection = {
        id,
        name: name.trim(),
        channels: uniqueStrings(raw['channels']),
      };
      if (raw['collapsed'] === true) section.collapsed = true;
      sections.push(section);
    }
  }
  const pins = uniqueStrings(record['pins']);
  if (pins.length === 0 && sections.length === 0) return undefined;
  return { pins, sections };
}

export function loadLegacyRosterArrangement(
  storage: ConfigStorage | undefined,
): LegacyRosterArrangement | undefined {
  return parseLegacyRosterArrangement(legacyRecord(storage));
}

export function backupLegacyRoster(storage: ConfigStorage | undefined): boolean {
  if (storage === undefined) return false;
  try {
    const raw = storage.getItem(ROSTER_CONFIG_KEY);
    if (raw === null || raw.length === 0) return true;
    if (storage.getItem(ROSTER_BACKUP_KEY) !== null) return true;
    storage.setItem(ROSTER_BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function markRosterMigrated(storage: ConfigStorage | undefined): void {
  if (storage === undefined) return;
  try {
    storage.setItem(ROSTER_MIGRATED_KEY, new Date().toISOString());
  } catch {}
}

export function hasRosterMigrated(storage: ConfigStorage | undefined): boolean {
  if (storage === undefined) return false;
  try {
    return storage.getItem(ROSTER_MIGRATED_KEY) !== null;
  } catch {
    return false;
  }
}

export function readLegacySortPreference(
  storage: ConfigStorage | undefined,
): LegacySortPreference | undefined {
  const record = legacyRecord(storage);
  if (record === undefined) return undefined;
  const global = legacyMode(record['sortMode']);
  const sections: Record<string, BotModeSortMode> = {};
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const id = raw['id'];
      if (typeof id !== 'string' || id.length === 0) continue;
      const mode = legacyMode(raw['sortMode']);
      if (mode !== undefined) sections[id] = mode;
    }
  }
  if (global === undefined && Object.keys(sections).length === 0) return undefined;
  return {
    ...(global === undefined ? {} : { global }),
    sections,
  };
}

export function clearLegacySortPreference(storage: ConfigStorage | undefined): void {
  const record = legacyRecord(storage);
  if (record === undefined) return;
  let changed = false;
  if ('sortMode' in record) {
    delete record['sortMode'];
    changed = true;
  }
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      if ('sortMode' in raw) {
        delete raw['sortMode'];
        changed = true;
      }
    }
  }
  if (!changed) return;
  try {
    storage?.setItem(ROSTER_CONFIG_KEY, JSON.stringify(record));
  } catch {}
}

export function defaultStorage(): ConfigStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
