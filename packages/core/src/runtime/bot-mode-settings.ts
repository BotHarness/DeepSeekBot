import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';

export const BOT_MODE_SETTINGS_FILE = 'bot-modes.json';

export const INHERIT_BOT_MODE = '@global';

export const BOT_MODE_TEMPLATE_NAME_MAX = 60;

export const BOT_MODE_TEMPLATE_MODES_MAX = 32;

export interface BotModeOption {
  id: string;
  name?: string;
  description?: string;
  order?: number;
  broken?: string;
}

export interface BotModeTemplate {
  id: string;
  name: string;
  modes: string[];
}

export interface BotModeSettings {
  defaultMode(): string | undefined;
  setDefaultMode(mode: string | undefined): void;
  templates(): BotModeTemplate[];
  template(id: string): BotModeTemplate | undefined;
  saveTemplate(input: { id?: string; name: string; modes: string[] }): BotModeTemplate;
  deleteTemplate(id: string): void;
  templateOf(slug: string): string | undefined;
  setTemplateOf(slug: string, template: string | undefined): void;
  allowedModes(slug: string): string[] | undefined;
  readError(): string | undefined;
}

interface StoredSettings {
  defaultMode?: string;
  templates?: BotModeTemplate[];
  botTemplates?: Record<string, string>;
}

const MODE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function isBotModeId(value: unknown): value is string {
  return typeof value === 'string' && MODE_ID.test(value);
}

export class UnknownBotModeTemplateError extends Error {
  constructor(id: string) {
    super(`unknown mode template: ${id}`);
    this.name = 'UnknownBotModeTemplateError';
  }
}

function isTemplate(value: unknown): value is BotModeTemplate {
  if (typeof value !== 'object' || value === null) return false;
  const template = value as Record<string, unknown>;
  const modes = template['modes'];
  return (
    isBotModeId(template['id']) &&
    typeof template['name'] === 'string' &&
    template['name'].trim().length > 0 &&
    Array.isArray(modes) &&
    modes.length > 0 &&
    modes.every(isBotModeId)
  );
}

function readSettings(file: string): StoredSettings {
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
  const source = parsed as Record<string, unknown>;
  const mode = source['defaultMode'];
  if (mode !== undefined && !isBotModeId(mode))
    throw new Error(`${BOT_MODE_SETTINGS_FILE} has an invalid defaultMode`);
  const templates = source['templates'];
  if (templates !== undefined && (!Array.isArray(templates) || !templates.every(isTemplate)))
    throw new Error(`${BOT_MODE_SETTINGS_FILE} has invalid templates`);
  const botTemplates = source['botTemplates'];
  if (
    botTemplates !== undefined &&
    (typeof botTemplates !== 'object' ||
      botTemplates === null ||
      Array.isArray(botTemplates) ||
      !Object.values(botTemplates).every(isBotModeId))
  )
    throw new Error(`${BOT_MODE_SETTINGS_FILE} has invalid botTemplates`);
  return {
    ...(mode === undefined ? {} : { defaultMode: mode }),
    ...(templates === undefined || templates.length === 0
      ? {}
      : {
          templates: templates.map((template) => ({
            id: template.id,
            name: template.name,
            modes: [...template.modes],
          })),
        }),
    ...(botTemplates === undefined || Object.keys(botTemplates).length === 0
      ? {}
      : { botTemplates: { ...(botTemplates as Record<string, string>) } }),
  };
}

export function resolveBotMode(input: {
  own: string | undefined;
  inherited: string;
  allowed: readonly string[] | undefined;
  installed: ReadonlySet<string> | undefined;
}): string {
  if (input.own !== undefined) return input.own;
  if (input.allowed === undefined) return input.inherited;
  const healthy = (mode: string) => input.installed === undefined || input.installed.has(mode);
  if (input.allowed.includes(input.inherited) && healthy(input.inherited)) return input.inherited;
  return (
    input.allowed.find(healthy) ??
    (input.allowed.includes(input.inherited) ? input.inherited : input.allowed[0]) ??
    input.inherited
  );
}

export function normalizeTemplateInput(input: { name: unknown; modes: unknown }): {
  name: string;
  modes: string[];
} {
  if (typeof input.name !== 'string' || input.name.trim().length === 0)
    throw new Error('template name is required');
  const name = input.name.trim();
  if (name.length > BOT_MODE_TEMPLATE_NAME_MAX)
    throw new Error(`template name must be at most ${BOT_MODE_TEMPLATE_NAME_MAX} characters`);
  if (!Array.isArray(input.modes) || !input.modes.every(isBotModeId))
    throw new Error('modes must be a list of mode ids');
  const modes = [...new Set(input.modes)];
  if (modes.length === 0 || modes.length > BOT_MODE_TEMPLATE_MODES_MAX)
    throw new Error(`choose between 1 and ${BOT_MODE_TEMPLATE_MODES_MAX} modes`);
  return { name, modes };
}

export function createBotModeSettings(dir: string): BotModeSettings {
  const file = join(dir, BOT_MODE_SETTINGS_FILE);
  let cached: StoredSettings | undefined;
  const current = () => (cached ??= readSettings(file));
  const fresh = () => {
    cached = undefined;
    return current();
  };
  const safe = (): StoredSettings => {
    try {
      return current();
    } catch {
      return {};
    }
  };
  const write = (next: StoredSettings) => {
    const compact: StoredSettings = {
      ...(next.defaultMode === undefined ? {} : { defaultMode: next.defaultMode }),
      ...(next.templates === undefined || next.templates.length === 0
        ? {}
        : { templates: next.templates }),
      ...(next.botTemplates === undefined || Object.keys(next.botTemplates).length === 0
        ? {}
        : { botTemplates: next.botTemplates }),
    };
    mkdirSync(dir, { recursive: true });
    atomicWriteFile(file, JSON.stringify(compact, null, 2) + '\n');
    cached = compact;
  };
  const settings: BotModeSettings = {
    defaultMode() {
      return safe().defaultMode;
    },
    setDefaultMode(mode) {
      if (mode !== undefined && !isBotModeId(mode)) throw new Error('invalid mode id');
      const { defaultMode: _previous, ...rest } = fresh();
      write(mode === undefined ? rest : { ...rest, defaultMode: mode });
    },
    templates() {
      return (safe().templates ?? []).map((template) => ({
        ...template,
        modes: [...template.modes],
      }));
    },
    template(id) {
      return settings.templates().find((template) => template.id === id);
    },
    saveTemplate(input) {
      const { name, modes } = normalizeTemplateInput(input);
      const state = fresh();
      const templates = state.templates ?? [];
      if (input.id !== undefined) {
        if (!templates.some((template) => template.id === input.id))
          throw new UnknownBotModeTemplateError(input.id);
        const saved = { id: input.id, name, modes };
        write({
          ...state,
          templates: templates.map((template) => (template.id === input.id ? saved : template)),
        });
        return { ...saved, modes: [...modes] };
      }
      const saved = { id: randomUUID(), name, modes };
      write({ ...state, templates: [...templates, saved] });
      return { ...saved, modes: [...modes] };
    },
    deleteTemplate(id) {
      const state = fresh();
      const botTemplates = Object.fromEntries(
        Object.entries(state.botTemplates ?? {}).filter(([, template]) => template !== id),
      );
      write({
        ...state,
        templates: (state.templates ?? []).filter((template) => template.id !== id),
        botTemplates,
      });
    },
    templateOf(slug) {
      const id = safe().botTemplates?.[slug];
      return id !== undefined && settings.template(id) !== undefined ? id : undefined;
    },
    setTemplateOf(slug, template) {
      const state = fresh();
      if (template !== undefined && !(state.templates ?? []).some((entry) => entry.id === template))
        throw new UnknownBotModeTemplateError(template);
      const { [slug]: _previous, ...others } = state.botTemplates ?? {};
      write({
        ...state,
        botTemplates: template === undefined ? others : { ...others, [slug]: template },
      });
    },
    allowedModes(slug) {
      const id = settings.templateOf(slug);
      return id === undefined ? undefined : settings.template(id)?.modes;
    },
    readError() {
      try {
        fresh();
        return undefined;
      } catch (error) {
        return (error as Error).message;
      }
    },
  };
  return settings;
}
