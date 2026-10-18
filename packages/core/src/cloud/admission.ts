import type { DatabaseSync } from 'node:sqlite';
import type { MessagingInboundEvent } from '../messaging/provider.js';
import { readMessagingIdentity } from '../messaging/identity.js';
import { parsePolicy } from './connections.js';
import type { CloudConnection } from './transport.js';
import { parseWorkRequest } from './work-contract.js';

export function cloudMessageAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
  context: boolean,
): boolean {
  if (!context) {
    try {
      return (
        cloudWorkIdentityAllowed(db, botSlug, event) &&
        Date.parse(parseWorkRequest(event.cloudWork).expiresAt) > Date.now()
      );
    } catch {
      return false;
    }
  }
  return cloudIdentityAllowed(db, botSlug, event, true);
}
export function cloudWorkIdentityAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  return cloudIdentityAllowed(db, botSlug, event, false);
}
function cloudIdentityAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
  context: boolean,
): boolean {
  const row = db
    .prepare('SELECT connection_json,policy_json FROM cloud_connections WHERE id=? AND active=1')
    .get(event.botId) as { connection_json: string; policy_json: string } | undefined;
  if (!row || event.channel !== 'tob' || event.conversation.kind !== 'group') return false;
  try {
    const connection = JSON.parse(row.connection_json) as CloudConnection;
    if (
      connection.id !== event.botId ||
      connection.fingerprint !== event.fingerprint ||
      connection.channelId !== event.conversation.id
    )
      return false;
    const bindings = db
      .prepare(
        "SELECT id FROM messaging_bindings WHERE provider_id='botharness/tob' AND account_ref=? AND fingerprint=? AND revoked_at IS NULL",
      )
      .all(connection.id, connection.fingerprint) as { id: string }[];
    const active = bindings.map((b) => readMessagingIdentity(db, b.id)).filter((b) => b.enabled);
    if (context) return active.length > 0;
    if (!event.mentionedAccount || !active.some((b) => b.botSlug === botSlug)) return false;
    const work = parseWorkRequest(event.cloudWork);
    return (
      work.channelId === connection.channelId &&
      work.targetActorId === connection.actorId &&
      (work.delegation
        ? event.actor.kind === 'agent' && event.actor.id === work.delegation.actorId
        : event.actor.kind === 'user' && event.actor.id === work.requesterUserId) &&
      parsePolicy(JSON.parse(row.policy_json)).allowedUsers.includes(work.requesterUserId)
    );
  } catch {
    return false;
  }
}
