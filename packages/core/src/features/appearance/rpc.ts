import { unwrapAsync } from '../../bridge/rpc-result.js';
import type { BotModesView } from './methods.js';
import type { BotModeBridgeMethods } from './methods.js';

export function botModes(methods: BotModeBridgeMethods, slug?: string): Promise<BotModesView> {
  return unwrapAsync(methods.botModes(slug === undefined ? {} : { slug }));
}

export function botModeDefaultSet(
  methods: BotModeBridgeMethods,
  mode: string | null,
): Promise<BotModesView> {
  return unwrapAsync(methods.botModeDefaultSet({ mode }));
}

export function botModeSet(
  methods: BotModeBridgeMethods,
  slug: string,
  mode: string | null,
): Promise<BotModesView> {
  return unwrapAsync(methods.botModeSet({ slug, mode }));
}

export function botModeTemplateSave(
  methods: BotModeBridgeMethods,
  name: string,
  modes: string[],
  id?: string,
): Promise<BotModesView> {
  return unwrapAsync(
    methods.botModeTemplateSave({ name, modes, ...(id === undefined ? {} : { id }) }),
  );
}

export function botModeTemplateDelete(
  methods: BotModeBridgeMethods,
  id: string,
): Promise<BotModesView> {
  return unwrapAsync(methods.botModeTemplateDelete({ id }));
}

export function botModeTemplateSet(
  methods: BotModeBridgeMethods,
  slug: string,
  template: string | null,
): Promise<BotModesView> {
  return unwrapAsync(methods.botModeTemplateSet({ slug, template }));
}
