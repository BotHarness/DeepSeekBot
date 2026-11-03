import type { HostSnapshot } from './client';
import type { InboxSnapshot } from './inbox';

export interface ConnectionSummary {
  hosts: number;
  connected: number;
  synced: number;
  active: number;
  needsYou: number;
}

export function connectionSummary(
  hosts: readonly {
    hostId: string;
    enabled: boolean;
    snapshot: HostSnapshot;
    attention: InboxSnapshot;
  }[],
): ConnectionSummary {
  const result: ConnectionSummary = { hosts: 0, connected: 0, synced: 0, active: 0, needsYou: 0 };
  const seen = new Set<string>();
  for (const host of hosts) {
    if (!host.enabled || seen.has(host.hostId)) continue;
    seen.add(host.hostId);
    result.hosts++;
    if (host.snapshot.connection.status !== 'connected') continue;
    result.connected++;
    const activity = host.snapshot.activity;
    const attention = host.attention;
    if (
      activity === undefined ||
      activity.some((bot) => typeof bot.active !== 'boolean') ||
      attention.status !== 'ready' ||
      attention.stale ||
      attention.notificationItems === undefined
    )
      continue;
    result.synced++;
    result.active += new Set(activity.filter((bot) => bot.active).map((bot) => bot.slug)).size;
    result.needsYou += new Set(
      attention.notificationItems
        .filter((item) => item.category === 'action' && item.botSlug !== '')
        .map((item) => item.botSlug),
    ).size;
  }
  return result;
}
