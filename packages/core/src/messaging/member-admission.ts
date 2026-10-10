import { recordReceptionPath } from './reception-paths.js';
import type { MessagingGrant } from './outbound.js';
import type { ChannelBridgeRoute } from './channel-bridge.js';
import { messagingDefaults, externalMemberWake } from './defaults.js';
import type { DatabaseSync } from 'node:sqlite';
import type { ChannelRecord } from '../channels/channel.js';
import { type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { ThreadReceptionPolicy } from './thread-policy.js';
import { sourceSenderAllowed } from './sender-access.js';

export function admitBridgeMembers(
  db: DatabaseSync,
  sourceEventId: string,
  channel: ChannelRecord,
  sourcePolicy: BotSourcePolicyStore,
  isBotActive: (botSlug: string) => boolean,
  followed?: {
    botSlug: string;
    wake: NonNullable<ThreadReceptionPolicy['wake']>;
    revision: number;
  },
  path?: { grant: MessagingGrant; route: ChannelBridgeRoute; threadId?: string },
): string[] {
  const admitted: string[] = [];
  for (const botSlug of channel.members) {
    if (!isBotActive(botSlug) || !sourceSenderAllowed(db, botSlug, sourceEventId)) continue;
    const rule = sourcePolicy.resolveIn(db, botSlug, 'group-ordinary');
    const defaults = messagingDefaults(db, path?.grant.platform);
    const { policy } = externalMemberWake(channel, botSlug, rule, defaults);
    const thread = followed?.botSlug === botSlug ? followed : undefined;
    const mode = thread
      ? thread.wake.wake === 'immediate'
        ? 'all'
        : thread.wake.wake
      : policy.mode;
    const result = db
      .prepare(`INSERT OR IGNORE INTO inbox_admissions
      (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
       wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
      VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        sourceEventId,
        botSlug,
        rule.revision,
        rule.wake,
        policy.revision,
        mode,
        mode === 'all' ? 1 : mode === 'digest' ? (thread?.wake.count ?? policy.count) : null,
        mode === 'all'
          ? 0
          : mode === 'digest'
            ? (thread?.wake.intervalSeconds ?? policy.intervalSeconds) * 1000
            : null,
        thread?.revision ?? null,
        defaults.revision,
      );
    if (path)
      recordReceptionPath(db, sourceEventId, botSlug, path.grant, path.route, {
        reason: 'group-ordinary',
        mode,
        count: mode === 'all' ? 1 : (thread?.wake.count ?? policy.count),
        intervalMs:
          mode === 'all' ? 0 : (thread?.wake.intervalSeconds ?? policy.intervalSeconds) * 1000,
        policyRevision: policy.revision,
        sourceRevision: rule.revision,
        defaultRevision: defaults.revision,
        ...(thread ? { threadRevision: thread.revision, threadId: path.threadId } : {}),
      });
    if (result.changes > 0) admitted.push(botSlug);
  }
  return admitted;
}
