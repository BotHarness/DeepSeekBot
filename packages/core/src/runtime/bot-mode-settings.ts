import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';

export const BOT_MODE_SETTINGS_FILE = 'bot-modes.json';

export const INHERIT_BOT_MODE = '@global';

export interface BotModeOption {
  id: string;
  name?: string;
  description?: string;
  order?: number;
  broken?: string;
}

export interface BotModeSettings {
  defaultMode(): string | undefined;
  setDefaultMode(mode: string | undefined): void;
}

const MODE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function isBotModeId(value: unknown): value is string {
  return typeof value === 'string' && MODE_ID.test(value);
}

function readSettings(file: string): { defaultMode?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${BOT_MODE_SETTINGS_FILE} cannot be read; fix or delete it`, {
      cause: error,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`${BOT_MODE_SETTINGS_FILE} must hold a JSON object`);
  const mode = (parsed as { defaultMode?: unknown }).defaultMode;
  if (mode !== undefined && !isBotModeId(mode))
    throw new Error(`${BOT_MODE_SETTINGS_FILE} has an invalid defaultMode`);
  return mode === undefined ? {} : { defaultMode: mode };
}

export function createBotModeSettings(dir: string): BotModeSettings {
  const file = join(dir, BOT_MODE_SETTINGS_FILE);
  let cached: { defaultMode?: string } | undefined;
  const current = () => (cached ??= readSettings(file));
  return {
    defaultMode() {
      try {
        return current().defaultMode;
      } catch {
        return undefined;
      }
    },
    setDefaultMode(mode) {
      if (mode !== undefined && !isBotModeId(mode)) throw new Error('invalid mode id');
      const next = mode === undefined ? {} : { defaultMode: mode };
      mkdirSync(dir, { recursive: true });
      atomicWriteFile(file, JSON.stringify(next, null, 2) + '\n');
      cached = next;
    },
  };
}
