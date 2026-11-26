import type { DatabaseSync } from 'node:sqlite';
import { readMessagingIdentity } from '../identity.js';
import { MessagingError } from '../provider.js';
import { platformPeople } from './people.js';

export interface SenderBlock {
  botSlug: string;
  bindingId: string;
  fingerprint: string;
  actorId: string;
  actorName?: string;
  revision: number;
  blockedAt: string;
  blockedBy: 'authenticated-web' | 'paired-reviewer';
  reviewerActorId?: string;
  unblockedAt?: string;
}

function readStoredBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  actorId: string,
): SenderBlock | undefined {
  const row = db
    .prepare(
      'SELECT body FROM messaging_sender_blocks WHERE bot_slug = ? AND fingerprint = ? AND actor_id = ?',
    )
    .get(botSlug, fingerprint, actorId) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as SenderBlock) : undefined;
}

export function readSenderBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  actorId: string,
): SenderBlock | undefined {
  const block = readStoredBlock(db, botSlug, fingerprint, actorId);
  return block && !block.unblockedAt ? block : undefined;
}

export function senderBlocked(
  db: DatabaseSync,
  botSlug: string,
  event: { fingerprint: string; actor: { kind: string; id: string } },
): boolean {
  return (
    event.actor.kind === 'user' &&
    readSenderBlock(db, botSlug, event.fingerprint, event.actor.id) !== undefined
  );
}

export function listSenderBlocks(db: DatabaseSync, botSlug: string): SenderBlock[] {
  return (
    db
      .prepare(
        "SELECT body FROM messaging_sender_blocks WHERE bot_slug = ? AND json_extract(body, '$.unblockedAt') IS NULL ORDER BY json_extract(body, '$.blockedAt') DESC",
      )
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as SenderBlock);
}

export function blockSender(
  db: DatabaseSync,
  botSlug: string,
  input: { bindingId: string; actorId: string; actorName?: string | undefined },
  reviewerActorId?: string,
): SenderBlock {
  const binding = readMessagingIdentity(db, input.bindingId);
  if (
    binding.botSlug !== botSlug ||
    !platformPeople(binding.platform) ||
    !binding.enabled ||
    binding.revokedAt
  )
    throw new MessagingError('sender-block-scope');
  const stored = readStoredBlock(db, botSlug, binding.fingerprint, input.actorId);
  if (stored && !stored.unblockedAt) return stored;
  const block: SenderBlock = {
    botSlug,
    bindingId: binding.id,
    fingerprint: binding.fingerprint,
    actorId: input.actorId,
    ...(input.actorName ? { actorName: input.actorName } : {}),
    revision: (stored?.revision ?? 0) + 1,
    blockedAt: new Date().toISOString(),
    blockedBy: reviewerActorId ? 'paired-reviewer' : 'authenticated-web',
    ...(reviewerActorId ? { reviewerActorId } : {}),
  };
  db.prepare(
    'INSERT OR REPLACE INTO messaging_sender_blocks (bot_slug, fingerprint, actor_id, revision, body) VALUES (?, ?, ?, ?, ?)',
  ).run(botSlug, block.fingerprint, block.actorId, block.revision, JSON.stringify(block));
  return block;
}

export function unblockSender(
  db: DatabaseSync,
  botSlug: string,
  input: { bindingId: string; actorId: string; expectedRevision?: number | undefined },
): boolean {
  const binding = readMessagingIdentity(db, input.bindingId);
  if (binding.botSlug !== botSlug) throw new MessagingError('sender-block-scope');
  const current = readSenderBlock(db, botSlug, binding.fingerprint, input.actorId);
  if (!current) return false;
  if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision)
    throw new MessagingError('sender-block-stale');
  const unblocked: SenderBlock = {
    ...current,
    revision: current.revision + 1,
    unblockedAt: new Date().toISOString(),
  };
  db.prepare(
    'UPDATE messaging_sender_blocks SET revision = ?, body = ? WHERE bot_slug = ? AND fingerprint = ? AND actor_id = ?',
  ).run(unblocked.revision, JSON.stringify(unblocked), botSlug, binding.fingerprint, input.actorId);
  return true;
}
