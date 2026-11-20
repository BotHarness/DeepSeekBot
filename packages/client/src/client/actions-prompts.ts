import * as prompts from '@botharness/host-client/prompt-presets';
import type { InvokeAction, BridgeActions } from './actions.js';

export interface PromptActions {
  promptParts?(): Promise<import('@botharness/host-client/prompt-presets').PromptParts>;
  promptPresets?(): Promise<import('@botharness/host-client/prompt-presets').PromptPresets>;
  promptPresetCreate?(
    name: string,
    parts: Record<string, string | null>,
    limits?: Record<string, number | null>,
  ): Promise<{
    preset: import('@botharness/host-client/prompt-presets').PromptPresetInfo;
  }>;
  promptPresetUpdate?(
    id: string,
    change: import('@botharness/host-client/prompt-presets').PromptPresetChange,
  ): Promise<{
    preset: import('@botharness/host-client/prompt-presets').PromptPresetInfo;
  }>;
  promptPresetDelete?(id: string): Promise<{ id: string; clearedBots: string[] }>;
  promptGlobalSet?(presetId: string | null): Promise<{ presetId: string | null }>;
}

export function createPromptActions(invoke: InvokeAction, host: prompts.PromptPresetClient) {
  return {
    async botContext(botSlug) {
      return invoke('botContext', { slug: botSlug });
    },
    async botSystemPrompt(botSlug) {
      return invoke('botSystemPrompt', { slug: botSlug });
    },
    promptParts: () => prompts.loadPromptParts(host),
    promptPresets: () => prompts.loadPromptPresets(host),
    promptPresetCreate: (name, parts, limits) =>
      prompts.createPromptPreset(host, name, parts, limits),
    promptPresetUpdate: (id, change) => prompts.updatePromptPreset(host, id, change),
    promptPresetDelete: (id) => prompts.deletePromptPreset(host, id),
    promptGlobalSet: (presetId) => prompts.setGlobalPromptPreset(host, presetId),
    botPrompt: (slug) => invoke('botPrompt', { slug }),
    botPromptSet: (slug, change) => invoke('botPromptSet', { slug, ...change }),
    async botTurnInput(botSlug, turns = 1) {
      return invoke('botTurnInput', { slug: botSlug, turns });
    },
  } satisfies PromptActions &
    Pick<
      BridgeActions,
      'botContext' | 'botSystemPrompt' | 'botPrompt' | 'botPromptSet' | 'botTurnInput'
    >;
}
