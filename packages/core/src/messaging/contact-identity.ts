import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { MessagingIdentity } from './identity.js';
import type { MessagingInboundEvent } from './provider.js';

export type ContactBinding = Pick<
  MessagingIdentity,
  'id' | 'providerId' | 'platform' | 'contactWorkspaceId'
>;

export function contactId(identity: ContactBinding, actorId: string): string {
  const scope = identity.contactWorkspaceId
    ? ['workspace', identity.contactWorkspaceId]
    : ['binding', identity.id];
  return createHash('sha256')
    .update(JSON.stringify([identity.providerId, identity.platform, scope, actorId]))
    .digest('hex');
}

export function observeContact(
  db: DatabaseSync,
  bindingId: string,
  slug: string,
  event: Pick<MessagingInboundEvent, 'actor' | 'at'>,
): void {
  if (event.actor.kind !== 'user') return;
  db.prepare(`INSERT INTO messaging_contact_observations
    (binding_id, bot_slug, actor_id, name, last_seen_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (binding_id, bot_slug, actor_id) DO UPDATE SET
      name = COALESCE(excluded.name, name), last_seen_at = excluded.last_seen_at
    WHERE excluded.last_seen_at > last_seen_at
    OR (excluded.last_seen_at = last_seen_at AND excluded.name IS NOT NULL AND excluded.name IS NOT name)`).run(
    bindingId,
    slug,
    event.actor.id,
    event.actor.name ?? null,
    event.at,
  );
}

export function personBlocked(db: DatabaseSync, slug: string, id: string): boolean {
  return !!db
    .prepare(`SELECT 1 FROM messaging_person_blocks
    WHERE contact_id = ? AND bot_slug = ? AND scope_kind = 'bot' AND scope_id = ''`)
    .get(id, slug);
}
