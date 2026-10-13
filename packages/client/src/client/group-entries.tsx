import type { ReactElement } from 'react';

import { useClientState } from './bot-sidebar.js';
import { ChannelBridgeAttention, ChannelBridgeList } from './channel-bridge-list.js';
import type { ChannelSettingsAttentionProps, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ConversationIngestRows } from './conversation-ingest-list.js';
import { GroupWakePolicyList } from './group-wake-policy-list.js';
import type { ClientState } from './store.js';

function groupChannel(state: ClientState, channelId: string) {
  const channel = state.channels.find((item) => item.id === channelId);
  return channel?.type === 'group' ? channel : undefined;
}

function botNames(state: ClientState): ReadonlyMap<string, string> {
  return new Map(state.bots.map((bot) => [bot.slug, bot.displayName]));
}

export function isGroupConversation(state: ClientState): boolean {
  return state.conversation.channel?.type === 'group';
}

export function GroupWakePolicyEntry({
  channelId,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const channel = groupChannel(state, channelId);
  if (channel === undefined) return <></>;
  return (
    <GroupWakePolicyList
      key={channel.id}
      channel={channel}
      botNames={botNames(state)}
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
  const state = useClientState();
  const channel = groupChannel(state, channelId);
  if (channel === undefined) return <></>;
  const names = botNames(state);
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
