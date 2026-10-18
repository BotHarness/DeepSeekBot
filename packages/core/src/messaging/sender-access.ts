import { randomUUID } from 'node:crypto';
import { cloudMessageAllowed } from '../cloud/admission.js';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { readMessagingIdentity } from './identity.js';
import { MessagingError, type MessagingInboundEvent } from './provider.js';
import type { PairingCapability, PairingRequest } from './pairing.js';
import type { MessagingGrant } from './outbound.js';
import { readBlock } from './conversations.js';
import { groupReceptionPolicy } from './group-policy.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import { behaviorPermissionInputs, changeBehaviorPermission } from './behavior-permissions.js';
import { messagingDefaults } from './defaults.js';
import { threadReceptionPolicy } from './thread-policy.js';
import { matchingIngests, type ConversationIngest } from './conversation-ingest.js';
import { bridgeChannel } from './channel-target.js';
import { chatPairingApplies, chatSenderIdentity, type ChatSenderNamespace } from './chat-sender.js';
import {
  permissionGroupInputs,
  changePermissionGroups,
  effectivePairingPermissions,
  type EffectivePermissions,
} from './permission-groups.js';

export interface ExternalUserRole {
  id: string;
  botSlug: string;
  name: string;
  behavior: string;
  capabilities: PairingCapability[];
  delegableCapabilities?: PairingCapability[];
  revision: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface SenderPolicy {
  restricted: boolean;
  revision: number;
}
export const senderAccessInput = z.discriminatedUnion('kind', [
  ...behaviorPermissionInputs,
  ...permissionGroupInputs,
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
      capabilities: z.array(z.enum(['approve', 'reject', 'review-pairing', 'save-rules'])).max(4),
      delegableCapabilities: z
        .array(z.enum(['approve', 'reject', 'review-pairing', 'save-rules']))
        .max(4)
        .optional(),
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
  namespace: ChatSenderNamespace;
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
  namespace: ChatSenderNamespace;
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
  effectivePermissions?: EffectivePermissions;
}
export function trustedSenderReference(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): TrustedSenderReference | undefined {
  const scoped = chatSenderIdentity(event);
  if (!scoped) return undefined;
  const row = db
    .prepare(
      'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
    )
    .get(botSlug, scoped.providerId, event.botId, event.fingerprint) as { id: string } | undefined;
  if (!row) return undefined;
  return {
    botSlug,
    bindingId: row.id,
    providerId: scoped.providerId,
    accountRef: event.botId,
    fingerprint: event.fingerprint,
    actorId: event.actor.id,
    namespace: scoped.namespace,
  };
}
export function readSourceSenderPermissions(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
  at: Date,
  authority:
    | MessagingGrant
    | { ingest: ConversationIngest; bindingId: string | undefined }
    | undefined,
): SenderPermissions {
  const queriedAt = at.toISOString();
  const unavailable = (reason: string): SenderPermissions => ({
    queriedAt,
    status: 'unavailable',
    reason,
  });
  if (event.actor.kind !== 'user') return unavailable('no-current-scoped-identity');
  if (!authority) return unavailable('source-unavailable');
  if (!authority.bindingId) return unavailable('no-current-scoped-identity');
  const scope = 'ingest' in authority ? authority.ingest : authority;
  let identity;
  try {
    identity = readMessagingIdentity(db, authority.bindingId);
  } catch (error) {
    if (!(error instanceof MessagingError)) throw error;
    return unavailable('no-current-scoped-identity');
  }
  if (identity.revokedAt) return unavailable('binding-replaced');
  if (
    (!('ingest' in authority) && identity.botSlug !== authority.botSlug) ||
    identity.providerId !== scope.providerId ||
    identity.accountRef !== event.botId ||
    identity.fingerprint !== event.fingerprint ||
    identity.platform !== event.channel ||
    scope.accountRef !== event.botId ||
    scope.fingerprint !== event.fingerprint ||
    scope.platform !== event.channel
  )
    return unavailable('binding-replaced');
  if (!identity.enabled) return unavailable('identity-disabled');
  if ('ingest' in authority) {
    if (!authority.ingest.enabled) return unavailable('ingest-disabled');
    if (
      authority.ingest.conversation.kind !== event.conversation.kind ||
      authority.ingest.conversation.id !== event.conversation.id
    )
      return unavailable('source-unavailable');
  } else {
    if (authority.revokedAt) return unavailable('grant-revoked');
    if (authority.suspendedReason) return unavailable('rebind-required');
    if (
      authority.receiveScope?.kind !== event.conversation.kind ||
      authority.receiveScope.conversationId !== event.conversation.id
    )
      return unavailable('source-unavailable');
  }
  if (readBlock(db, identity.botSlug, event.fingerprint, event.conversation))
    return unavailable('conversation-blocked');
  if (identity.botSlug !== botSlug) {
    const own = db
      .prepare(
        'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
      )
      .get(botSlug, scope.providerId, event.botId, event.fingerprint) as { id: string } | undefined;
    if (!own) return unavailable('no-current-scoped-identity');
    identity = readMessagingIdentity(db, own.id);
    if (!identity.enabled) return unavailable('identity-disabled');
    if (readBlock(db, botSlug, event.fingerprint, event.conversation))
      return unavailable('conversation-blocked');
  }
  if (!chatPairingApplies(event))
    return { queriedAt, status: 'unavailable', reason: 'role-policy-not-supported-for-platform' };
  const result = readSenderPermissions(db, botSlug, event, at);
  if (result.sender && result.sender.bindingId !== identity.id)
    return unavailable('binding-replaced');
  return result;
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
    const effectivePermissions = effectivePairingPermissions(
      db,
      botSlug,
      sender.bindingId,
      sender.actorId,
    );
    return role
      ? {
          ...base,
          status: 'paired',
          role,
          effectivePermissions: {
            ...effectivePermissions,
            ...(effectivePermissions.behaviorPermissions
              ? {
                  behaviorPermissions: effectivePermissions.behaviorPermissions.map(
                    ({ excludes: _excludes, ...behavior }) => behavior,
                  ),
                }
              : {}),
          },
        }
      : { ...base, status: 'unavailable', reason: 'role-unavailable' };
  }
  const latest = pairings[0];
  if (openGroupAllows(db, botSlug, event))
    return { ...base, status: 'visitor', reason: 'explicit-open-group' };
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
  if (
    input.kind === 'create-behavior-permission' ||
    input.kind === 'edit-behavior-permission' ||
    input.kind === 'delete-behavior-permission'
  ) {
    changeBehaviorPermission(db, botSlug, input);
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (
    input.kind === 'create-group' ||
    input.kind === 'edit-group' ||
    input.kind === 'delete-group' ||
    input.kind === 'person-permissions'
  ) {
    changePermissionGroups(db, botSlug, input);
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (input.kind === 'create-role') {
    if (externalUserRoles(db, botSlug).length >= 50) throw new MessagingError('role-capacity');
    const at = new Date().toISOString();
    const role: ExternalUserRole = {
      id: randomUUID(),
      botSlug,
      name: input.name,
      behavior: input.behavior,
      capabilities: [],
      revision: 1,
      createdAt: at,
      updatedAt: at,
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
      delegableCapabilities: [
        ...new Set(input.delegableCapabilities ?? role.delegableCapabilities ?? []),
      ],
      revision: role.revision + 1,
      updatedAt: new Date().toISOString(),
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
    const at = new Date().toISOString();
    db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ? AND bot_slug = ?').run(
      JSON.stringify({
        ...pairing,
        roleId: role.id,
        roleRevision: role.revision,
        capabilities: [],
        revision: pairing.revision + 1,
        reassignedAt: at,
        updatedAt: at,
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
      WHERE a.bot_slug = ? AND a.attempt_state IN ('pending', 'retryable') AND e.source_kind = 'bridge-message'`)
      .all(botSlug) as { source_event_id: string }[];
    for (const row of pending)
      if (!sourceSenderAllowed(db, botSlug, row.source_event_id))
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'handled', ignored_at = ?, handled_at = ?, wake_count = NULL, wake_interval_ms = NULL WHERE bot_slug = ? AND source_event_id = ?",
        ).run(new Date().toISOString(), new Date().toISOString(), botSlug, row.source_event_id);
  }
}
export function bumpSenderPolicy(db: DatabaseSync, botSlug: string): void {
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
  const sender = trustedSenderReference(db, botSlug, event);
  if (!sender) return undefined;
  const identity = readMessagingIdentity(db, sender.bindingId);
  if (!identity.enabled) return undefined;
  const row = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'conversation' AND status = 'approved'",
    )
    .get(botSlug, sender.bindingId, event.actor.id) as { body: string } | undefined;
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
    bindingId: sender.bindingId,
    providerId: identity.providerId,
    fingerprint: identity.fingerprint,
    actorId: event.actor.id,
    namespace: sender.namespace,
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
  if (event.channel === 'tob') return cloudMessageAllowed(db, botSlug, event, false);
  return (
    !chatPairingApplies(event) ||
    !readSenderPolicy(db, botSlug).restricted ||
    currentSenderRole(db, botSlug, event) !== undefined ||
    ((event.conversation.kind === 'dm' || event.mentionedAccount) &&
      openGroupAllows(db, botSlug, event))
  );
}
function senderGroupGrants(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): MessagingGrant[] {
  if (event.conversation.kind !== 'group') return [];
  const sender = trustedSenderReference(db, botSlug, event);
  if (!sender) return [];
  const identity = readMessagingIdentity(db, sender.bindingId);
  if (
    !identity.enabled ||
    readBlock(db, botSlug, identity.fingerprint, event.conversation) ||
    !Number.isFinite(Date.parse(event.at)) ||
    Date.parse(event.at) < Date.parse(identity.createdAt)
  )
    return [];
  return (
    db
      .prepare(
        'SELECT body FROM messaging_grants WHERE bot_slug = ? AND binding_id = ? AND revoked_at IS NULL',
      )
      .all(botSlug, sender.bindingId) as { body: string }[]
  )
    .map((row) => JSON.parse(row.body) as MessagingGrant)
    .filter(
      (value) =>
        !value.suspendedReason &&
        value.receiveScope?.kind === 'group' &&
        value.receiveScope.conversationId === event.conversation.id &&
        (!value.receiveAfter || Date.parse(event.at) >= Date.parse(value.receiveAfter)),
    );
}
function openGroupAllows(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  return senderGroupGrants(db, botSlug, event).some(
    (value) =>
      value.openGroup === true &&
      !!value.openGroupAfter &&
      Date.parse(event.at) >= Date.parse(value.openGroupAfter),
  );
}
export function senderContextAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  if (event.channel === 'tob') return cloudMessageAllowed(db, botSlug, event, true);
  if (senderAdmissionAllowed(db, botSlug, event)) return true;
  if (event.channel !== 'feishu' || event.conversation.kind !== 'group' || event.mentionedAccount)
    return false;
  const sender = trustedSenderReference(db, botSlug, event);
  if (!sender) return false;
  const identity = readMessagingIdentity(db, sender.bindingId);
  if (
    !identity.enabled ||
    !Number.isFinite(Date.parse(event.at)) ||
    Date.parse(event.at) < Date.parse(identity.createdAt) ||
    readBlock(db, botSlug, identity.fingerprint, event.conversation)
  )
    return false;
  if (
    matchingIngests(db, identity.providerId, identity.fingerprint, event.conversation).some(
      (ingest) => {
        if (
          !ingest.enabled ||
          ingest.accountRef !== identity.accountRef ||
          Date.parse(event.at) < Date.parse(ingest.intakeAfter)
        )
          return false;
        try {
          return bridgeChannel(db, ingest.channelId, botSlug, true).type === 'group';
        } catch {
          return false;
        }
      },
    )
  )
    return true;
  return senderGroupGrants(db, botSlug, event).some((value) => {
    const thread = event.reply.threadId
      ? threadReceptionPolicy(db, value.id, event.reply.threadId)
      : undefined;
    if (thread?.mode === 'exclude') return false;
    if (
      thread?.mode === 'follow' &&
      thread.rootId === event.reply.rootId &&
      thread.fingerprint === event.fingerprint &&
      thread.conversationId === event.conversation.id
    )
      return true;
    const policy = groupReceptionPolicy(db, value.id);
    return channelBridgeRoutes(value).some(
      (route) =>
        route.enabled &&
        (!route.intakeAfter || Date.parse(event.at) >= Date.parse(route.intakeAfter)) &&
        (route.collectionInheritance === 'inherit'
          ? messagingDefaults(db, value.platform).collection
          : value.bridgeRoutes || value.channelBridge
            ? route.collection
            : policy.collection) === 'all',
    );
  });
}
export function sourceSenderAllowed(
  db: DatabaseSync,
  botSlug: string,
  sourceEventId: string,
  context = false,
): boolean {
  const row = db
    .prepare(
      "SELECT payload_json FROM source_events WHERE source_event_id = ? AND source_kind = 'bridge-message'",
    )
    .get(sourceEventId) as { payload_json: string } | undefined;
  if (!row) return true;
  const event = (
    JSON.parse(row.payload_json) as { external?: { event?: Omit<MessagingInboundEvent, 'text'> } }
  ).external?.event;
  if (event?.channel === 'tob') return cloudMessageAllowed(db, botSlug, event, context);
  if (!readSenderPolicy(db, botSlug).restricted) return true;
  return (
    !!event &&
    (context
      ? senderContextAllowed(db, botSlug, event)
      : senderAdmissionAllowed(db, botSlug, event))
  );
}
