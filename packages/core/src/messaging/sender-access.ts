import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { readMessagingIdentity } from './identity.js';
import { MessagingError, type MessagingInboundEvent } from './provider.js';
import type { PairingCapability, PairingRequest } from './pairing.js';

export interface ExternalUserRole {
  id: string;
  botSlug: string;
  name: string;
  behavior: string;
  capabilities: PairingCapability[];
  revision: number;
}
export interface SenderPolicy {
  restricted: boolean;
  revision: number;
}
export const senderAccessInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create-role'),
      name: z.string().trim().min(1).max(80),
      behavior: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('edit-role'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      behavior: z.string().trim().min(1).max(2000),
      capabilities: z.array(z.enum(['approve', 'reject'])).max(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal('reassign-role'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      roleId: z.string().uuid(),
      expectedRoleRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('policy'),
      restricted: z.boolean(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type SenderAccessInput = z.infer<typeof senderAccessInput>;
export interface SenderRoleContext {
  bindingId: string;
  providerId: string;
  fingerprint: string;
  actorId: string;
  namespace: 'lark-app-open-id';
  pairingId: string;
  pairingRevision: number;
  policyRevision: number;
  role: ExternalUserRole;
}
export interface TrustedSenderReference {
  botSlug: string;
  bindingId: string;
  providerId: string;
  accountRef: string;
  fingerprint: string;
  actorId: string;
  namespace: 'lark-app-open-id';
}
export interface SenderPermissions {
  queriedAt: string;
  status:
    | 'paired'
    | 'visitor'
    | 'unpaired'
    | 'pending'
    | 'rejected'
    | 'expired'
    | 'revoked'
    | 'unavailable';
  sender?: TrustedSenderReference;
  policyRevision?: number;
  role?: ExternalUserRole;
  reason?: string;
}
export function trustedSenderReference(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): TrustedSenderReference | undefined {
  if (
    event.channel !== 'feishu' ||
    event.actor.kind !== 'user' ||
    !/^ou_[A-Za-z0-9]+$/.test(event.actor.id)
  )
    return undefined;
  const row = db
    .prepare(
      'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
    )
    .get(botSlug, 'dsh-im/feishu', event.botId, event.fingerprint) as { id: string } | undefined;
  if (!row) return undefined;
  return {
    botSlug,
    bindingId: row.id,
    providerId: 'dsh-im/feishu',
    accountRef: event.botId,
    fingerprint: event.fingerprint,
    actorId: event.actor.id,
    namespace: 'lark-app-open-id',
  };
}
export function readSenderPermissions(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
  at: Date,
): SenderPermissions {
  const queriedAt = at.toISOString();
  const sender = trustedSenderReference(db, botSlug, event);
  if (!sender) return { queriedAt, status: 'unavailable', reason: 'no-current-scoped-identity' };
  const policy = readSenderPolicy(db, botSlug);
  const base = { queriedAt, sender, policyRevision: policy.revision };
  if (!readMessagingIdentity(db, sender.bindingId).enabled)
    return { ...base, status: 'unavailable', reason: 'identity-disabled' };
  const rows = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'conversation' ORDER BY rowid DESC",
    )
    .all(botSlug, sender.bindingId, sender.actorId) as { body: string }[];
  const pairings = rows.map((row) => JSON.parse(row.body) as PairingRequest);
  const approved = pairings.find((pairing) => pairing.status === 'approved');
  if (approved) {
    const role = externalUserRoles(db, botSlug).find((role) => role.id === approved.roleId);
    return role
      ? { ...base, status: 'paired', role }
      : { ...base, status: 'unavailable', reason: 'role-unavailable' };
  }
  const latest = pairings[0];
  if (latest)
    return {
      ...base,
      status:
        latest.status === 'pending' && Date.parse(latest.expiresAt) <= at.getTime()
          ? 'expired'
          : latest.status === 'approved'
            ? 'unavailable'
            : latest.status,
    };
  return { ...base, status: policy.restricted ? 'unpaired' : 'visitor' };
}
export function readSenderPolicy(db: DatabaseSync, botSlug: string): SenderPolicy {
  const row = db
    .prepare('SELECT restricted, revision FROM messaging_sender_policies WHERE bot_slug = ?')
    .get(botSlug) as { restricted: number; revision: number } | undefined;
  return row
    ? { restricted: row.restricted === 1, revision: row.revision }
    : { restricted: false, revision: 0 };
}
export function externalUserRoles(db: DatabaseSync, botSlug: string): ExternalUserRole[] {
  return (
    db
      .prepare('SELECT body FROM messaging_external_roles WHERE bot_slug = ? ORDER BY rowid')
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as ExternalUserRole);
}
export function changeSenderAccess(
  db: DatabaseSync,
  botSlug: string,
  raw: SenderAccessInput,
): void {
  const input = senderAccessInput.parse(raw);
  if (input.kind === 'create-role') {
    if (externalUserRoles(db, botSlug).length >= 50) throw new MessagingError('role-capacity');
    const role: ExternalUserRole = {
      id: randomUUID(),
      botSlug,
      name: input.name,
      behavior: input.behavior,
      capabilities: [],
      revision: 1,
    };
    db.prepare('INSERT INTO messaging_external_roles (id, bot_slug, body) VALUES (?, ?, ?)').run(
      role.id,
      botSlug,
      JSON.stringify(role),
    );
    return;
  }
  if (input.kind === 'edit-role') {
    const role = externalUserRoles(db, botSlug).find((item) => item.id === input.id);
    if (!role || role.revision !== input.expectedRevision) throw new MessagingError('role-stale');
    const next: ExternalUserRole = {
      ...role,
      name: input.name,
      behavior: input.behavior,
      capabilities: [...new Set(input.capabilities)],
      revision: role.revision + 1,
    };
    db.prepare('UPDATE messaging_external_roles SET body = ? WHERE id = ? AND bot_slug = ?').run(
      JSON.stringify(next),
      next.id,
      botSlug,
    );
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (input.kind === 'reassign-role') {
    const row = db
      .prepare('SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ?')
      .get(input.id, botSlug) as { body: string } | undefined;
    if (!row) throw new MessagingError('pairing-unavailable');
    const pairing = JSON.parse(row.body) as PairingRequest;
    const binding = readMessagingIdentity(db, pairing.bindingId);
    if (
      pairing.purpose !== 'conversation' ||
      pairing.status !== 'approved' ||
      pairing.revision !== input.expectedRevision ||
      binding.botSlug !== botSlug ||
      binding.revokedAt ||
      !binding.enabled
    )
      throw new MessagingError('pairing-stale');
    const role = externalUserRoles(db, botSlug).find((item) => item.id === input.roleId);
    if (!role || role.revision !== input.expectedRoleRevision)
      throw new MessagingError('role-stale');
    db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ? AND bot_slug = ?').run(
      JSON.stringify({
        ...pairing,
        roleId: role.id,
        roleRevision: role.revision,
        capabilities: [],
        revision: pairing.revision + 1,
        reassignedAt: new Date().toISOString(),
        reviewedBy: 'authenticated-web',
      }),
      pairing.id,
      botSlug,
    );
    bumpSenderPolicy(db, botSlug);
    return;
  }
  const policy = readSenderPolicy(db, botSlug);
  if (policy.revision !== input.expectedRevision) throw new MessagingError('sender-policy-stale');
  db.prepare(
    'INSERT INTO messaging_sender_policies (bot_slug, restricted, revision) VALUES (?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET restricted = excluded.restricted, revision = excluded.revision',
  ).run(botSlug, input.restricted ? 1 : 0, policy.revision + 1);
  if (input.restricted) {
    const pending = db
      .prepare(`SELECT a.source_event_id FROM inbox_admissions a JOIN source_events e USING(source_event_id)
      WHERE a.bot_slug = ? AND a.attempt_state IN ('pending', 'retryable') AND e.source_kind = 'bridge-message' AND json_extract(e.payload_json, '$.external.platform') = 'feishu'`)
      .all(botSlug) as { source_event_id: string }[];
    for (const row of pending)
      if (!sourceSenderAllowed(db, botSlug, row.source_event_id))
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'handled', ignored_at = ?, handled_at = ?, wake_count = NULL, wake_interval_ms = NULL WHERE bot_slug = ? AND source_event_id = ?",
        ).run(new Date().toISOString(), new Date().toISOString(), botSlug, row.source_event_id);
  }
}
function bumpSenderPolicy(db: DatabaseSync, botSlug: string): void {
  const policy = readSenderPolicy(db, botSlug);
  db.prepare(
    'INSERT INTO messaging_sender_policies (bot_slug, restricted, revision) VALUES (?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET revision = excluded.revision',
  ).run(botSlug, policy.restricted ? 1 : 0, policy.revision + 1);
}
export function currentSenderRole(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): SenderRoleContext | undefined {
  if (
    event.channel !== 'feishu' ||
    event.actor.kind !== 'user' ||
    !/^ou_[A-Za-z0-9]+$/.test(event.actor.id)
  )
    return undefined;
  const binding = db
    .prepare(
      'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
    )
    .get(botSlug, 'dsh-im/feishu', event.botId, event.fingerprint) as { id: string } | undefined;
  if (!binding) return undefined;
  const identity = readMessagingIdentity(db, binding.id);
  if (!identity.enabled) return undefined;
  const row = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'conversation' AND status = 'approved'",
    )
    .get(botSlug, binding.id, event.actor.id) as { body: string } | undefined;
  if (!row) return undefined;
  const pairing = JSON.parse(row.body) as PairingRequest;
  const role = externalUserRoles(db, botSlug).find((role) => role.id === pairing.roleId);
  if (
    !role ||
    !pairing.reviewedAt ||
    !Number.isFinite(Date.parse(event.at)) ||
    Date.parse(event.at) < Date.parse(pairing.reviewedAt) ||
    pairing.messageIds?.includes(event.messageId)
  )
    return undefined;
  return {
    bindingId: binding.id,
    providerId: identity.providerId,
    fingerprint: identity.fingerprint,
    actorId: event.actor.id,
    namespace: 'lark-app-open-id',
    pairingId: pairing.id,
    pairingRevision: pairing.revision,
    policyRevision: readSenderPolicy(db, botSlug).revision,
    role,
  };
}
export function senderAdmissionAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  return (
    event.channel !== 'feishu' ||
    !readSenderPolicy(db, botSlug).restricted ||
    currentSenderRole(db, botSlug, event) !== undefined
  );
}
export function sourceSenderAllowed(
  db: DatabaseSync,
  botSlug: string,
  sourceEventId: string,
): boolean {
  if (!readSenderPolicy(db, botSlug).restricted) return true;
  const row = db
    .prepare(
      "SELECT payload_json FROM source_events WHERE source_event_id = ? AND source_kind = 'bridge-message'",
    )
    .get(sourceEventId) as { payload_json: string } | undefined;
  if (!row) return true;
  const event = (
    JSON.parse(row.payload_json) as { external?: { event?: Omit<MessagingInboundEvent, 'text'> } }
  ).external?.event;
  return !!event && senderAdmissionAllowed(db, botSlug, event);
}
