import { toRemoteError } from '../../bridge/rpc-result.js';
import { LiveRefused } from '../../channels/live-frames.js';
import type { CompanionLiveFrame } from '../../companions/live.js';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
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

export const appearanceRpcMethods = {
  async *followCompanion(
    resume: string,
    lastEventId: string,
    signal: AbortSignal,
  ): AsyncGenerator<CompanionLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    try {
      yield* this.live.followCompanion(this.invocationHuman(), resume, lastEventId, signal);
    } catch (error) {
      if (error instanceof LiveRefused)
        throw toRemoteError({ code: error.code, message: error.message });
      throw error;
    }
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const botModeRpc = {
  botModes(slug?: string): Promise<BotModesView> {
    return botModes(this.methods, slug);
  },

  botModeDefaultSet(mode: string | null): Promise<BotModesView> {
    return botModeDefaultSet(this.methods, mode);
  },

  botModeSet(slug: string, mode: string | null): Promise<BotModesView> {
    return botModeSet(this.methods, slug, mode);
  },

  botModeTemplateSave(name: string, modes: string[], id?: string): Promise<BotModesView> {
    return botModeTemplateSave(this.methods, name, modes, id);
  },

  botModeTemplateDelete(id: string): Promise<BotModesView> {
    return botModeTemplateDelete(this.methods, id);
  },

  botModeTemplateSet(slug: string, template: string | null): Promise<BotModesView> {
    return botModeTemplateSet(this.methods, slug, template);
  },
} satisfies ThisType<BridgeRpcReceiver>;
