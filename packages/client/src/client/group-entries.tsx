import type { ReactElement } from 'react';

import { sameBotNames, useClientStore } from './use-client-store.js';
import { ChannelBridgeAttention, ChannelBridgeList } from './channel-bridge-list.js';
import type { ChannelSettingsAttentionProps, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ConversationIngestRows } from './conversation-ingest-list.js';
import { GroupWakePolicyList } from './group-wake-policy-list.js';
import type { ClientState } from './store.js';

function groupChannel(state: ClientState, channelId: string) {
  const channel = state.channels.find((item) => item.id === channelId);
  return channel?.type === 'group' ? channel : undefined;
}

function botNames(bots: ClientState['bots']): ReadonlyMap<string, string> {
  return new Map(bots.map((bot) => [bot.slug, bot.displayName]));
}

export function isGroupConversation(state: ClientState): boolean {
  return state.conversation.channel?.type === 'group';
}

export function GroupWakePolicyEntry({
  channelId,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const channel = useClientStore((state) => groupChannel(state, channelId));
  const bots = useClientStore((state) => state.bots, sameBotNames);
  if (channel === undefined) return <></>;
  return (
    <GroupWakePolicyList
      key={channel.id}
      channel={channel}
      botNames={botNames(bots)}
      actions={actions}
      t={t}
    />
  );
}

export function GroupConnectorsAttention({
  channelId,
  actions,
  report,
}: ChannelSettingsAttentionProps): ReactElement {
  return <ChannelBridgeAttention channelId={channelId} actions={actions} report={report} />;
}

export function GroupConnectorsEntry({
  channelId,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const channel = useClientStore((state) => groupChannel(state, channelId));
  const bots = useClientStore((state) => state.bots, sameBotNames);
  if (channel === undefined) return <></>;
  const names = botNames(bots);
  return (
    <ChannelBridgeList
      key={channel.id}
      channelId={channel.id}
      channelName={channel.name}
      botNames={names}
      actions={actions}
      t={t}
      showEmpty={false}
    >
      <ConversationIngestRows
        key={`ingest:${channel.id}`}
        channelId={channel.id}
        botNames={names}
        actions={actions}
        t={t}
      />
    </ChannelBridgeList>
  );
}
