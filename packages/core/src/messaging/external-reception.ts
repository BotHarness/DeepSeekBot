import type { DatabaseSync } from 'node:sqlite';
import type { MessagingGrant } from './outbound.js';
import { pendingReceptionPaths, type ReceptionPathPending } from './reception-paths.js';

export interface ExternalPending {
  ready: ReceptionPathPending[];
  digests: ReturnType<typeof pendingReceptionPaths>['digests'];
}

export function pendingExternalReception(
  db: DatabaseSync,
  botSlug: string,
  now: Date,
  live: (grant: MessagingGrant) => boolean,
  available: (sourceEventId: string) => boolean,
  context = false,
): ExternalPending {
  const digests = db
    .prepare(`
      SELECT MIN(e.created_at) AS first_at, MIN(a.wake_count) AS wake_count,
        MIN(a.wake_interval_ms) AS wake_interval_ms, COUNT(*) AS pending_count,
        MIN(e.source_event_id) AS anchor
      FROM source_events e JOIN inbox_admissions a USING(source_event_id)
      JOIN messaging_grants g ON g.id = json_extract(e.payload_json, '$.external.grantId')
      LEFT JOIN messaging_thread_policy_revisions tp ON tp.grant_id = g.id
        AND tp.thread_id = json_extract(e.payload_json, '$.external.event.reply.threadId')
        AND tp.revision = a.external_thread_policy_revision
      WHERE a.bot_slug = ? AND e.source_kind = 'bridge-message' AND e.channel_id IS NULL
        AND (EXISTS (SELECT 1 FROM messaging_source_paths gp WHERE gp.source_event_id = e.source_event_id AND gp.bot_slug = a.bot_slug AND json_extract(gp.body, '$.kind') = 'grant')
          OR NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)) AND a.reason = 'group-ordinary'
        AND a.wake_count IS NOT NULL AND a.attempt_state = 'pending' AND a.observed_at IS NULL
        AND g.revoked_at IS NULL AND json_extract(g.body, '$.receiveScope') IS NOT NULL
        AND json_extract(g.body, '$.suspendedReason') IS NULL
        AND g.revision = json_extract(e.payload_json, '$.external.grantRevision')
      GROUP BY g.id, a.wake_policy_revision, a.source_policy_revision, a.external_default_revision, CASE WHEN json_extract(tp.body, '$.mode') = 'follow' THEN tp.thread_id ELSE '' END, CASE WHEN json_extract(tp.body, '$.mode') = 'follow' THEN tp.revision ELSE 0 END`)
    .all(botSlug) as ExternalPending['digests'];
  const retained = db
    .prepare(`WITH pending AS (
      SELECT e.source_event_id, e.body, e.created_at, a.attempt_state, a.reason, a.wake_mode, a.source_policy_wake_mode,
        a.wake_count, a.wake_interval_ms, g.id AS grant_id,
        SUM(CASE WHEN a.reason = 'group-ordinary' THEN 1 ELSE 0 END) OVER policy AS pending_count,
        MIN(CASE WHEN a.reason = 'group-ordinary' THEN e.created_at END) OVER policy AS first_at,
        MAX(CASE WHEN a.reason = 'group-mention' THEN 1 ELSE 0 END) OVER (PARTITION BY g.id, CASE WHEN json_extract(tp.body, '$.mode') = 'follow' THEN tp.thread_id ELSE '' END) AS has_mention
      FROM source_events e JOIN inbox_admissions a USING(source_event_id)
      JOIN messaging_grants g ON g.id = json_extract(e.payload_json, '$.external.grantId')
      LEFT JOIN messaging_thread_policy_revisions tp ON tp.grant_id = g.id
        AND tp.thread_id = json_extract(e.payload_json, '$.external.event.reply.threadId')
        AND tp.revision = a.external_thread_policy_revision
      WHERE g.revoked_at IS NULL AND json_extract(g.body, '$.receiveScope') IS NOT NULL
        AND json_extract(g.body, '$.suspendedReason') IS NULL
        AND g.revision = json_extract(e.payload_json, '$.external.grantRevision')
        AND a.bot_slug = ? AND e.source_kind = 'bridge-message'
        AND (EXISTS (SELECT 1 FROM messaging_source_paths gp WHERE gp.source_event_id = e.source_event_id AND gp.bot_slug = a.bot_slug AND json_extract(gp.body, '$.kind') = 'grant')
          OR NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id))
        AND (a.reason != 'group-ordinary' OR e.channel_id IS NULL)
        AND a.attempt_state IN ('pending', 'retryable') AND a.observed_at IS NULL
      WINDOW policy AS (PARTITION BY g.id, a.wake_policy_revision, a.source_policy_revision, a.external_default_revision, a.reason, a.wake_mode, CASE WHEN json_extract(tp.body, '$.mode') = 'follow' THEN tp.thread_id ELSE '' END, CASE WHEN json_extract(tp.body, '$.mode') = 'follow' THEN tp.revision ELSE 0 END)
    ) SELECT source_event_id, body, created_at, attempt_state FROM pending
      WHERE (reason = 'group-mention' AND wake_mode IS NOT 'silent') OR (reason = 'human-dm' AND wake_mode = 'all') OR (reason = 'group-ordinary' AND (
        wake_mode = 'all' OR (wake_mode = 'digest' AND (pending_count >= wake_count OR
          (julianday(?) - julianday(first_at)) * 86400000 >= wake_interval_ms)) OR
        (? = 1 AND has_mention = 1 AND (wake_mode IN ('digest', 'mentions') OR (wake_mode = 'silent' AND source_policy_wake_mode = 'context')))))
      ORDER BY CASE WHEN reason = 'group-mention' THEN 0 ELSE 1 END, created_at, source_event_id LIMIT 20
    `)
    .all(botSlug, now.toISOString(), context ? 1 : 0) as unknown as ReceptionPathPending[];
  const routed = pendingReceptionPaths(db, botSlug, now, live, context);
  return {
    ready: [
      ...new Map([...retained, ...routed.ready].map((row) => [row.source_event_id, row])).values(),
    ]
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) ||
          a.source_event_id.localeCompare(b.source_event_id),
      )
      .slice(0, 20),
    digests: [...digests.filter((row) => available(row.anchor)), ...routed.digests],
  };
}
