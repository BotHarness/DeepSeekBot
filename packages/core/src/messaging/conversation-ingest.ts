import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { ChannelRecord } from '../channels/channel.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { ConversationRef } from './conversations.js';
import { MessagingError } from './provider.js';
import { sourceSenderAllowed } from './sender-access.js';

export interface ConversationIngestWake {
  mode: 'mentions' | 'digest' | 'all';
  count: number;
  intervalSeconds: number;
}

export interface ConversationIngest {
  id: string;
  channelId: string;
  providerId: string;
  accountRef: string;
  fingerprint: string;
  platform: string;
  accountName: string;
  conversation: ConversationRef & { name: string };
  revision: number;
  enabled: boolean;
  intakeAfter: string;
  wake: ConversationIngestWake;
  createdAt: string;
  lastMessageAt?: string;
}

export interface ConversationIngestRow extends ConversationIngest {
  botSlug?: string;
  state: 'waiting' | 'receiving' | 'paused' | 'unavailable';
}

export interface ConversationIngestCandidate {
  bindingId: string;
  botSlug: string;
  platform: string;
  accountName: string;
  conversations: (ConversationRef & { name: string })[];
}

export interface ConversationIngestSnapshot {
  channelId: string;
  ingests: ConversationIngestRow[];
  candidates: ConversationIngestCandidate[];
}

export const DEFAULT_INGEST_WAKE: ConversationIngestWake = {
  mode: 'mentions',
  count: 10,
  intervalSeconds: 300,
};

const wake = z
  .object({
    mode: z.enum(['mentions', 'digest', 'all']),
    count: z.number().int().min(1).max(100),
    intervalSeconds: z
      .number()
      .int()
      .min(10)
      .max(24 * 60 * 60),
  })
  .strict();

export const conversationIngestInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add'),
      bindingId: z.string().min(1).max(128),
      conversation: z.object({ kind: z.literal('group'), id: z.string().min(1).max(256) }).strict(),
      wake: wake.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('update'),
      ingestId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      enabled: z.boolean().optional(),
      wake: wake.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('delete'),
      ingestId: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);
export type ConversationIngestInput = z.infer<typeof conversationIngestInput>;

export function channelIngests(db: DatabaseSync, channelId: string): ConversationIngest[] {
  return (
    db
      .prepare(
        'SELECT body FROM messaging_conversation_ingests WHERE channel_id = ? ORDER BY rowid',
      )
      .all(channelId) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as ConversationIngest);
}

export function readIngest(db: DatabaseSync, id: string): ConversationIngest {
  const row = db.prepare('SELECT body FROM messaging_conversation_ingests WHERE id = ?').get(id) as
    | { body: string }
    | undefined;
  if (!row) throw new MessagingError('ingest-unavailable');
  return JSON.parse(row.body) as ConversationIngest;
}

export function matchingIngests(
  db: DatabaseSync,
  providerId: string,
  fingerprint: string,
  conversation: ConversationRef,
): ConversationIngest[] {
  return (
    db
      .prepare(
        `SELECT body FROM messaging_conversation_ingests
          WHERE provider_id = ? AND fingerprint = ? AND conversation_kind = ? AND conversation_id = ?
          ORDER BY rowid`,
      )
      .all(providerId, fingerprint, conversation.kind, conversation.id) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as ConversationIngest);
}

export function writeIngest(db: DatabaseSync, value: ConversationIngest): void {
  db.prepare(
    `INSERT INTO messaging_conversation_ingests
       (id, channel_id, provider_id, account_ref, fingerprint, conversation_kind, conversation_id, revision, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, body = excluded.body`,
  ).run(
    value.id,
    value.channelId,
    value.providerId,
    value.accountRef,
    value.fingerprint,
    value.conversation.kind,
    value.conversation.id,
    value.revision,
    JSON.stringify(value),
  );
}

export function deleteIngest(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM messaging_conversation_ingests WHERE id = ?').run(id);
}

export function admitIngestMembers(
  db: DatabaseSync,
  sourceEventId: string,
  channel: ChannelRecord,
  ingest: ConversationIngest,
  sourcePolicy: BotSourcePolicyStore,
  isBotActive: (botSlug: string) => boolean,
): string[] {
  const admitted: string[] = [];
  for (const botSlug of channel.members) {
    if (!isBotActive(botSlug) || !sourceSenderAllowed(db, botSlug, sourceEventId)) continue;
    const rule = sourcePolicy.resolveIn(db, botSlug, 'group-ordinary');
    const custom = channel.wakePolicies?.[botSlug];
    const policy = custom ?? { ...ingest.wake, revision: ingest.revision };
    const mode = policy.mode;
    const result = db
      .prepare(`INSERT OR IGNORE INTO inbox_admissions
      (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
       wake_policy_revision, wake_mode, wake_count, wake_interval_ms)
      VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?)`)
      .run(
        sourceEventId,
        botSlug,
        rule.revision,
        rule.wake,
        policy.revision,
        mode,
        mode === 'all' ? 1 : mode === 'digest' ? policy.count : null,
        mode === 'all' ? 0 : mode === 'digest' ? policy.intervalSeconds * 1000 : null,
      );
    if (result.changes > 0) admitted.push(botSlug);
  }
  return admitted;
}
