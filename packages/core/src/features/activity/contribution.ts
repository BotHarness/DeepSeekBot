import { createActivityEvents } from './events.js';
import { coalesceInbox, createInboxHarvest } from './inbox-harvest.js';
import { createRuntimeAdmissions } from './runtime-admissions.js';
import { createRuntimeAdmissionRecovery } from './runtime-admission-recovery.js';
import { interruptedDmNotice } from './runtime-admission-support.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import type { ActivityBridgeDeps } from './bridge-deps.js';
import { createActivityBridgeMethods } from './methods.js';
import { apply } from './plugin.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import { inboxCoordinationPrompt } from './prompt.js';
import { registerInboxTools, registerSourceAttentionTools } from './tools.js';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';
import {
  activityRpcMethods,
  activityStreams,
  attentionRpc,
  humanAttentionDismissalRpc,
} from './rpc.js';

export interface ActivityBridgeContext {
  human: HumanContext;
  deps: ActivityBridgeDeps;
  dmMemory: Parameters<typeof createActivityBridgeMethods>[2];
}

export interface ActivityAgentContext {
  currentRun(): OrchestratorAgentRun | undefined;
  promptText(): PromptText;
  engineChannel?(): string | undefined;
}

export function createActivityContribution() {
  return {
    id: 'activity',
    runtimeServices: {
      createActivityEvents,
      coalesceInbox,
      createInboxHarvest,
      createRuntimeAdmissions,
      createRuntimeAdmissionRecovery,
      interruptedDmNotice,
    },
    bridgeMethods: ({ human, deps, dmMemory }) => ({
      ...createActivityBridgeMethods(human, deps, dmMemory),
    }),
    rpc: { ...activityRpcMethods, ...attentionRpc, ...humanAttentionDismissalRpc },
    streams: activityStreams,
    host: { activityObservers: apply },
    promptSections: ({ promptText }) => [
      {
        placement: 'slot',
        slot: 'inbox-coordination',
        text: () => inboxCoordinationPrompt(promptText()),
      },
    ],
    tools: ({ currentRun, engineChannel }, { register }) => {
      registerInboxTools(
        currentRun,
        (tool) => register(tool, 'inbox-tools'),
        () => engineChannel?.(),
      );
      registerSourceAttentionTools(currentRun, (tool) => register(tool, 'source-attention-tools'));
    },
  } satisfies FeatureContribution<
    ActivityBridgeContext,
    ActivityAgentContext,
    { activityObservers: typeof apply }
  >;
}
