import type { RosterView } from '@botharness/host-client/client';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { conversations, type Conversation, type UnreadCounts } from '../../ui/chat/conversations';
import type { PinnedBinding } from './pinned-binding';
import { stewardSlug } from './steward';

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

export function resolvePinnedTarget(
  host: PinnedHost,
  binding: PinnedBinding | undefined,
): PinnedTarget | undefined {
  const roster = host.roster;
  if (roster === undefined) return undefined;
  const shown =
    roster.arrangement === undefined
      ? roster
      : { ...roster, arrangement: { ...roster.arrangement, hidden: [] } };
  const rows = conversations(shown, [...(host.action ?? [])], host.unread, host.quiet);
  const find = (key: string) => rows.find((row) => row.key === key);
  const bound = binding === undefined ? undefined : find(bindingKey(binding));
  if (bound !== undefined) return { hostId: host.hostId, conversation: bound, fallback: false };
  const steward = stewardSlug(roster);
  const fallback = typeof steward === 'string' ? find(`bot:${steward}`) : undefined;
  return fallback === undefined
    ? undefined
    : { hostId: host.hostId, conversation: fallback, fallback: binding !== undefined };
}
