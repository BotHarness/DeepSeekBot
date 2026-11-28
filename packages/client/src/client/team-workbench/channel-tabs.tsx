import type { ReactNode } from 'react';

import type { ChannelListItem } from '@botharness/host-protocol/wire';
import type { BridgeCall } from '../bridge.js';
import { ChannelAccessSettings } from '../channel-access-settings.js';
import { ChannelBotSettingsPanel } from '../channel-bot-settings.js';
import type { BotHarnessKey, BotHarnessTranslate } from '../locale.js';
import { ChannelMembersTab } from './channel-members-tab.js';

export type ChannelTabId = 'members' | 'bots' | 'permissions' | 'approvals';

export interface ChannelTabProps {
  readonly call: BridgeCall;
  readonly t: BotHarnessTranslate;
  readonly channel: ChannelListItem;
  readonly botName: (slug: string) => string;
}

export interface ChannelTab {
  readonly id: ChannelTabId;
  readonly label: BotHarnessKey;
  count(channel: ChannelListItem): number | undefined;
  render(props: ChannelTabProps): ReactNode;
}

export const CHANNEL_TABS: readonly ChannelTab[] = [
  {
    id: 'members',
    label: 'team.workbench.channels.members',
    count: (channel) => channel.humanMembers?.length ?? 0,
    render: (props) => <ChannelMembersTab {...props} />,
  },
  {
    id: 'bots',
    label: 'channelBots.tab',
    count: (channel) => channel.members.length,
    render: ({ call, t, channel }) => (
      <ChannelBotSettingsPanel key={channel.id} channelId={channel.id} call={call} t={t} />
    ),
  },
  {
    id: 'permissions',
    label: 'team.workbench.channels.permissions',
    count: () => undefined,
    render: ({ call, t, channel }) => (
      <ChannelAccessSettings
        key={channel.id}
        channelId={channel.id}
        call={call}
        t={t}
        humans={channel.humanMembers ?? []}
        permissionsOnly
      />
    ),
  },
  {
    id: 'approvals',
    label: 'channelApprovals.tab',
    count: () => undefined,
    render: ({ call, t, channel }) => (
      <ChannelAccessSettings
        key={channel.id}
        channelId={channel.id}
        call={call}
        t={t}
        humans={channel.humanMembers ?? []}
        approvalsOnly
      />
    ),
  },
];
