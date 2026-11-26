import type { DatabaseSync } from 'node:sqlite';
import type { ConversationRef } from '../conversations.js';
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
  blockedBy: SourceBlocker;
  reviewerActorId?: string;
  unblockedAt?: string;
  bindingIds?: string[];
}

export type SourceBlocker = 'authenticated-web' | 'paired-reviewer' | 'bot';

export interface ConversationSourceBlock {
  botSlug: string;
  bindingId: string;
  fingerprint: string;
  conversation: ConversationRef;
  name?: string;
  revision: number;
  blockedAt: string;
  blockedBy: Exclude<SourceBlocker, 'paired-reviewer'>;
  unblockedAt?: string;
  bindingIds?: string[];
}

export function ownerActor(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  actorId: string,
): boolean {
  const bindings = senderBlockBindingIds(db, botSlug, fingerprint);
  if (!bindings.length) return false;
  const marks = bindings.map(() => '?').join(', ');
  if (
    db
      .prepare(
        `SELECT 1 FROM messaging_pairings WHERE bot_slug = ? AND actor_id = ? AND purpose = 'management' AND status = 'approved' AND binding_id IN (${marks}) LIMIT 1`,
      )
      .get(botSlug, actorId, ...bindings)
  )
    return true;
  const route = db
    .prepare('SELECT body FROM messaging_approval_routes WHERE bot_slug = ?')
    .get(botSlug) as { body: string | null } | undefined;
  const pairingId = route?.body
    ? (JSON.parse(route.body) as { pairingId?: string }).pairingId
    : undefined;
  return (
    !!pairingId &&
    !!db
      .prepare(
        `SELECT 1 FROM messaging_pairings WHERE id = ? AND bot_slug = ? AND actor_id = ? AND status = 'approved' AND binding_id IN (${marks})`,
      )
      .get(pairingId, botSlug, actorId, ...bindings)
  );
}

export function senderBlockBindingIds(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
): string[] {
  return (
    db
      .prepare('SELECT id FROM messaging_bindings WHERE bot_slug = ? AND fingerprint = ?')
      .all(botSlug, fingerprint) as { id: string }[]
  ).map((row) => row.id);
}

function usableBinding(db: DatabaseSync, botSlug: string, bindingId: string) {
  const binding = readMessagingIdentity(db, bindingId);
  if (binding.botSlug !== botSlug) throw new MessagingError('sender-block-scope');
  const current =
    binding.revokedAt || !binding.enabled
      ? (
          db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND fingerprint = ? AND revoked_at IS NULL',
            )
            .all(botSlug, binding.fingerprint) as { id: string }[]
        )
          .map((row) => readMessagingIdentity(db, row.id))
          .find((candidate) => candidate.enabled)
      : binding;
  if (!current || !platformPeople(current.platform)) throw new MessagingError('sender-block-scope');
  return current;
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
    readSenderBlock(db, botSlug, event.fingerprint, event.actor.id) !== undefined &&
    !ownerActor(db, botSlug, event.fingerprint, event.actor.id)
  );
}

export function sourceBlocked(
  db: DatabaseSync,
  botSlug: string,
  event: {
    fingerprint: string;
    actor: { kind: string; id: string };
    conversation: ConversationRef;
  },
): boolean {
  if (senderBlocked(db, botSlug, event)) return true;
  return (
    readConversationSourceBlock(db, botSlug, event.fingerprint, event.conversation) !== undefined &&
    !(event.actor.kind === 'user' && ownerActor(db, botSlug, event.fingerprint, event.actor.id))
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
  by?: 'bot',
): SenderBlock {
  const binding = usableBinding(db, botSlug, input.bindingId);
  if (ownerActor(db, botSlug, binding.fingerprint, input.actorId))
    throw new MessagingError('sender-block-owner');
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
    blockedBy: by ?? (reviewerActorId ? 'paired-reviewer' : 'authenticated-web'),
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

function readStoredConversationBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  conversation: ConversationRef,
): ConversationSourceBlock | undefined {
  const row = db
    .prepare(
      'SELECT body FROM messaging_source_blocks WHERE bot_slug = ? AND fingerprint = ? AND conversation_kind = ? AND conversation_id = ?',
    )
    .get(botSlug, fingerprint, conversation.kind, conversation.id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as ConversationSourceBlock) : undefined;
}

export function readConversationSourceBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  conversation: ConversationRef,
): ConversationSourceBlock | undefined {
  const block = readStoredConversationBlock(db, botSlug, fingerprint, conversation);
  return block && !block.unblockedAt ? block : undefined;
}

export function listConversationSourceBlocks(
  db: DatabaseSync,
  botSlug: string,
): ConversationSourceBlock[] {
  return (
    db
      .prepare(
        "SELECT body FROM messaging_source_blocks WHERE bot_slug = ? AND json_extract(body, '$.unblockedAt') IS NULL ORDER BY json_extract(body, '$.blockedAt') DESC",
      )
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as ConversationSourceBlock);
}

export function blockConversationSource(
  db: DatabaseSync,
  botSlug: string,
  input: { bindingId: string; conversation: ConversationRef; name?: string | undefined },
  by: ConversationSourceBlock['blockedBy'] = 'authenticated-web',
): ConversationSourceBlock {
  const binding = usableBinding(db, botSlug, input.bindingId);
  const stored = readStoredConversationBlock(db, botSlug, binding.fingerprint, input.conversation);
  if (stored && !stored.unblockedAt) return stored;
  const block: ConversationSourceBlock = {
    botSlug,
    bindingId: binding.id,
    fingerprint: binding.fingerprint,
    conversation: { kind: input.conversation.kind, id: input.conversation.id },
    ...(input.name ? { name: input.name } : {}),
    revision: (stored?.revision ?? 0) + 1,
    blockedAt: new Date().toISOString(),
    blockedBy: by,
  };
  db.prepare(
    'INSERT OR REPLACE INTO messaging_source_blocks (bot_slug, fingerprint, conversation_kind, conversation_id, revision, body) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    botSlug,
    block.fingerprint,
    block.conversation.kind,
    block.conversation.id,
    block.revision,
    JSON.stringify(block),
  );
  return block;
}

export function unblockConversationSource(
  db: DatabaseSync,
  botSlug: string,
  input: {
    bindingId: string;
    conversation: ConversationRef;
    expectedRevision?: number | undefined;
  },
): boolean {
  const binding = readMessagingIdentity(db, input.bindingId);
  if (binding.botSlug !== botSlug) throw new MessagingError('sender-block-scope');
  const current = readConversationSourceBlock(db, botSlug, binding.fingerprint, input.conversation);
  if (!current) return false;
  if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision)
    throw new MessagingError('sender-block-stale');
  const unblocked: ConversationSourceBlock = {
    ...current,
    revision: current.revision + 1,
    unblockedAt: new Date().toISOString(),
  };
  db.prepare(
    'UPDATE messaging_source_blocks SET revision = ?, body = ? WHERE bot_slug = ? AND fingerprint = ? AND conversation_kind = ? AND conversation_id = ?',
  ).run(
    unblocked.revision,
    JSON.stringify(unblocked),
    botSlug,
    binding.fingerprint,
    input.conversation.kind,
    input.conversation.id,
  );
  return true;
}

export type BotSourceBlockInput =
  | { action: 'list' }
  | { action: 'block'; scope: 'sender' | 'conversation' }
  | { action: 'unblock'; blockId: string; expectedRevision?: number | undefined };

export interface BotSourceBlockView {
  blockId: string;
  scope: 'sender' | 'conversation';
  name?: string;
  conversationKind?: 'dm' | 'group';
  revision: number;
  blockedAt: string;
  blockedBy: SourceBlocker;
}

type BlockKey =
  | { scope: 'sender'; bindingId: string; actorId: string }
  | { scope: 'conversation'; bindingId: string; conversation: ConversationRef };

function blockId(key: BlockKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function readBlockId(value: string): BlockKey {
  try {
    const key = JSON.parse(Buffer.from(value, 'base64url').toString()) as Partial<BlockKey>;
    if (
      key.scope === 'sender' &&
      typeof key.bindingId === 'string' &&
      typeof key.actorId === 'string'
    )
      return key as BlockKey;
    if (
      key.scope === 'conversation' &&
      typeof key.bindingId === 'string' &&
      (key.conversation?.kind === 'dm' || key.conversation?.kind === 'group') &&
      typeof key.conversation.id === 'string'
    )
      return key as BlockKey;
  } catch {}
  throw new MessagingError('sender-block-unknown');
}

export function botSourceBlocks(
  db: DatabaseSync,
  botSlug: string,
  input: BotSourceBlockInput,
  source?: {
    fingerprint: string;
    actor: { kind: string; id: string; name?: string | undefined };
    conversation: ConversationRef;
    conversationName?: string;
  },
): { blocks: BotSourceBlockView[] } | { block: BotSourceBlockView } | { unblocked: boolean } {
  if (input.action === 'list')
    return {
      blocks: [
        ...listSenderBlocks(db, botSlug).map((block): BotSourceBlockView => ({
          blockId: blockId({ scope: 'sender', bindingId: block.bindingId, actorId: block.actorId }),
          scope: 'sender',
          ...(block.actorName ? { name: block.actorName } : {}),
          revision: block.revision,
          blockedAt: block.blockedAt,
          blockedBy: block.blockedBy,
        })),
        ...listConversationSourceBlocks(db, botSlug).map((block): BotSourceBlockView => ({
          blockId: blockId({
            scope: 'conversation',
            bindingId: block.bindingId,
            conversation: block.conversation,
          }),
          scope: 'conversation',
          ...(block.name ? { name: block.name } : {}),
          conversationKind: block.conversation.kind,
          revision: block.revision,
          blockedAt: block.blockedAt,
          blockedBy: block.blockedBy,
        })),
      ],
    };
  if (input.action === 'unblock') {
    const key = readBlockId(input.blockId);
    return {
      unblocked:
        key.scope === 'sender'
          ? unblockSender(db, botSlug, { ...key, expectedRevision: input.expectedRevision })
          : unblockConversationSource(db, botSlug, {
              ...key,
              expectedRevision: input.expectedRevision,
            }),
    };
  }
  if (!source) throw new MessagingError('source-unavailable');
  const bindingId = senderBlockBindingIds(db, botSlug, source.fingerprint)[0];
  if (!bindingId) throw new MessagingError('sender-block-scope');
  const owner =
    source.actor.kind === 'user' && ownerActor(db, botSlug, source.fingerprint, source.actor.id);
  if (input.scope === 'sender') {
    if (source.actor.kind !== 'user') throw new MessagingError('sender-block-scope');
    if (owner) throw new MessagingError('sender-block-owner');
    const block = blockSender(
      db,
      botSlug,
      { bindingId, actorId: source.actor.id, actorName: source.actor.name?.slice(0, 200) },
      undefined,
      'bot',
    );
    return {
      block: {
        blockId: blockId({ scope: 'sender', bindingId: block.bindingId, actorId: block.actorId }),
        scope: 'sender',
        ...(block.actorName ? { name: block.actorName } : {}),
        revision: block.revision,
        blockedAt: block.blockedAt,
        blockedBy: block.blockedBy,
      },
    };
  }
  if (source.conversation.kind === 'dm' && owner) throw new MessagingError('sender-block-owner');
  const block = blockConversationSource(
    db,
    botSlug,
    {
      bindingId,
      conversation: source.conversation,
      name: source.conversationName?.slice(0, 200),
    },
    'bot',
  );
  return {
    block: {
      blockId: blockId({
        scope: 'conversation',
        bindingId: block.bindingId,
        conversation: block.conversation,
      }),
      scope: 'conversation',
      ...(block.name ? { name: block.name } : {}),
      conversationKind: block.conversation.kind,
      revision: block.revision,
      blockedAt: block.blockedAt,
      blockedBy: block.blockedBy,
    },
  };
}
