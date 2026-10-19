import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';

export const IDLE_COMPACTION_SETTINGS_FILE = 'idle-compaction.json';
export const IDLE_COMPACTION_OBSERVATIONS_FILE = 'idle-compaction-observations.json';

export const MAX_CACHE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export interface IdleCompactionRoute {
  provider: string;
  model: string;
}

export interface IdleCompactionSettingsValue {
  enabled: boolean;
  cacheLifetimes: Record<string, number>;
}

export interface RouteCacheObservation {
  warmGapMs?: number;
  coldGapMs?: number;
  samples: number;
}

export interface IdleCompactionSettings {
  read(): IdleCompactionSettingsValue | 'invalid';
  setEnabled(enabled: boolean): IdleCompactionSettingsValue;
  setCacheLifetime(route: IdleCompactionRoute, seconds: number | null): IdleCompactionSettingsValue;
  observations(): Record<string, RouteCacheObservation>;
  saveObservation(key: string, observation: RouteCacheObservation): void;
}

export function routeKey(route: IdleCompactionRoute): string {
  return `${route.provider}/${route.model}`;
}

export function isCacheLifetimeSeconds(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CACHE_LIFETIME_SECONDS
  );
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseSettings(parsed: unknown): IdleCompactionSettingsValue | 'invalid' {
  if (parsed === undefined) return { enabled: true, cacheLifetimes: {} };
  if (typeof parsed !== 'object' || parsed === null) return 'invalid';
  const record = parsed as { enabled?: unknown; cacheLifetimes?: unknown };
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean') return 'invalid';
  const lifetimes = record.cacheLifetimes ?? {};
  if (typeof lifetimes !== 'object' || lifetimes === null || Array.isArray(lifetimes))
    return 'invalid';
  const cacheLifetimes: Record<string, number> = {};
  for (const [key, seconds] of Object.entries(lifetimes)) {
    if (!isCacheLifetimeSeconds(seconds)) return 'invalid';
    cacheLifetimes[key] = seconds;
  }
  return { enabled: record.enabled ?? true, cacheLifetimes };
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function createIdleCompactionSettings(dir: string): IdleCompactionSettings {
  const settingsFile = join(dir, IDLE_COMPACTION_SETTINGS_FILE);
  const observationsFile = join(dir, IDLE_COMPACTION_OBSERVATIONS_FILE);
  const write = (value: IdleCompactionSettingsValue): IdleCompactionSettingsValue => {
    mkdirSync(dir, { recursive: true });
    atomicWriteFile(settingsFile, JSON.stringify(value, null, 2) + '\n');
    return value;
  };
  const current = (): IdleCompactionSettingsValue => {
    const value = settings.read();
    if (value === 'invalid')
      throw new Error(`${IDLE_COMPACTION_SETTINGS_FILE} cannot be read; fix or delete it`);
    return value;
  };
  let observed: Record<string, RouteCacheObservation> | undefined;
  const settings: IdleCompactionSettings = {
    read() {
      try {
        return parseSettings(readJson(settingsFile));
      } catch {
        return 'invalid';
      }
    },
    setEnabled(enabled) {
      return write({ ...current(), enabled });
    },
    setCacheLifetime(route, seconds) {
      const value = current();
      const cacheLifetimes = { ...value.cacheLifetimes };
      if (seconds === null) delete cacheLifetimes[routeKey(route)];
      else cacheLifetimes[routeKey(route)] = seconds;
      return write({ ...value, cacheLifetimes });
    },
    observations() {
      if (observed !== undefined) return observed;
      observed = {};
      let parsed: unknown;
      try {
        parsed = readJson(observationsFile);
      } catch {
        parsed = undefined;
      }
      const routes = (parsed as { routes?: unknown } | undefined)?.routes;
      if (typeof routes === 'object' && routes !== null)
        for (const [key, entry] of Object.entries(routes)) {
          const record = (entry ?? {}) as Record<string, unknown>;
          const warmGapMs = count(record['warmGapMs']);
          const coldGapMs = count(record['coldGapMs']);
          observed[key] = {
            samples: count(record['samples']) ?? 0,
            ...(warmGapMs === undefined ? {} : { warmGapMs }),
            ...(coldGapMs === undefined ? {} : { coldGapMs }),
          };
        }
      return observed;
    },
    saveObservation(key, observation) {
      const routes = { ...settings.observations(), [key]: observation };
      observed = routes;
      mkdirSync(dir, { recursive: true });
      atomicWriteFile(observationsFile, JSON.stringify({ routes }, null, 2) + '\n');
    },
  };
  return settings;
}
