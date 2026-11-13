import { ALL_HOSTS, THIS_HOST, type RemoteHostsSnapshot } from './remote-hosts.js';
import type { ActivityListState } from './store.js';
import type { InboxSnapshot } from '../../../../apps/mobile/src/host/inbox.js';

export function environmentUnread(inbox: InboxSnapshot): number | undefined {
  if (inbox.status !== 'ready' || inbox.stale || Object.values(inbox.cursors ?? {}).some(Boolean))
    return undefined;
  return Object.values(inbox.unread ?? {}).reduce((sum, count) => sum + count, 0);
}

type Attention = Pick<
  ActivityListState,
  'unreadCount' | 'hasAction' | 'messageCounts' | 'attentionStatus'
>;

export function environmentAttention(local: Attention, sources: RemoteHostsSnapshot): Attention {
  const includesLocal = sources.tab === ALL_HOSTS || sources.tab === THIS_HOST;
  let unreadCount = includesLocal ? local.unreadCount : 0;
  let hasAction = includesLocal && local.hasAction;
  let ready = !includesLocal || local.attentionStatus === 'ready';
  let replies = includesLocal ? (local.messageCounts?.replies ?? 0) : 0;
  let other = includesLocal ? (local.messageCounts?.other ?? 0) : 0;
  for (const source of sources.hosts) {
    if (sources.tab !== ALL_HOSTS && sources.tab !== source.host.hostId) continue;
    const inbox = source.inbox;
    if (inbox.status !== 'ready') {
      ready = false;
      continue;
    }
    unreadCount += Object.values(inbox.unread ?? {}).reduce((sum, count) => sum + count, 0);
    hasAction ||= inbox.sections.action.length > 0;
    replies += inbox.sections.replies.length;
    other += inbox.sections.unread.length;
    ready &&=
      source.snapshot.connection.status === 'connected' &&
      !inbox.stale &&
      !Object.values(inbox.cursors ?? {}).some(Boolean);
  }
  return {
    unreadCount,
    hasAction,
    messageCounts: { replies, other },
    attentionStatus: ready ? 'ready' : 'error',
  };
}
