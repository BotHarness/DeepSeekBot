import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { OperationalDatabaseError } from '../database/owner.js';
import { assertMessagingIdentity, readMessagingIdentity } from './identity.js';
import { MessagingError, type MessagingInboundEvent } from './provider.js';
import { externalUserRoles } from './sender-access.js';

export const pairingCapabilities = ['approve', 'reject', 'answer', 'save-rules'] as const;
export type PairingCapability = (typeof pairingCapabilities)[number];
export const pairingReviewInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('approve'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      capabilities: z.array(z.enum(pairingCapabilities)).min(1).max(4).optional(),
      roleId: z.string().uuid().optional(),
      expectedRoleRevision: z.number().int().positive().optional(),
    })
    .strict()
    .refine((value) =>
      value.roleId
        ? value.capabilities === undefined && value.expectedRoleRevision !== undefined
        : value.capabilities !== undefined && value.expectedRoleRevision === undefined,
    ),
  z
    .object({
      kind: z.enum(['reject', 'revoke']),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);
export type PairingReviewInput = z.infer<typeof pairingReviewInput>;
export interface PairingRequest {
  id: string;
  reference: string;
  botSlug: string;
  bindingId: string;
  accountName: string;
  actorId: string;
  actorName?: string;
  conversationId: string;
  conversationKind?: 'dm' | 'group';
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired' | 'unavailable';
  capabilities: PairingCapability[];
  createdAt: string;
  expiresAt: string;
  reviewedAt?: string;
  revision: number;
  attempts: number;
  messageIds?: string[];
  reviewedBy?: 'authenticated-web';
  purpose?: 'management' | 'conversation';
  roleId?: string;
  roleRevision?: number;
  reply?: MessagingInboundEvent['reply'];
  notifications?: {
    key: string;
    attempts: number;
    outcome: 'started' | 'accepted' | 'unconfirmed';
  }[];
}
export interface BotPairing {
  request(
    bindingId: string,
    event: MessagingInboundEvent,
    purpose?: 'management' | 'conversation',
  ): PairingRequest;
  list(botSlug: string): PairingRequest[];
  review(botSlug: string, input: PairingReviewInput): PairingRequest;
  notice(id: string, key: string, outcome?: 'accepted' | 'unconfirmed'): boolean;
  assert(
    botSlug: string,
    bindingId: string,
    actorId: string,
    capability: PairingCapability,
  ): PairingRequest;
}
export const pairingDefaults = Object.freeze({
  expiryMs: 10 * 60 * 1000,
  maxAttempts: 5,
  maxPendingPerBot: 25,
  maxPending: 200,
  maxApprovedPerBot: 100,
});

export function createBotPairing(
  database: OperationalDatabaseModulePort,
  isBotActive: (slug: string) => boolean,
  now = () => new Date(),
): BotPairing {
  const transaction = <T>(
    operation: Parameters<OperationalDatabaseModulePort['transaction']>[0],
  ): T => {
    try {
      return database.transaction(operation, ['pairing']) as T;
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const read = (row: { body: string }): PairingRequest => JSON.parse(row.body) as PairingRequest;
  const current = (value: PairingRequest): PairingRequest => {
    if (value.status !== 'pending' && value.status !== 'approved') return value;
    if (value.status === 'pending' && Date.parse(value.expiresAt) <= now().getTime())
      return { ...value, status: 'expired' };
    try {
      const binding = database.read((db) => readMessagingIdentity(db, value.bindingId));
      if (binding.revokedAt || binding.botSlug !== value.botSlug)
        return { ...value, status: 'revoked' };
      if (!binding.enabled || !isBotActive(value.botSlug))
        return { ...value, status: 'unavailable' };
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      if (value.status === 'pending' || value.status === 'approved')
        return { ...value, status: 'revoked' };
    }
    return value;
  };
  return {
    request(bindingId, event, purpose = 'management') {
      return transaction<PairingRequest>((db) => {
        const binding = assertMessagingIdentity(db, bindingId);
        if (
          !isBotActive(binding.botSlug) ||
          binding.platform !== 'feishu' ||
          event.channel !== 'feishu' ||
          event.botId !== binding.accountRef ||
          event.fingerprint !== binding.fingerprint ||
          (purpose === 'management' && event.conversation.kind !== 'dm') ||
          (purpose === 'conversation' &&
            event.conversation.kind === 'group' &&
            !event.mentionedAccount) ||
          event.reply.actorId !== event.actor.id ||
          event.reply.conversationId !== event.conversation.id ||
          event.reply.messageId !== event.messageId ||
          event.actor.kind !== 'user' ||
          !/^ou_[A-Za-z0-9]+$/.test(event.actor.id) ||
          !/^oc_[A-Za-z0-9]+$/.test(event.conversation.id) ||
          (purpose === 'management' && (event.text.trim() !== '/pair' || event.attachments?.length))
        )
          throw new MessagingError('untrusted-pairing');
        const at = now().toISOString();
        const existing = db
          .prepare(
            "SELECT body FROM messaging_pairings WHERE binding_id = ? AND actor_id = ? AND purpose = ? AND status IN ('pending', 'approved')",
          )
          .get(bindingId, event.actor.id, purpose) as { body: string } | undefined;
        if (existing) {
          const value = read(existing);
          if (purpose === 'management' && value.conversationId !== event.conversation.id)
            throw new MessagingError('pairing-conversation-changed');
          if (value.status === 'approved' || value.messageIds?.includes(event.messageId))
            return current(value);
          if (Date.parse(value.expiresAt) > now().getTime()) {
            if (purpose === 'management' && value.conversationId !== event.conversation.id)
              throw new MessagingError('pairing-conversation-changed');
            if (value.attempts >= pairingDefaults.maxAttempts)
              throw new MessagingError('pairing-rate-limited');
            const next = {
              ...value,
              attempts: value.attempts + 1,
              messageIds: [...(value.messageIds ?? []), event.messageId],
            };
            db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ?').run(
              JSON.stringify(next),
              value.id,
            );
            return next;
          }
          db.prepare(
            "UPDATE messaging_pairings SET status = 'expired', body = json_set(body, '$.status', 'expired') WHERE id = ?",
          ).run(value.id);
        }
        db.prepare(
          "UPDATE messaging_pairings SET status = 'expired', body = json_set(body, '$.status', 'expired') WHERE status = 'pending' AND json_extract(body, '$.expiresAt') <= ?",
        ).run(at);
        const total = db
          .prepare("SELECT count(*) AS n FROM messaging_pairings WHERE status = 'pending'")
          .get() as { n: number };
        const local = db
          .prepare(
            "SELECT count(*) AS n FROM messaging_pairings WHERE status = 'pending' AND bot_slug = ?",
          )
          .get(binding.botSlug) as { n: number };
        if (total.n >= pairingDefaults.maxPending || local.n >= pairingDefaults.maxPendingPerBot)
          throw new MessagingError('pairing-capacity');
        const value: PairingRequest = {
          id: randomUUID(),
          reference: randomBytes(5).toString('hex').toUpperCase(),
          botSlug: binding.botSlug,
          bindingId,
          accountName: binding.name,
          actorId: event.actor.id,
          ...(event.actor.name ? { actorName: event.actor.name } : {}),
          conversationId: event.conversation.id,
          status: 'pending',
          capabilities: [],
          createdAt: at,
          expiresAt: new Date(now().getTime() + pairingDefaults.expiryMs).toISOString(),
          revision: 1,
          attempts: 1,
          messageIds: [event.messageId],
          ...(purpose === 'conversation'
            ? { purpose, reply: event.reply, conversationKind: event.conversation.kind }
            : {}),
        };
        db.prepare(
          'INSERT INTO messaging_pairings (id, bot_slug, binding_id, actor_id, status, body, purpose) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          value.id,
          value.botSlug,
          bindingId,
          value.actorId,
          value.status,
          JSON.stringify(value),
          purpose,
        );
        return value;
      });
    },
    list(botSlug) {
      return database
        .read((db) =>
          (
            db
              .prepare(
                "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND status IN ('pending', 'approved') UNION ALL SELECT body FROM (SELECT body FROM messaging_pairings WHERE bot_slug = ? AND status NOT IN ('pending', 'approved') ORDER BY rowid DESC LIMIT 20)",
              )
              .all(botSlug, botSlug) as { body: string }[]
          ).map(read),
        )
        .map(current);
    },
    review(botSlug, raw) {
      const input = pairingReviewInput.parse(raw);
      return transaction<PairingRequest>((db) => {
        const row = db
          .prepare('SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ?')
          .get(input.id, botSlug) as { body: string } | undefined;
        if (!row) throw new MessagingError('pairing-unavailable');
        const stored = read(row);
        const value = current(stored);
        if (
          value.revision !== input.expectedRevision ||
          (input.kind === 'revoke' ? stored.status !== 'approved' : value.status !== 'pending')
        )
          throw new MessagingError('pairing-stale');
        if (input.kind === 'approve') {
          if (value.purpose === 'conversation') {
            const role = externalUserRoles(db, botSlug).find((role) => role.id === input.roleId);
            if (
              !role ||
              role.revision !== input.expectedRoleRevision ||
              input.capabilities !== undefined
            )
              throw new MessagingError('role-stale');
          } else if (!input.capabilities || input.roleId) throw new MessagingError('pairing-stale');
          const approved = db
            .prepare(
              "SELECT count(*) AS n FROM messaging_pairings AS p JOIN messaging_bindings AS b ON b.id = p.binding_id WHERE p.bot_slug = ? AND p.status = 'approved' AND b.revoked_at IS NULL",
            )
            .get(botSlug) as { n: number };
          if (approved.n >= pairingDefaults.maxApprovedPerBot)
            throw new MessagingError('pairing-capacity');
        }
        const next: PairingRequest = {
          ...value,
          status:
            input.kind === 'approve'
              ? 'approved'
              : input.kind === 'revoke'
                ? 'revoked'
                : 'rejected',
          capabilities:
            input.kind === 'approve' && input.capabilities ? [...new Set(input.capabilities)] : [],
          ...(input.kind === 'approve' && input.roleId
            ? { roleId: input.roleId, roleRevision: input.expectedRoleRevision! }
            : {}),
          revision: value.revision + 1,
          reviewedAt: now().toISOString(),
          reviewedBy: 'authenticated-web',
        };
        db.prepare('UPDATE messaging_pairings SET status = ?, body = ? WHERE id = ?').run(
          next.status,
          JSON.stringify(next),
          next.id,
        );
        if (input.kind === 'revoke' && value.purpose === 'conversation') {
          const binding = readMessagingIdentity(db, value.bindingId);
          db.prepare(`UPDATE inbox_admissions SET attempt_state = 'handled', ignored_at = ?, handled_at = ?, wake_count = NULL, wake_interval_ms = NULL
            WHERE bot_slug = ? AND attempt_state IN ('pending', 'retryable') AND source_event_id IN
            (SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'
              AND json_extract(payload_json, '$.external.event.botId') = ?
              AND json_extract(payload_json, '$.external.event.fingerprint') = ?
              AND json_extract(payload_json, '$.external.event.actor.id') = ?)`).run(
            next.reviewedAt,
            next.reviewedAt,
            botSlug,
            binding.accountRef,
            binding.fingerprint,
            value.actorId,
          );
        }
        return next;
      });
    },
    notice(id, key, outcome) {
      return transaction<boolean>((db) => {
        const row = db.prepare('SELECT body FROM messaging_pairings WHERE id = ?').get(id) as
          | { body: string }
          | undefined;
        if (!row) return false;
        const value = read(row);
        const notifications = value.notifications ?? [];
        const previous = notifications.find((item) => item.key === key);
        if (!outcome && previous) return false;
        if (notifications.length >= pairingDefaults.maxAttempts + 1 && !previous) return false;
        if (outcome && !previous) return false;
        const next = {
          ...value,
          notifications: previous
            ? notifications.map((item) =>
                item.key === key ? { ...item, outcome: outcome! } : item,
              )
            : [...notifications, { key, attempts: 1, outcome: 'started' as const }],
        };
        db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ?').run(
          JSON.stringify(next),
          id,
        );
        return true;
      });
    },
    assert(botSlug, bindingId, actorId, capability) {
      const row = database.read((db) =>
        db
          .prepare(
            "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'management' AND status = 'approved'",
          )
          .get(botSlug, bindingId, actorId),
      ) as { body: string } | undefined;
      if (!row) throw new MessagingError('pairing-unauthorized');
      const value = current(read(row));
      if (value.status !== 'approved' || !value.capabilities.includes(capability))
        throw new MessagingError('pairing-unauthorized');
      return value;
    },
  };
}
