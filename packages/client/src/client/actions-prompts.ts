import { createPromptBridgeActions, type PromptActions } from './features/prompts/bridge.js';
export type { PromptActions } from './features/prompts/bridge.js';
import * as prompts from '@botharness/host-client/prompt-presets';
import type { InvokeAction, BridgeActions } from './actions.js';

export function createPromptActions(invoke: InvokeAction, host: prompts.PromptPresetClient) {
  return {
    async botContext(botSlug) {
      return invoke('botContext', { slug: botSlug });
    },
    ...createPromptBridgeActions(invoke, host),
    async botTurnInput(botSlug, turns = 1) {
      return invoke('botTurnInput', { slug: botSlug, turns });
    },
  } satisfies PromptActions &
    Pick<
      BridgeActions,
      'botContext' | 'botSystemPrompt' | 'botPrompt' | 'botPromptSet' | 'botTurnInput'
    >;
}
