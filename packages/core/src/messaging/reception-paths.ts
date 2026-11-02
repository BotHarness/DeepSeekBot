import type { DatabaseSync } from 'node:sqlite';
import { bridgeChannel } from './channel-target.js';
import { channelBridgeRoutes, type ChannelBridgeRoute } from './channel-bridge.js';
import type { MessagingGrant } from './outbound.js';

export interface GrantReception {
  kind: 'grant';
  grantId: string;
  grantRevision: number;
}

export function recordGrantReception(
  db: DatabaseSync,
  sourceEventId: string,
  botSlug: string,
): void {
  const source = db
    .prepare(`SELECT json_extract(payload_json, '$.external.grantId') AS grantId,
    json_extract(payload_json, '$.external.grantRevision') AS grantRevision
    FROM source_events WHERE source_event_id = ?`)
    .get(sourceEventId) as { grantId: string; grantRevision: number };
  const evidence: GrantReception = { kind: 'grant', ...source };
  db.prepare(`INSERT INTO messaging_source_paths
    (source_event_id, bot_slug, grant_id, route_id, channel_id, body) VALUES (?, ?, ?, ?, NULL, ?)`).run(
    sourceEventId,
    botSlug,
    source.grantId,
    `grant:${source.grantId}`,
    JSON.stringify(evidence),
  );
}

export function grantReception(
  db: DatabaseSync,
  sourceEventId: string,
  botSlug: string,
): GrantReception | undefined {
  const row = db
    .prepare(`SELECT body FROM messaging_source_paths
    WHERE source_event_id = ? AND bot_slug = ? AND json_extract(body, '$.kind') = 'grant'`)
    .get(sourceEventId, botSlug) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as GrantReception) : undefined;
}

export interface ReceptionPath {
  kind?: 'bridge';
  routeId: string;
  name: string;
  channelName?: string;
  grantId: string;
  grantRevision: number;
  channelId: string | null;
  routeRevision: number;
  intakeAfter?: string;
  reason: 'group-mention' | 'group-ordinary' | 'human-dm';
  mode: 'all' | 'mentions' | 'digest' | 'silent' | 'context' | 'immediate' | 'conditional';
  count: number;
  intervalMs: number;
  policyRevision: number;
  sourceRevision: number;
  defaultRevision: number;
  threadRevision?: number;
  threadId?: string;
}
export function recordReceptionPath(
  db: DatabaseSync,
  sourceEventId: string,
  botSlug: string,
  grant: MessagingGrant,
  route: ChannelBridgeRoute,
  policy: Omit<
    ReceptionPath,
    | 'routeId'
    | 'grantId'
    | 'grantRevision'
    | 'channelId'
    | 'routeRevision'
    | 'intakeAfter'
    | 'name'
    | 'channelName'
  >,
): void {
  const path: ReceptionPath = {
    ...policy,
    kind: 'bridge',
    routeId: route.id,
    name: route.name,
    ...(route.channelId
      ? { channelName: bridgeChannel(db, route.channelId, grant.botSlug).name }
      : {}),
    grantId: grant.id,
    grantRevision: grant.revision,
    channelId: route.channelId,
    routeRevision: route.revision,
    ...(route.intakeAfter ? { intakeAfter: route.intakeAfter } : {}),
  };
  db.prepare(`INSERT OR IGNORE INTO messaging_source_paths
    (source_event_id, bot_slug, grant_id, route_id, channel_id, body) VALUES (?, ?, ?, ?, ?, ?)`).run(
    sourceEventId,
    botSlug,
    grant.id,
    route.id,
    route.channelId,
    JSON.stringify(path),
  );
}
export function currentReceptionPaths(
  db: DatabaseSync,
  botSlug: string,
  sourceEventId: string,
  live?: (grant: MessagingGrant) => boolean,
  purpose: 'intake' | 'reply' | 'history' = 'intake',
): ReceptionPath[] {
  const rows = db
    .prepare(`SELECT p.body, g.body AS grant_body FROM messaging_source_paths p
    JOIN messaging_grants g ON g.id = p.grant_id
    WHERE p.source_event_id = ? AND p.bot_slug = ? AND json_extract(p.body, '$.kind') IS NOT 'grant'`)
    .all(sourceEventId, botSlug) as { body: string; grant_body: string }[];
  return rows.flatMap((row) => {
    const path = JSON.parse(row.body) as ReceptionPath;
    const grant = JSON.parse(row.grant_body) as MessagingGrant;
    const route = channelBridgeRoutes(grant).find((item) => item.id === path.routeId);
    if (
      purpose !== 'history' &&
      (!route ||
        grant.revokedAt ||
        grant.suspendedReason ||
        !grant.receiveScope ||
        grant.revision !== path.grantRevision ||
        (live && !live(grant)))
    )
      return [];
    if (purpose === 'intake' && (!route?.enabled || route.intakeAfter !== path.intakeAfter))
      return [];
    if (path.channelId) {
      try {
        bridgeChannel(db, path.channelId, botSlug);
      } catch {
        return [];
      }
    } else if (grant.botSlug !== botSlug) return [];
    return [path];
  });
}
export interface ReceptionPathPending {
  source_event_id: string;
  body: string;
  created_at: string;
  attempt_state: string;
}
export function pendingReceptionPaths(
  db: DatabaseSync,
  botSlug: string,
  now: Date,
  live: (grant: MessagingGrant) => boolean,
  context = false,
): {
  ready: ReceptionPathPending[];
  digests: {
    first_at: string;
    wake_count: number;
    wake_interval_ms: number;
    pending_count: number;
    anchor: string;
  }[];
} {
  const rows = db
    .prepare(`SELECT DISTINCT e.source_event_id, e.body, e.created_at, a.attempt_state
    FROM messaging_source_paths p JOIN source_events e USING(source_event_id)
    JOIN inbox_admissions a ON a.source_event_id = p.source_event_id AND a.bot_slug = p.bot_slug
    WHERE p.bot_slug = ? AND json_extract(p.body, '$.kind') IS NOT 'grant'
      AND a.attempt_state IN ('pending', 'retryable') AND a.observed_at IS NULL
    ORDER BY e.created_at, e.source_event_id`)
    .all(botSlug) as unknown as ReceptionPathPending[];
  const groups = new Map<string, { paths: ReceptionPath; rows: ReceptionPathPending[] }>();
  const mentions = new Set<string>();
  for (const row of rows) {
    for (const path of currentReceptionPaths(db, botSlug, row.source_event_id, live)) {
      const scope = JSON.stringify([path.routeId, path.threadId ?? '']);
      if (path.reason === 'group-mention') mentions.add(scope);
      const key = JSON.stringify([
        scope,
        path.routeRevision,
        path.policyRevision,
        path.sourceRevision,
        path.defaultRevision,
        path.threadRevision,
        path.reason,
        path.mode,
        path.count,
        path.intervalMs,
      ]);
      const group = groups.get(key) ?? { paths: path, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
  }
  const selected = new Set<string>();
  const digests: ReturnType<typeof pendingReceptionPaths>['digests'] = [];
  for (const { paths: path, rows: candidates } of groups.values()) {
    const immediate =
      path.mode === 'all' ||
      path.mode === 'immediate' ||
      (path.reason === 'group-mention' && path.mode !== 'silent' && path.mode !== 'context') ||
      (path.reason === 'human-dm' &&
        path.mode !== 'silent' &&
        path.mode !== 'context' &&
        path.mode !== 'digest');
    const first = candidates[0]!;
    if (path.mode === 'digest' && path.reason !== 'group-mention')
      digests.push({
        first_at: first.created_at,
        wake_count: path.count,
        wake_interval_ms: path.intervalMs,
        pending_count: candidates.length,
        anchor: first.source_event_id,
      });
    const ready =
      immediate ||
      (path.mode === 'digest' &&
        (candidates.length >= path.count ||
          now.getTime() - Date.parse(first.created_at) >= path.intervalMs)) ||
      (context &&
        mentions.has(JSON.stringify([path.routeId, path.threadId ?? ''])) &&
        (path.mode === 'mentions' || path.mode === 'digest' || path.mode === 'context'));
    if (ready) for (const row of candidates) selected.add(row.source_event_id);
  }
  return { ready: rows.filter((row) => selected.has(row.source_event_id)), digests };
}
