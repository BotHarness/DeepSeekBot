import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ExternalSource } from './inbound.js';
import { readMessagingIdentity } from './identity.js';
import type { PairingRequest } from './pairing.js';
import { MessagingError } from './provider.js';
import { externalUserRoles, readSenderPolicy, trustedSenderReference } from './sender-access.js';

const querySchema = z
  .object({
    kind: z.enum(['people', 'conversations', 'observed-people']),
    sourceEventId: z.string().min(1).max(200).optional(),
    cursor: z.string().max(2000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export type MessagingDirectoryQuery = z.infer<typeof querySchema>;
export interface MessagingDirectoryPage {
  kind: MessagingDirectoryQuery['kind'];
  queriedAt: string;
  policyRevision: number;
  rows: Record<string, unknown>[];
  nextCursor?: string;
  coverage: {
    kind: 'current-pairings' | 'configured-conversations' | 'retained-authorized-observations';
    incomplete: boolean;
    currentPlatformMembership: false;
    scannedSourceEvents?: number;
    scanLimit?: number;
    scanTruncated?: boolean;
  };
}
const cursorSchema = z
  .object({ scope: z.string(), after: z.string(), expiresAt: z.number() })
  .strict();
const OBSERVATION_SCAN_LIMIT = 1000;

function people(db: DatabaseSync, botSlug: string) {
  const roles = new Map(externalUserRoles(db, botSlug).map((role) => [role.id, role]));
  const rows = db
    .prepare(`SELECT p.body FROM messaging_pairings p
    JOIN messaging_bindings b ON b.id = p.binding_id
    WHERE p.bot_slug = ? AND b.bot_slug = ? AND b.revoked_at IS NULL
      AND p.purpose = 'conversation' AND p.status = 'approved'
    ORDER BY p.binding_id, p.actor_id LIMIT 100`)
    .all(botSlug, botSlug) as { body: string }[];
  return rows.flatMap((row) => {
    const pairing = JSON.parse(row.body) as PairingRequest;
    const identity = readMessagingIdentity(db, pairing.bindingId);
    const role = roles.get(pairing.roleId ?? '');
    if (!identity.enabled || !role || identity.platform !== 'feishu') return [];
    return [
      {
        key: `${identity.id}/${pairing.actorId}`,
        bindingId: identity.id,
        platform: identity.platform,
        accountName: identity.name,
        namespace: 'lark-app-open-id',
        actorId: pairing.actorId,
        ...(pairing.actorName ? { actorName: pairing.actorName } : {}),
        pairingId: pairing.id,
        pairingRevision: pairing.revision,
        role,
      },
    ];
  });
}

const CONVERSATIONS = `WITH candidates AS (
  SELECT g.binding_id, coalesce(json_extract(g.body, '$.receiveScope.kind'), 'target') AS kind,
    coalesce(json_extract(g.body, '$.receiveScope.conversationId'), json_extract(g.body, '$.targetRef')) AS conversation_id,
    json_extract(g.body, '$.targetName') AS name,
    CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked'
      WHEN json_extract(g.body, '$.suspendedReason') IS NOT NULL THEN 'rebind-required'
      WHEN json_extract(g.body, '$.muted') = 1 THEN 'muted' ELSE 'allowed' END AS state,
    g.id AS grant_id, g.revision, g.created_at AS at, 1 AS priority FROM messaging_grants g WHERE g.bot_slug = ?
  UNION ALL
  SELECT h.binding_id, h.conversation_kind, h.conversation_id, json_extract(h.body, '$.name'),
    'held', NULL, json_extract(h.body, '$.revision'), json_extract(h.body, '$.lastSeenAt'), 2 FROM messaging_held_conversations h
  UNION ALL
  SELECT b.id, c.conversation_kind, c.conversation_id, json_extract(c.body, '$.name'),
    'blocked', NULL, c.revision, json_extract(c.body, '$.blockedAt'), 3 FROM messaging_conversation_blocks c
    JOIN messaging_bindings b ON b.bot_slug = c.bot_slug AND b.fingerprint = c.fingerprint WHERE c.bot_slug = ?
  UNION ALL
  SELECT p.binding_id, coalesce(json_extract(p.body, '$.conversationKind'), 'dm'),
    json_extract(p.body, '$.conversationId'), json_extract(p.body, '$.conversationId'),
    'pairing-observed', NULL, 0, json_extract(p.body, '$.createdAt'), 0 FROM messaging_pairings p WHERE p.bot_slug = ?
), scoped AS (
  SELECT c.*, b.platform, b.display_name AS account_name,
    c.binding_id || '/' || c.kind || '/' || c.conversation_id AS key,
    row_number() OVER (PARTITION BY c.binding_id, c.kind, c.conversation_id ORDER BY c.priority DESC, c.at DESC) AS rank
  FROM candidates c JOIN messaging_bindings b ON b.id = c.binding_id
  WHERE b.bot_slug = ? AND b.revoked_at IS NULL AND c.conversation_id IS NOT NULL
)
SELECT * FROM scoped WHERE rank = 1 AND key > ? ORDER BY key LIMIT ?`;

export function createMessagingDirectory(
  database: OperationalDatabaseModulePort,
  readSource: (botSlug: string, id: string) => ExternalSource,
) {
  return (botSlug: string, raw: MessagingDirectoryQuery): MessagingDirectoryPage => {
    const query = querySchema.parse(raw);
    if (query.kind === 'observed-people' && !query.sourceEventId)
      throw new MessagingError('directory-source-required');
    if (query.kind !== 'observed-people' && query.sourceEventId !== undefined)
      throw new MessagingError('directory-query-invalid');
    const anchor = query.sourceEventId ? readSource(botSlug, query.sourceEventId) : undefined;
    return database.read((db) => {
      const now = Date.now();
      const reference = anchor ? trustedSenderReference(db, botSlug, anchor.event) : undefined;
      if (anchor && !reference) throw new MessagingError('directory-scope-unavailable');
      const scope = createHash('sha256')
        .update(
          JSON.stringify({
            botSlug,
            kind: query.kind,
            bindingId: reference?.bindingId,
            conversation: anchor?.event.conversation,
          }),
        )
        .digest('hex');
      let after = '';
      if (query.cursor !== undefined) {
        try {
          const cursor = cursorSchema.parse(
            JSON.parse(Buffer.from(query.cursor, 'base64url').toString()),
          );
          if (cursor.scope !== scope || cursor.expiresAt <= now) throw new Error('stale scope');
          after = cursor.after;
        } catch {
          throw new MessagingError('directory-cursor-invalid');
        }
      }
      const limit = query.limit ?? 20;
      let rows: (Record<string, unknown> & { key: string })[];
      let coverage: MessagingDirectoryPage['coverage'];
      if (query.kind === 'conversations') {
        const conversations = db
          .prepare(CONVERSATIONS)
          .all(botSlug, botSlug, botSlug, botSlug, after, limit + 1) as unknown as {
          key: string;
          binding_id: string;
          platform: string;
          account_name: string;
          kind: string;
          conversation_id: string;
          name: string;
          state: string;
          revision: number;
          grant_id: string | null;
        }[];
        rows = conversations.map((row) => ({
          key: row.key,
          bindingId: row.binding_id,
          platform: row.platform,
          accountName: row.account_name,
          conversation: { kind: row.kind, id: row.conversation_id, name: row.name },
          state: row.state,
          revision: row.revision,
          identityEnabled: readMessagingIdentity(db, row.binding_id).enabled,
          ...(row.grant_id ? { grantId: row.grant_id } : {}),
        }));
        coverage = {
          kind: 'configured-conversations',
          incomplete: true,
          currentPlatformMembership: false,
        };
      } else {
        const paired = people(db, botSlug);
        rows = paired;
        coverage = {
          kind: 'current-pairings',
          incomplete: false,
          currentPlatformMembership: false,
        };
        if (anchor && reference) {
          const binding = readMessagingIdentity(db, reference.bindingId);
          const candidates = db
            .prepare(`SELECT source_event_id FROM source_events
            WHERE source_kind = 'bridge-message'
              AND json_extract(payload_json, '$.external.event.botId') = ?
              AND json_extract(payload_json, '$.external.event.fingerprint') = ?
              AND json_extract(payload_json, '$.external.event.conversation.kind') = ?
              AND json_extract(payload_json, '$.external.event.conversation.id') = ?
              AND julianday(json_extract(payload_json, '$.external.event.at')) >= julianday(?)
            ORDER BY rowid DESC LIMIT ?`)
            .all(
              reference.accountRef,
              reference.fingerprint,
              anchor.event.conversation.kind,
              anchor.event.conversation.id,
              binding.createdAt,
              OBSERVATION_SCAN_LIMIT + 1,
            ) as { source_event_id: string }[];
          const observations = new Map<
            string,
            { firstObservedAt: string; lastObservedAt: string }
          >();
          const pairedActors = new Set(
            paired.filter((row) => row.bindingId === binding.id).map((row) => row.actorId),
          );
          for (const candidate of candidates.slice(0, OBSERVATION_SCAN_LIMIT)) {
            try {
              const source = readSource(botSlug, candidate.source_event_id);
              if (trustedSenderReference(db, botSlug, source.event)?.bindingId !== binding.id)
                continue;
              if (!pairedActors.has(source.event.actor.id) || source.event.actor.kind !== 'user')
                continue;
              const grant = db
                .prepare('SELECT binding_id, bot_slug FROM messaging_grants WHERE id = ?')
                .get(source.grantId) as { binding_id: string; bot_slug: string } | undefined;
              if (grant?.bot_slug === botSlug && grant.binding_id !== binding.id) continue;
              const observation = observations.get(source.event.actor.id);
              const at = source.event.at;
              observations.set(source.event.actor.id, {
                firstObservedAt:
                  !observation || at < observation.firstObservedAt
                    ? at
                    : observation.firstObservedAt,
                lastObservedAt:
                  !observation || at > observation.lastObservedAt ? at : observation.lastObservedAt,
              });
            } catch (error) {
              if (!(error instanceof MessagingError)) throw error;
            }
          }
          rows = paired.flatMap((row) => {
            const observed =
              row.bindingId === binding.id ? observations.get(row.actorId) : undefined;
            return observed
              ? [{ ...row, ...observed, conversation: anchor.event.conversation }]
              : [];
          });
          coverage = {
            kind: 'retained-authorized-observations',
            incomplete: true,
            currentPlatformMembership: false,
            scannedSourceEvents: Math.min(candidates.length, OBSERVATION_SCAN_LIMIT),
            scanLimit: OBSERVATION_SCAN_LIMIT,
            scanTruncated: candidates.length > OBSERVATION_SCAN_LIMIT,
          };
        }
        rows = rows
          .filter((row) => row.key > after)
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
          .slice(0, limit + 1);
      }
      const page = rows.slice(0, limit);
      return {
        kind: query.kind,
        queriedAt: new Date(now).toISOString(),
        policyRevision: readSenderPolicy(db, botSlug).revision,
        rows: page.map(({ key: _key, ...row }) => row),
        coverage,
        ...(rows.length > limit
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({ scope, after: page.at(-1)!.key, expiresAt: now + 10 * 60 * 1000 }),
              ).toString('base64url'),
            }
          : {}),
      };
    });
  };
}
