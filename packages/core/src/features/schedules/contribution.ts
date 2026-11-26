import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { InboxWakeSource, RuntimeHost } from '../../kernel/runtime-host.js';
import type { HumanContext } from '../../humans/context.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import { createSchedulesBridgeMethods } from './methods.js';
import { schedulePrompt } from './prompt.js';
import { schedulesServiceRpc } from './rpc.js';
import { nativeScheduleToolRefusal, registerScheduleTools } from './tools.js';

export interface SchedulesBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createSchedulesBridgeMethods>[1];
}

export interface SchedulesAgentContext {
  currentRun: Parameters<typeof registerScheduleTools>[0];
  promptText(): PromptText;
}

export function createSchedulesContribution(wakeSource?: InboxWakeSource) {
  return {
    id: 'schedules',
    bridgeMethods: ({ human, deps }) => createSchedulesBridgeMethods(human, deps),
    rpc: schedulesServiceRpc,
    ...(wakeSource === undefined
      ? {}
      : { runtime: (host: RuntimeHost) => host.registerInboxWakeSource(wakeSource) }),
    promptSections: ({ promptText }) => [
      { placement: 'role', text: () => schedulePrompt(promptText()) },
    ],
    tools: ({ currentRun }, { register, guard }) => {
      guard(nativeScheduleToolRefusal);
      registerScheduleTools(currentRun, (tool) => register(tool, 'after-channel-tools'));
    },
  } satisfies FeatureContribution<SchedulesBridgeContext, SchedulesAgentContext>;
}
