import type { RosterView } from '@botharness/host-client/client';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { conversations, type Conversation, type UnreadCounts } from '../../ui/chat/conversations';
import type { PinnedBinding } from './pinned-binding';
import { tobSlug } from './tob';

export type PinnedHost = {
  hostId: string;
  roster: RosterView | undefined;
  action?: readonly HumanAttentionItem[] | undefined;
  unread?: UnreadCounts | undefined;
  quiet?: readonly string[] | undefined;
};

export type PinnedTarget = {
  hostId: string;
  conversation: Conversation;
  fallback: boolean;
};

export function pinnedHostId(
  scope: string,
  hostIds: readonly string[],
  recentHostIds: readonly string[],
  currentHostId: string | undefined,
): string | undefined {
  const selected = hostIds.find((hostId) => computerEnvironmentKey(hostId) === scope);
  if (selected !== undefined) return selected;
  if (computerScope(scope)) return undefined;
  const order = [
    ...recentHostIds,
    ...(currentHostId === undefined ? [] : [currentHostId]),
    ...hostIds,
  ];
  return order.find((hostId) => hostIds.includes(hostId));
}

function computerScope(scope: string): boolean {
  try {
    const parsed: unknown = JSON.parse(scope);
    return Array.isArray(parsed) && parsed[0] === 'computer';
  } catch {
    return false;
  }
}

export function bindingKey(binding: PinnedBinding): string {
  return binding.kind === 'bot' ? `bot:${binding.slug}` : `channel:${binding.id}`;
}

export function pinnedChoices(host: PinnedHost): readonly Conversation[] | undefined {
  const roster = host.roster;
  if (roster === undefined) return undefined;
  const shown =
    roster.arrangement === undefined
      ? roster
      : { ...roster, arrangement: { ...roster.arrangement, hidden: [] } };
  return conversations(shown, [...(host.action ?? [])], host.unread, host.quiet);
}

export function defaultPinnedConversation(
  roster: RosterView,
  rows: readonly Conversation[],
): Conversation | undefined {
  const tob = tobSlug(roster);
  return (
    (typeof tob === 'string' ? rows.find((row) => row.key === `bot:${tob}`) : undefined) ?? rows[0]
  );
}

export function bindingOf(conversation: Conversation): PinnedBinding {
  return conversation.kind === 'bot'
    ? { kind: 'bot', slug: conversation.bot.slug }
    : { kind: 'channel', id: conversation.channel.id };
}

export function resolvePinnedTarget(
  host: PinnedHost,
  binding: PinnedBinding | undefined,
): PinnedTarget | undefined {
  const rows = pinnedChoices(host);
  if (rows === undefined || host.roster === undefined) return undefined;
  const bound =
    binding === undefined ? undefined : rows.find((row) => row.key === bindingKey(binding));
  if (bound !== undefined) return { hostId: host.hostId, conversation: bound, fallback: false };
  const fallback = defaultPinnedConversation(host.roster, rows);
  return fallback === undefined
    ? undefined
    : { hostId: host.hostId, conversation: fallback, fallback: binding !== undefined };
}
