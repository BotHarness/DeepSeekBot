import type { PersonaBotRegistry } from '../bots/registry.js';
import {
  isBotModeId,
  type BotModeOption,
  type BotModeSettings,
} from '../runtime/bot-mode-settings.js';
import type { BridgeResult } from './methods.js';

export interface BotModesDeps {
  settings: BotModeSettings;
  productDefault: string;
  roster(): Promise<BotModeOption[]>;
}

export interface BotModeView {
  slug: string;
  mode: string | null;
  effective: string;
}

export interface BotModesView {
  modes: BotModeOption[];
  productDefault: string;
  globalDefault: string | null;
  effectiveDefault: string;
  bot?: BotModeView;
}

export interface BotModeBridgeMethods {
  botModes(payload?: unknown): Promise<BridgeResult<BotModesView>>;
  botModeDefaultSet(payload: unknown): Promise<BridgeResult<BotModesView>>;
  botModeSet(payload: unknown): Promise<BridgeResult<BotModesView>>;
}

const fail = (code: string, message: string): BridgeResult<never> => ({
  ok: false,
  error: { code, message },
});

function object(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export function createBotModeBridgeMethods(deps: {
  modes: BotModesDeps | undefined;
  registry: PersonaBotRegistry;
}): BotModeBridgeMethods {
  const unavailable = () =>
    fail('modes-unavailable', 'DSH modes (Agent Presets) are unavailable on this Host.');
  const view = async (modes: BotModesDeps, slug?: string): Promise<BotModesView> => {
    const globalDefault = modes.settings.defaultMode() ?? null;
    const effectiveDefault = globalDefault ?? modes.productDefault;
    const bot = slug === undefined ? undefined : deps.registry.get(slug);
    return {
      modes: await modes.roster(),
      productDefault: modes.productDefault,
      globalDefault,
      effectiveDefault,
      ...(bot === undefined
        ? {}
        : {
            bot: {
              slug: bot.slug,
              mode: bot.preset ?? null,
              effective: bot.preset ?? effectiveDefault,
            },
          }),
    };
  };
  const chosen = async (
    modes: BotModesDeps,
    value: unknown,
  ): Promise<BridgeResult<string | null>> => {
    if (value === null) return { ok: true, value: null };
    if (!isBotModeId(value))
      return fail('invalid-input', 'mode must be a mode id from botModes, or null');
    const option = (await modes.roster()).find((entry) => entry.id === value);
    if (option === undefined)
      return fail('mode-not-found', `No mode named ${value} is installed; read botModes.`);
    if (option.broken !== undefined)
      return fail('mode-broken', `Mode ${value} failed to load: ${option.broken}`);
    return { ok: true, value };
  };
  return {
    async botModes(payload) {
      if (deps.modes === undefined) return unavailable();
      const slug = object(payload)['slug'];
      if (slug !== undefined && typeof slug !== 'string')
        return fail('invalid-input', 'slug must be a string');
      if (typeof slug === 'string' && deps.registry.get(slug) === undefined)
        return fail('not-found', `unknown PersonaBot: ${slug}`);
      return { ok: true, value: await view(deps.modes, slug) };
    },
    async botModeDefaultSet(payload) {
      const modes = deps.modes;
      if (modes === undefined) return unavailable();
      const mode = await chosen(modes, object(payload)['mode']);
      if (!mode.ok) return mode;
      modes.settings.setDefaultMode(mode.value ?? undefined);
      return { ok: true, value: await view(modes) };
    },
    async botModeSet(payload) {
      const modes = deps.modes;
      if (modes === undefined) return unavailable();
      const source = object(payload);
      const slug = source['slug'];
      if (typeof slug !== 'string' || slug.length === 0)
        return fail('invalid-input', 'slug is required');
      if (deps.registry.get(slug) === undefined)
        return fail('not-found', `unknown PersonaBot: ${slug}`);
      const mode = await chosen(modes, source['mode']);
      if (!mode.ok) return mode;
      const result = deps.registry.update(slug, { preset: mode.value ?? '' });
      if (!result.ok) return fail('not-found', `unknown PersonaBot: ${slug}`);
      return { ok: true, value: await view(modes, slug) };
    },
  };
}
