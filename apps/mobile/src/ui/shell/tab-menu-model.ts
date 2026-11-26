import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';
import type { RosterView } from '@botharness/host-client/client';
import { includesComputerActivity } from '../../host/conversation-environments';
import {
  conversations,
  titleOf,
  type Conversation,
  type UnreadCounts,
} from '../chat/conversations';

export type TabMenuGlyph = 'bot' | 'channel' | 'person' | 'session' | 'activity' | 'new';

export type TabMenuEntry = {
  key: string;
  label: string;
  glyph: TabMenuGlyph;
  run(): void;
};

export type TabMenuHost = {
  hostId: string;
  connected: boolean;
  roster: RosterView | undefined;
  action: readonly HumanAttentionItem[] | undefined;
  unread?: UnreadCounts;
  quiet?: readonly string[];
};

const time = (value: string | number | null | undefined) =>
  typeof value === 'number' ? value : Date.parse(value ?? '') || 0;

export function recentConversations(
  hosts: readonly TabMenuHost[],
  scope: string,
  limit: number,
): { hostId: string; conversation: Conversation }[] {
  return hosts
    .filter((host) => host.connected && includesComputerActivity(scope, host.hostId))
    .flatMap((host) =>
      conversations(host.roster, [...(host.action ?? [])], host.unread, host.quiet).map(
        (conversation) => ({ hostId: host.hostId, conversation }),
      ),
    )
    .filter(({ conversation }) => latest(conversation) !== undefined)
    .sort(
      (a, b) =>
        time(latest(b.conversation)) - time(latest(a.conversation)) ||
        a.conversation.key.localeCompare(b.conversation.key),
    )
    .slice(0, limit);
}

const latest = (conversation: Conversation) => conversation.at ?? conversation.createdAt;

export function conversationGlyph(conversation: Conversation): TabMenuGlyph {
  return conversation.kind === 'bot' ? 'bot' : conversation.person ? 'person' : 'channel';
}

export function conversationLabel(conversation: Conversation): string {
  return titleOf(conversation);
}

export function pendingActivity(
  hosts: readonly TabMenuHost[],
  scope: string,
  limit: number,
): { hostId: string; item: HumanAttentionItem }[] {
  return hosts
    .filter((host) => host.connected && includesComputerActivity(scope, host.hostId))
    .flatMap((host) => (host.action ?? []).map((item) => ({ hostId: host.hostId, item })))
    .sort(
      (a, b) =>
        time(b.item.createdAt) - time(a.item.createdAt) ||
        `${a.hostId}:${a.item.id}`.localeCompare(`${b.hostId}:${b.item.id}`),
    )
    .slice(0, limit);
}

export function activityLabel(item: HumanAttentionItem, roster: RosterView | undefined): string {
  const bot =
    item.nativeSession !== undefined
      ? item.nativeSession.sessionTitle
      : roster?.bots.find((entry) => entry.slug === item.botSlug)?.displayName;
  const summary = item.summary.trim();
  if (bot === undefined) return summary;
  return summary === '' ? bot : `${bot}: ${summary}`;
}

export function recentSessionsShown(
  rows: readonly HostSessionRow[] | undefined,
  hideBotSessions: boolean,
): readonly HostSessionRow[] | undefined {
  return hideBotSessions ? rows?.filter((row) => row.source.kind !== 'bot') : rows;
}
