import * as prompts from '@botharness/host-client/prompt-presets';
import type { BridgeActions, InvokeAction } from '../../actions.js';

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

export function createPromptBridgeActions(invoke: InvokeAction, host: prompts.PromptPresetClient) {
  return {
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
  } satisfies PromptActions & Pick<BridgeActions, 'botSystemPrompt' | 'botPrompt' | 'botPromptSet'>;
}
