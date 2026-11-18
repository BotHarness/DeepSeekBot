import { unwrap, type BridgeCall } from './bridge.js';

export interface BotModeOptionView {
  id: string;
  name?: string;
  description?: string;
  broken?: string;
}

export interface BotModeTemplateView {
  id: string;
  name: string;
  modes: string[];
}

export interface BotModesView {
  modes: BotModeOptionView[];
  productDefault: string;
  globalDefault: string | null;
  effectiveDefault: string;
  templates: BotModeTemplateView[];
  bot?: {
    slug: string;
    mode: string | null;
    effective: string;
    template: string | null;
    allowed: string[] | null;
  };
}

export interface BotModeActions {
  botModes?(slug?: string): Promise<BotModesView>;
  setBotModeDefault?(mode: string | null): Promise<BotModesView>;
  setBotMode?(slug: string, mode: string | null): Promise<BotModesView>;
  saveBotModeTemplate?(input: {
    id?: string;
    name: string;
    modes: string[];
  }): Promise<BotModesView>;
  deleteBotModeTemplate?(id: string): Promise<BotModesView>;
  setBotModeTemplate?(slug: string, template: string | null): Promise<BotModesView>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...(value as string[])]
    : undefined;
}

function parseTemplates(value: unknown): BotModeTemplateView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const template = record(entry);
    const id = template?.['id'];
    const name = template?.['name'];
    const modes = strings(template?.['modes']);
    return typeof id === 'string' && typeof name === 'string' && modes !== undefined
      ? [{ id, name, modes }]
      : [];
  });
}

export function parseBotModesView(value: unknown, method: string): BotModesView {
  const view = record(value);
  const modes = view?.['modes'];
  const productDefault = view?.['productDefault'];
  const globalDefault = view?.['globalDefault'];
  const effectiveDefault = view?.['effectiveDefault'];
  if (
    !Array.isArray(modes) ||
    typeof productDefault !== 'string' ||
    (globalDefault !== null && typeof globalDefault !== 'string') ||
    typeof effectiveDefault !== 'string'
  )
    throw new Error(`invalid ${method} response`);
  const bot = record(view?.['bot']);
  return {
    modes: modes.flatMap((entry) => {
      const mode = record(entry);
      const id = mode?.['id'];
      if (typeof id !== 'string') return [];
      const name = optionalString(mode?.['name']);
      const description = optionalString(mode?.['description']);
      const broken = optionalString(mode?.['broken']);
      return [
        {
          id,
          ...(name === undefined ? {} : { name }),
          ...(description === undefined ? {} : { description }),
          ...(broken === undefined ? {} : { broken }),
        },
      ];
    }),
    productDefault,
    globalDefault,
    effectiveDefault,
    templates: parseTemplates(view?.['templates']),
    ...(bot !== undefined &&
    typeof bot['slug'] === 'string' &&
    typeof bot['effective'] === 'string' &&
    (bot['mode'] === null || typeof bot['mode'] === 'string')
      ? {
          bot: {
            slug: bot['slug'],
            mode: bot['mode'],
            effective: bot['effective'],
            template: typeof bot['template'] === 'string' ? bot['template'] : null,
            allowed: strings(bot['allowed']) ?? null,
          },
        }
      : {}),
  };
}

export function botModeActions(call: BridgeCall): Required<BotModeActions> {
  return {
    botModes: async (slug) =>
      parseBotModesView(
        await unwrap(call, 'botModes', slug === undefined ? {} : { slug }),
        'botModes',
      ),
    setBotModeDefault: async (mode) =>
      parseBotModesView(await unwrap(call, 'botModeDefaultSet', { mode }), 'botModeDefaultSet'),
    setBotMode: async (slug, mode) =>
      parseBotModesView(await unwrap(call, 'botModeSet', { slug, mode }), 'botModeSet'),
    saveBotModeTemplate: async (input) =>
      parseBotModesView(await unwrap(call, 'botModeTemplateSave', input), 'botModeTemplateSave'),
    deleteBotModeTemplate: async (id) =>
      parseBotModesView(
        await unwrap(call, 'botModeTemplateDelete', { id }),
        'botModeTemplateDelete',
      ),
    setBotModeTemplate: async (slug, template) =>
      parseBotModesView(
        await unwrap(call, 'botModeTemplateSet', { slug, template }),
        'botModeTemplateSet',
      ),
  };
}
