import type { PersonaBotRegistry } from '../bots/registry.js';
import {
  isBotModeId,
  normalizeTemplateInput,
  type BotModeOption,
  type BotModeSettings,
  type BotModeTemplate,
} from '../runtime/bot-mode-settings.js';
import type { BridgeResult } from './methods.js';

export interface BotModesDeps {
  settings: BotModeSettings;
  productDefault: string;
  roster(): Promise<BotModeOption[]>;
  modeOf?(slug: string): string;
  changed?(): void;
}

export interface BotModeView {
  slug: string;
  mode: string | null;
  effective: string;
  template: string | null;
  allowed: string[] | null;
}

export interface BotModesView {
  modes: BotModeOption[];
  productDefault: string;
  globalDefault: string | null;
  effectiveDefault: string;
  templates: BotModeTemplate[];
  bot?: BotModeView;
}

export interface BotModeBridgeMethods {
  botModes(payload?: unknown): Promise<BridgeResult<BotModesView>>;
  botModeDefaultSet(payload: unknown): Promise<BridgeResult<BotModesView>>;
  botModeSet(payload: unknown): Promise<BridgeResult<BotModesView>>;
  botModeTemplateSave(payload: unknown): Promise<BridgeResult<BotModesView>>;
  botModeTemplateDelete(payload: unknown): Promise<BridgeResult<BotModesView>>;
  botModeTemplateSet(payload: unknown): Promise<BridgeResult<BotModesView>>;
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
  everyone?: PersonaBotRegistry;
}): BotModeBridgeMethods {
  const everyone = deps.everyone ?? deps.registry;
  const unavailable = () =>
    fail('modes-unavailable', 'DSH modes (Agent Presets) are unavailable on this Host.');
  const unreadable = (modes: BotModesDeps): BridgeResult<never> | undefined => {
    const error = modes.settings.readError();
    return error === undefined ? undefined : fail('settings-unreadable', error);
  };
  const view = async (
    modes: BotModesDeps,
    slug?: string,
    known?: BotModeOption[],
  ): Promise<BotModesView> => {
    const roster = known ?? (await modes.roster());
    const globalDefault = modes.settings.defaultMode() ?? null;
    const effectiveDefault =
      globalDefault !== null &&
      roster.some((entry) => entry.id === globalDefault && entry.broken === undefined)
        ? globalDefault
        : modes.productDefault;
    const bot = slug === undefined ? undefined : deps.registry.get(slug);
    return {
      modes: roster,
      productDefault: modes.productDefault,
      globalDefault,
      effectiveDefault,
      templates: modes.settings.templates(),
      ...(bot === undefined
        ? {}
        : {
            bot: {
              slug: bot.slug,
              mode: bot.preset ?? null,
              effective: modes.modeOf?.(bot.slug) ?? bot.preset ?? effectiveDefault,
              template: modes.settings.templateOf(bot.slug) ?? null,
              allowed: modes.settings.allowedModes(bot.slug) ?? null,
            },
          }),
    };
  };
  const chosen = async (
    modes: BotModesDeps,
    value: unknown,
    roster?: BotModeOption[],
  ): Promise<BridgeResult<string | null>> => {
    if (value === null) return { ok: true, value: null };
    if (!isBotModeId(value))
      return fail('invalid-input', 'mode must be a mode id from botModes, or null');
    const option = (roster ?? (await modes.roster())).find((entry) => entry.id === value);
    if (option === undefined)
      return fail('mode-not-found', `No mode named ${value} is installed; read botModes.`);
    if (option.broken !== undefined)
      return fail('mode-broken', `Mode ${value} failed to load: ${option.broken}`);
    return { ok: true, value };
  };
  return {
    async botModes(payload) {
      if (deps.modes === undefined) return unavailable();
      const refused = unreadable(deps.modes);
      if (refused !== undefined) return refused;
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
      const refused = unreadable(modes);
      if (refused !== undefined) return refused;
      const roster = await modes.roster();
      const mode = await chosen(modes, object(payload)['mode'], roster);
      if (!mode.ok) return mode;
      modes.settings.setDefaultMode(mode.value ?? undefined);
      modes.changed?.();
      return { ok: true, value: await view(modes, undefined, roster) };
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
      const roster = await modes.roster();
      const mode = await chosen(modes, source['mode'], roster);
      if (!mode.ok) return mode;
      if (mode.value !== null) {
        const refused = unreadable(modes);
        if (refused !== undefined) return refused;
      }
      const allowed = modes.settings.allowedModes(slug);
      if (mode.value !== null && allowed !== undefined && !allowed.includes(mode.value))
        return fail(
          'mode-not-allowed',
          `Mode ${mode.value} is not in this Bot's mode template; choose one of ${allowed.join(', ')} or change the template.`,
        );
      const result = deps.registry.update(slug, { preset: mode.value ?? '' });
      if (!result.ok) return fail('not-found', `unknown PersonaBot: ${slug}`);
      return { ok: true, value: await view(modes, slug, roster) };
    },
    async botModeTemplateSave(payload) {
      const modes = deps.modes;
      if (modes === undefined) return unavailable();
      const refused = unreadable(modes);
      if (refused !== undefined) return refused;
      const source = object(payload);
      const id = source['id'];
      if (id !== undefined && (typeof id !== 'string' || modes.settings.template(id) === undefined))
        return fail('not-found', `No mode template has id ${String(id)}; read botModes.`);
      let input: { name: string; modes: string[] };
      try {
        input = normalizeTemplateInput({
          name: source['name'],
          modes: source['modes'],
        });
      } catch (error) {
        return fail('invalid-input', (error as Error).message);
      }
      const roster = await modes.roster();
      for (const value of input.modes) {
        const mode = await chosen(modes, value, roster);
        if (!mode.ok) return mode;
      }
      if (typeof id === 'string') {
        const outside = everyone
          .list()
          .filter(
            (bot) =>
              modes.settings.templateOf(bot.slug) === id &&
              bot.preset !== undefined &&
              !input.modes.includes(bot.preset),
          )
          .map((bot) => bot.slug);
        if (outside.length > 0)
          return fail(
            'mode-not-allowed',
            `These Bots use a mode the template would leave out: ${outside.join(', ')}. Change their mode first.`,
          );
      }
      modes.settings.saveTemplate({
        ...(typeof id === 'string' ? { id } : {}),
        ...input,
      });
      modes.changed?.();
      return { ok: true, value: await view(modes, undefined, roster) };
    },
    async botModeTemplateDelete(payload) {
      const modes = deps.modes;
      if (modes === undefined) return unavailable();
      const refused = unreadable(modes);
      if (refused !== undefined) return refused;
      const id = object(payload)['id'];
      if (typeof id !== 'string' || modes.settings.template(id) === undefined)
        return fail('not-found', `No mode template has id ${String(id)}; read botModes.`);
      const users = everyone
        .list()
        .filter((bot) => modes.settings.templateOf(bot.slug) === id)
        .map((bot) => bot.slug);
      if (users.length > 0)
        return fail(
          'template-in-use',
          `Bots still use this mode template: ${users.join(', ')}. Move them to another template first.`,
        );
      modes.settings.deleteTemplate(id);
      modes.changed?.();
      return { ok: true, value: await view(modes) };
    },
    async botModeTemplateSet(payload) {
      const modes = deps.modes;
      if (modes === undefined) return unavailable();
      const refused = unreadable(modes);
      if (refused !== undefined) return refused;
      const source = object(payload);
      const slug = source['slug'];
      if (typeof slug !== 'string' || slug.length === 0)
        return fail('invalid-input', 'slug is required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return fail('not-found', `unknown PersonaBot: ${slug}`);
      const template = source['template'];
      if (template !== null && typeof template !== 'string')
        return fail('invalid-input', 'template must be a mode template id from botModes, or null');
      const allowed = template === null ? undefined : modes.settings.template(template)?.modes;
      if (template !== null && allowed === undefined)
        return fail('not-found', `No mode template has id ${template}; read botModes.`);
      if (allowed !== undefined && bot.preset !== undefined && !allowed.includes(bot.preset))
        return fail(
          'mode-not-allowed',
          `This Bot uses mode ${bot.preset}, which the template leaves out. Change the Bot's mode first.`,
        );
      modes.settings.setTemplateOf(slug, template ?? undefined);
      modes.changed?.();
      return { ok: true, value: await view(modes, slug) };
    },
  };
}
