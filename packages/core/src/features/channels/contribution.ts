import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import type { ChannelsBridgeDeps } from './bridge-deps.js';
import { createGroupMemberMethods } from './group-members.js';
import { createChannelsManagementAdapterMethods } from './management-methods.js';
import { createChannelsAdapterMethods } from './methods.js';
import { mountLiveRoute, reconcileGroupMembers } from './plugin.js';
import { groupCollaborationPrompt, peerReviewPrompt } from './prompt.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import {
  channelChangeRpc,
  channelDeletionRpc,
  channelHistoryRpc,
  channelManagementRpc,
  channelsRpcMethods,
  channelSendRpc,
  channelStreams,
} from './rpc.js';
import { createChannelsSendAdapterMethods } from './send-methods.js';
import {
  createBotContactsTool,
  createChannelListTool,
  createChannelReadTool,
  createGroupCreateTool,
  createGroupLeaveTool,
  registerGroupChannelTools,
} from './tools.js';

export interface ChannelsBridgeContext {
  deps: ChannelsBridgeDeps;
  human: HumanContext;
  globalRegistry: ChannelsBridgeDeps['registry'];
  isHostOwner: () => boolean;
  channelView: Parameters<typeof createChannelsAdapterMethods>[3];
  listedChannels: Parameters<typeof createChannelsAdapterMethods>[4];
  listItem: Parameters<typeof createChannelsAdapterMethods>[5];
  detailOf: Parameters<typeof createChannelsManagementAdapterMethods>[4];
  channelSkillBots: Parameters<typeof createChannelsSendAdapterMethods>[3];
}

export interface ChannelsAgentContext {
  currentRun: Parameters<typeof registerGroupChannelTools>[0];
  promptText(): PromptText;
}

function bridgeMethods({
  deps,
  human,
  globalRegistry,
  isHostOwner,
  channelView,
  listedChannels,
  listItem,
  detailOf,
  channelSkillBots,
}: ChannelsBridgeContext) {
  const management = createChannelsManagementAdapterMethods(
    human,
    deps,
    globalRegistry,
    channelView,
    detailOf,
  );
  return {
    ...createChannelsAdapterMethods(
      human,
      deps,
      isHostOwner,
      channelView,
      listedChannels,
      listItem,
    ),
    ...management,
    ...createGroupMemberMethods({
      human,
      deps: { ...deps, registry: globalRegistry },
      invite: management.channelGroupInvite,
    }),
    ...createChannelsSendAdapterMethods(human, deps, globalRegistry, channelSkillBots),
  };
}

export function createChannelsContribution() {
  return {
    id: 'channels',
    bridgeMethods,
    rpc: {
      ...channelsRpcMethods,
      ...channelChangeRpc,
      ...channelManagementRpc,
      ...channelDeletionRpc,
      ...channelHistoryRpc,
      ...channelSendRpc,
    },
    streams: channelStreams,
    host: { channelLiveRoute: mountLiveRoute, channelStartupReconciliation: reconcileGroupMembers },
    promptSections: ({ promptText }) => [
      {
        placement: 'slot',
        slot: 'group-collaboration',
        text: () => groupCollaborationPrompt(promptText()),
      },
      { placement: 'slot', slot: 'peer-review', text: () => peerReviewPrompt(promptText()) },
    ],
    tools: ({ currentRun }, { register }) => {
      register(createChannelListTool(currentRun), 'after-assignment-tools');
      register(createChannelReadTool(currentRun), 'before-inbox-tools');
      register(createBotContactsTool(currentRun), 'before-source-attention-tools');
      register(createGroupCreateTool(currentRun), 'before-source-attention-tools');
      registerGroupChannelTools(currentRun, (tool) =>
        register(tool, 'before-source-attention-tools'),
      );
      register(createGroupLeaveTool(currentRun), 'after-schedule-tools');
    },
  } satisfies FeatureContribution<
    ChannelsBridgeContext,
    ChannelsAgentContext,
    {
      channelLiveRoute: typeof mountLiveRoute;
      channelStartupReconciliation: typeof reconcileGroupMembers;
    }
  >;
}
