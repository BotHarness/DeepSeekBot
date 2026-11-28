import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createMessagingEvents } from './events.js';
import {
  createMessagingBridgeMethods,
  createMessagingCall,
  type MessagingBridgeDeps,
} from './methods.js';
import { mountCleanup, mountProviders } from './plugin.js';
import { externalImPrompt, replyDeliveryContract, replyDeliveryPrompt } from './prompt.js';
import { EXTERNAL_ATTACHMENT_PROMPT } from '../channel-files/prompt.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import {
  channelMessagingRpc,
  messagingConnectionRpc,
  messagingPolicyRpc,
  messagingRpcMethods,
} from './rpc.js';
import { registerExternalMessagingTools } from './tools.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { HumanContext } from '../../humans/context.js';

export interface MessagingBridgeContext {
  deps: MessagingBridgeDeps;
  messagingCall: ReturnType<typeof createMessagingCall>;
  globalRegistry: PersonaBotRegistry;
  human: HumanContext;
  isHostOwner(): boolean;
}

export interface MessagingAgentContext {
  currentRun: Parameters<typeof registerExternalMessagingTools>[0];
  promptText(): PromptText;
}

export function createMessagingContribution() {
  return {
    id: 'messaging',
    runtimeServices: { createMessagingEvents },
    bridgeMethods: ({ deps, messagingCall, globalRegistry, human, isHostOwner }) =>
      createMessagingBridgeMethods(deps, messagingCall, {
        globalRegistry,
        canReadConnections: () => isHostOwner() && human.caller !== 'bot',
      }),
    rpc: {
      ...messagingRpcMethods,
      ...channelMessagingRpc,
      ...messagingPolicyRpc,
      ...messagingConnectionRpc,
    },
    host: { messagingCleanup: mountCleanup, messagingProviders: mountProviders },
    promptSections: ({ promptText }) => [
      {
        placement: 'slot',
        slot: 'reply-contract',
        text: () => replyDeliveryContract(promptText()),
      },
      { placement: 'slot', slot: 'reply-delivery', text: () => replyDeliveryPrompt(promptText()) },
      {
        placement: 'system',
        condition: 'external-messaging-connected',
        name: 'botharness:external-im',
        order: 10_351,
        text: externalImPrompt(EXTERNAL_ATTACHMENT_PROMPT),
      },
    ],
    tools: ({ currentRun }, { register }) =>
      registerExternalMessagingTools(currentRun, (tool) => register(tool, 'bridge')),
  } satisfies FeatureContribution<
    MessagingBridgeContext,
    MessagingAgentContext,
    { messagingCleanup: typeof mountCleanup; messagingProviders: typeof mountProviders }
  >;
}
