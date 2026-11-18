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
  bot?: BotModeView;
}

export interface BotModeView {
  slug: string;
  mode: string | null;
  effective: string;
  template: string | null;
  allowed: string[] | null;
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

function parseTemplates(value: unknown, method: string): BotModeTemplateView[] {
  if (!Array.isArray(value)) throw new Error(`invalid ${method} response`);
  return value.map((entry) => {
    const template = record(entry);
    const id = template?.['id'];
    const name = template?.['name'];
    const modes = strings(template?.['modes']);
    if (typeof id !== 'string' || typeof name !== 'string' || modes === undefined)
      throw new Error(`invalid ${method} response`);
    return { id, name, modes };
  });
}

function parseBot(
  value: unknown,
  method: string,
  slug: string | undefined,
): BotModeView | undefined {
  if (value === undefined) {
    if (slug !== undefined) throw new Error(`invalid ${method} response`);
    return undefined;
  }
  const bot = record(value);
  const template = bot?.['template'];
  const allowed = bot?.['allowed'];
  const mode = bot?.['mode'];
  if (
    bot === undefined ||
    typeof bot['slug'] !== 'string' ||
    (slug !== undefined && bot['slug'] !== slug) ||
    typeof bot['effective'] !== 'string' ||
    (mode !== null && typeof mode !== 'string') ||
    (template !== null && typeof template !== 'string') ||
    (allowed !== null && strings(allowed) === undefined)
  )
    throw new Error(`invalid ${method} response`);
  return {
    slug: bot['slug'],
    mode,
    effective: bot['effective'],
    template,
    allowed: allowed === null ? null : strings(allowed)!,
  };
}

export function parseBotModesView(value: unknown, method: string, slug?: string): BotModesView {
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
  const bot = parseBot(view?.['bot'], method, slug);
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
    templates: parseTemplates(view?.['templates'], method),
    ...(bot === undefined ? {} : { bot }),
  };
}

export function botModeActions(call: BridgeCall): Required<BotModeActions> {
  return {
    botModes: async (slug) =>
      parseBotModesView(
        await unwrap(call, 'botModes', slug === undefined ? {} : { slug }),
        'botModes',
        slug,
      ),
    setBotModeDefault: async (mode) =>
      parseBotModesView(await unwrap(call, 'botModeDefaultSet', { mode }), 'botModeDefaultSet'),
    setBotMode: async (slug, mode) =>
      parseBotModesView(await unwrap(call, 'botModeSet', { slug, mode }), 'botModeSet', slug),
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
        slug,
      ),
  };
}
