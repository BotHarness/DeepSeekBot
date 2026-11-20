import { readMessagingIdentity } from './identity.js';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError, type MessagingReceipt } from './provider.js';
import type {
  OutboxIntent,
  MessagingGrant,
  OutboxState,
  OutboundMessaging,
} from './outbound-contract.js';
import type { StatementSync } from 'node:sqlite';

export type StoredIntent = OutboxIntent & { requestId: string; payloadHash: string };

export function createOutboxStore(context: {
  database: OperationalDatabaseModulePort;
  grant: (slug: string, id: string) => MessagingGrant;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  now: () => string;
  mirrorAccepted: (accepted: StoredIntent) => Promise<void>;
  prepareOutboxStateUpdate: (db: DatabaseSync) => StatementSync;
}) {
  const { database, transaction, now, prepareOutboxStateUpdate } = context;

  const revokePendingIntents = (db: DatabaseSync, grantId: string, at: string) => {
    const pending = db
      .prepare("SELECT id FROM messaging_outbox WHERE grant_id = ? AND state = 'pending'")
      .all(grantId) as unknown as { id: string }[];
    for (const row of pending) {
      const intent = readIntent(row.id);
      prepareOutboxStateUpdate(db).run(
        'grant-revoked',
        JSON.stringify({
          ...intent,
          state: 'grant-revoked',
          reason: 'grant-revoked',
          settledAt: at,
        }),
        row.id,
      );
    }
  };

  const readIntent = (id: string): StoredIntent => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('intent-unavailable');
    return JSON.parse(row.body) as StoredIntent;
  };

  const postRequest = (
    botSlug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): StoredIntent | undefined => {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId) || !text.trim() || text.length > 4000)
      throw new MessagingError('invalid-input');
    const row = database.read((db) =>
      db.prepare('SELECT id FROM messaging_outbox WHERE request_id = ?').get(requestId),
    ) as { id: string } | undefined;
    if (!row) return undefined;
    const value = readIntent(row.id);
    if (
      value.botSlug !== botSlug ||
      value.report?.conversationId !== conversationId ||
      value.payloadHash !==
        createHash('sha256')
          .update(JSON.stringify(['report', text]))
          .digest('hex') ||
      context.grant(botSlug, value.grantId).bindingId !== bindingId
    )
      throw new MessagingError('request-conflict');
    return value;
  };

  const settle = (
    id: string,
    state: OutboxState,
    reason?: string,
    receipt?: MessagingReceipt,
  ): OutboxIntent => {
    const value = transaction(
      (db) => {
        const existing = readIntent(id);
        if (existing.state !== 'pending' && existing.state !== 'in-flight') return existing;
        const value = {
          ...existing,
          state,
          settledAt: now(),
          ...(reason === undefined ? {} : { reason }),
          ...(receipt === undefined ? {} : { receipt }),
        };
        prepareOutboxStateUpdate(db).run(state, JSON.stringify(value), id);
        db.prepare(
          'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
        ).run(state, value.settledAt, reason ?? null, id);
        return value;
      },
      ['outbox'],
    );
    if (value.state === 'provider-accepted') void context.mirrorAccepted(value);
    return value;
  };

  const history = (botSlug: string) => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT body FROM messaging_outbox WHERE bot_slug = ? ORDER BY created_at DESC, id DESC LIMIT 30',
        )
        .all(botSlug),
    ) as unknown as { body: string }[];
    return rows.map((row) => JSON.parse(row.body) as OutboxIntent);
  };

  const checkPostLimit = (db: DatabaseSync, bindingId: string, reserved = false) => {
    const identity = readMessagingIdentity(db, bindingId);
    if (identity.postLimit === null) return;
    const limit = identity.postLimit ?? 60;
    const cutoff = new Date(new Date(now()).getTime() - 3600000).toISOString();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS count FROM messaging_outbox_attempts a JOIN messaging_outbox o ON o.id = a.intent_id JOIN messaging_grants g ON g.id = o.grant_id WHERE g.binding_id = ? AND a.started_at > ? AND json_type(o.body, '$.sourceEventId') IS NULL",
      )
      .get(bindingId, cutoff) as { count: number };
    if (reserved ? row.count > limit : row.count >= limit)
      throw new MessagingError('post-rate-limited');
  };

  const methods: Pick<OutboundMessaging, 'inspectIntent'> = {
    inspectIntent(botSlug, intentId) {
      const value = readIntent(intentId);
      if (value.botSlug !== botSlug) throw new MessagingError('intent-unavailable');
      const { requestId: _request, payloadHash: _hash, ...intent } = value;
      return intent;
    },
  };

  return {
    revokePendingIntents,
    readIntent,
    postRequest,
    settle,
    history,
    checkPostLimit,
    methods,
  };
}
