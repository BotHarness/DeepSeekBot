import { canExternalContactSpeak, coversBot } from '../../team-policy/external-contact.js';
import { approvedConversationPairing, externalContactRoles } from './contact-roles.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { cloudMessageAllowed } from '../../cloud/admission.js';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { readMessagingIdentity } from '../identity.js';
import { externalBotTurnsExhausted } from '../bot-sender-guard.js';
import { MessagingError, type MessagingInboundEvent } from '../provider.js';
import type { PairingCapability, PairingRequest } from '../pairing.js';
import type { MessagingGrant } from '../outbound.js';
import { readBlock } from '../conversations.js';
import { groupReceptionPolicy } from './group-reception.js';
import { channelBridgeRoutes } from '../channel-bridge.js';
import { behaviorPermissionInputs, changeBehaviorPermission } from './behavior.js';
import {
  blockConversationSource,
  blockSender,
  sourceBlocked,
  personBlockApplies,
  senderBlocked,
  unblockConversationSource,
  unblockSender,
} from './sender-blocks.js';
import { messagingDefaults } from '../defaults.js';
import { threadReceptionPolicy } from './thread-reception.js';
import { matchingIngests, type ConversationIngest } from '../conversation-ingest.js';
import { bridgeChannel } from '../channel-target.js';
import {
  chatPairingApplies,
  chatSenderIdentity,
  platformPeople,
  type ChatSenderNamespace,
} from './people.js';
import {
  permissionGroupInputs,
  changePermissionGroups,
  effectivePairingPermissions,
  externalPermissionGroups,
  type EffectivePermissions,
} from './groups.js';

import type {
  ExternalContactAccess,
  HostExternalRole,
} from '@botharness/host-protocol/external-roles';
import {
  canDelegateExternalRole,
  changeHostExternalRole,
  deleteExternalRole,
  hostExternalRoles,
  isSingleBotRole,
  readExternalRoleForBot,
} from './roles.js';

export type ExternalUserRole = Omit<
  HostExternalRole,
  'botScope' | 'policy' | 'deniedCapabilities'
> &
  Partial<Pick<HostExternalRole, 'botScope' | 'policy' | 'deniedCapabilities'>> & {
    botSlug: string;
  };
export interface SenderPolicy {
  restricted: boolean;
  revision: number;
  defaultRoleId?: string;
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
      kind: z.literal('delete-role'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
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
      kind: z.literal('default-role'),
      roleId: z.string().uuid().nullable(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('block-sender'),
      bindingId: z.string().min(1).max(200),
      actorId: z.string().trim().min(1).max(200),
      actorName: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unblock-sender'),
      bindingId: z.string().min(1).max(200),
      actorId: z.string().trim().min(1).max(200),
      expectedRevision: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('block-conversation'),
      bindingId: z.string().min(1).max(200),
      conversation: z
        .object({ kind: z.enum(['dm', 'group']), id: z.string().min(1).max(200) })
        .strict(),
      name: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unblock-conversation'),
      bindingId: z.string().min(1).max(200),
      conversation: z
        .object({ kind: z.enum(['dm', 'group']), id: z.string().min(1).max(200) })
        .strict(),
      expectedRevision: z.number().int().positive().optional(),
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
  roles?: ExternalUserRole[];
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
  const identity = readMessagingIdentity(db, sender.bindingId);
  if (!identity.enabled) return { ...base, status: 'unavailable', reason: 'identity-disabled' };
  if (sourceBlocked(db, botSlug, event))
    return { ...base, status: 'unavailable', reason: 'sender-blocked' };
  const rows = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'conversation' ORDER BY rowid DESC",
    )
    .all(botSlug, sender.bindingId, sender.actorId) as { body: string }[];
  const pairings = rows.map((row) => JSON.parse(row.body) as PairingRequest);
  const approved = pairings.find((pairing) => pairing.status === 'approved');
  const roles = externalContactRoles(db, identity, sender.actorId, approved);
  const [first] = roles;
  if (first) {
    const effectivePermissions = effectivePairingPermissions(
      db,
      botSlug,
      sender.bindingId,
      sender.actorId,
    );
    return {
      ...base,
      status: 'paired',
      role: { ...first.role, botSlug },
      ...(roles.length > 1 ? { roles: roles.map(({ role }) => ({ ...role, botSlug })) } : {}),
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
    };
  }
  if (approved) return { ...base, status: 'unavailable', reason: 'role-unavailable' };
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
    .prepare(
      'SELECT restricted, revision, default_role_id FROM messaging_sender_policies WHERE bot_slug = ?',
    )
    .get(botSlug) as
    | { restricted: number; revision: number; default_role_id: string | null }
    | undefined;
  if (!row) return { restricted: false, revision: 0 };
  const defaultRole = readExternalRoleForBot(db, botSlug, row.default_role_id ?? undefined);
  return {
    restricted: row.restricted === 1,
    revision: row.revision,
    ...(defaultRole ? { defaultRoleId: defaultRole.id } : {}),
  };
}
type ScopedExternalRole = HostExternalRole & { botSlug: string };

export function externalUserRoles(db: DatabaseSync, botSlug: string): ScopedExternalRole[] {
  return hostExternalRoles(db)
    .filter((role) => coversBot(role.botScope, botSlug))
    .map((role) => ({ ...role, botSlug }));
}
export interface SenderAccessReviewer {
  bindingId: string;
  actorId: string;
}
function assertReviewerExceptions(
  db: DatabaseSync,
  botSlug: string,
  input: SenderAccessInput,
  reviewer: SenderAccessReviewer,
): void {
  if (input.kind === 'edit-group') {
    assertReviewerMembership(db, botSlug, input, reviewer);
    return;
  }
  if (input.kind !== 'person-permissions') throw new MessagingError('pairing-unauthorized');
  const row = db
    .prepare('SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ?')
    .get(input.id, botSlug) as { body: string } | undefined;
  if (!row) throw new MessagingError('pairing-stale');
  const pairing = JSON.parse(row.body) as PairingRequest;
  const permissions = effectivePairingPermissions(
    db,
    botSlug,
    reviewer.bindingId,
    reviewer.actorId,
  );
  if (
    !permissions.capabilities.includes('review-pairing') ||
    pairing.bindingId !== reviewer.bindingId ||
    pairing.actorId === reviewer.actorId
  )
    throw new MessagingError('pairing-unauthorized');
  const before = pairing.permissionExceptions;
  const changed = (left: readonly string[] = [], right: readonly string[] = []) => [
    ...left.filter((cap) => !right.includes(cap)),
    ...right.filter((cap) => !left.includes(cap)),
  ];
  const delegable = permissions.delegableCapabilities ?? [];
  if (
    changed(before?.delegateAllow, input.delegateAllow ?? before?.delegateAllow).length ||
    changed(before?.delegateDeny, input.delegateDeny ?? before?.delegateDeny).length ||
    [...changed(before?.allow, input.allow), ...changed(before?.deny, input.deny)].some(
      (cap) => !delegable.includes(cap as PairingCapability),
    )
  )
    throw new MessagingError('pairing-delegation-denied');
}
function assertReviewerMembership(
  db: DatabaseSync,
  botSlug: string,
  input: Extract<SenderAccessInput, { kind: 'edit-group' }>,
  reviewer: SenderAccessReviewer,
): void {
  const group = externalPermissionGroups(db, botSlug).find((item) => item.id === input.id);
  if (!group || group.revision !== input.expectedRevision)
    throw new MessagingError('permission-group-stale');
  const same = (left: readonly string[] = [], right: readonly string[] = []) =>
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.length === right.length &&
    left.every((item) => right.includes(item));
  const kept = (next: readonly string[] | undefined, current: readonly string[] | undefined) =>
    next === undefined || same(next, current);
  const added = input.memberIds.filter((id) => !group.memberIds.includes(id));
  const removed = group.memberIds.filter((id) => !input.memberIds.includes(id));
  if (
    group.bindingId !== reviewer.bindingId ||
    input.name !== group.name ||
    !same(input.allow, group.allow) ||
    !same(input.deny, group.deny) ||
    !kept(input.delegateAllow, group.delegateAllow) ||
    !kept(input.delegateDeny, group.delegateDeny) ||
    !kept(input.behaviorAllow, group.behaviorAllow) ||
    !kept(input.behaviorDeny, group.behaviorDeny) ||
    added.length + removed.length !== 1
  )
    throw new MessagingError('pairing-unauthorized');
  const row = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ? AND purpose = 'conversation'",
    )
    .get([...added, ...removed][0]!, botSlug) as { body: string } | undefined;
  if (!row) throw new MessagingError('pairing-stale');
  const person = JSON.parse(row.body) as PairingRequest;
  const permissions = effectivePairingPermissions(
    db,
    botSlug,
    reviewer.bindingId,
    reviewer.actorId,
  );
  if (
    !permissions.capabilities.includes('review-pairing') ||
    person.bindingId !== reviewer.bindingId ||
    person.actorId === reviewer.actorId
  )
    throw new MessagingError('pairing-unauthorized');
  const delegable = permissions.delegableCapabilities ?? [];
  if (
    group.behaviorAllow?.length ||
    group.behaviorDeny?.length ||
    [
      ...group.allow,
      ...group.deny,
      ...(group.delegateAllow ?? []),
      ...(group.delegateDeny ?? []),
    ].some((cap) => !delegable.includes(cap))
  )
    throw new MessagingError('pairing-delegation-denied');
}
function assertReviewerBlock(
  db: DatabaseSync,
  botSlug: string,
  input: Extract<SenderAccessInput, { kind: 'block-sender' | 'unblock-sender' }>,
  reviewer: SenderAccessReviewer,
): void {
  const permissions = effectivePairingPermissions(
    db,
    botSlug,
    reviewer.bindingId,
    reviewer.actorId,
  );
  if (
    !permissions.capabilities.includes('review-pairing') ||
    input.bindingId !== reviewer.bindingId ||
    input.actorId === reviewer.actorId
  )
    throw new MessagingError('pairing-unauthorized');
  const delegable = permissions.delegableCapabilities ?? [];
  const target = effectivePairingPermissions(db, botSlug, input.bindingId, input.actorId, {
    includeBlocked: true,
  });
  if (
    [...target.capabilities, ...(target.delegableCapabilities ?? [])].some(
      (cap) => cap !== 'answer' && !delegable.includes(cap),
    )
  )
    throw new MessagingError('pairing-delegation-denied');
}
export function changeSenderAccess(
  db: DatabaseSync,
  botSlug: string,
  raw: SenderAccessInput,
  reviewer?: SenderAccessReviewer,
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
    if (reviewer) assertReviewerExceptions(db, botSlug, input, reviewer);
    changePermissionGroups(db, botSlug, input);
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (input.kind === 'block-sender' || input.kind === 'unblock-sender') {
    if (reviewer) assertReviewerBlock(db, botSlug, input, reviewer);
    if (input.kind === 'block-sender') blockSender(db, botSlug, input, reviewer?.actorId);
    else unblockSender(db, botSlug, input);
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (input.kind === 'block-conversation' || input.kind === 'unblock-conversation') {
    if (reviewer) throw new MessagingError('pairing-unauthorized');
    if (input.kind === 'block-conversation') blockConversationSource(db, botSlug, input);
    else unblockConversationSource(db, botSlug, input);
    bumpSenderPolicy(db, botSlug);
    return;
  }
  if (input.kind === 'create-role' || input.kind === 'edit-role' || input.kind === 'delete-role') {
    if (reviewer) throw new MessagingError('pairing-unauthorized');
    if (input.kind === 'create-role') {
      if (externalUserRoles(db, botSlug).length >= 50) throw new MessagingError('role-capacity');
      changeHostExternalRole(db, {
        kind: 'create',
        botScope: { kind: 'only', botSlugs: [botSlug] },
        name: input.name,
        behavior: input.behavior,
      });
      return;
    }
    const role = readExternalRoleForBot(db, botSlug, input.id);
    if (!role || role.revision !== input.expectedRevision) throw new MessagingError('role-stale');
    if (!isSingleBotRole(role, botSlug)) throw new MessagingError('role-host-managed');
    if (input.kind === 'delete-role') {
      deleteExternalRole(db, role.id);
    } else {
      changeHostExternalRole(db, {
        kind: 'update',
        id: role.id,
        expectedRevision: input.expectedRevision,
        name: input.name,
        behavior: input.behavior,
        capabilities: [
          ...input.capabilities,
          ...role.capabilities.filter((cap) => cap === 'answer'),
        ],
        ...(input.delegableCapabilities
          ? {
              delegableCapabilities: [
                ...input.delegableCapabilities,
                ...(role.delegableCapabilities ?? []).filter((cap) => cap === 'answer'),
              ],
            }
          : {}),
      });
    }
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
    const role = readExternalRoleForBot(db, botSlug, input.roleId);
    if (!role || role.revision !== input.expectedRoleRevision)
      throw new MessagingError('role-stale');
    if (reviewer) {
      const permissions = effectivePairingPermissions(
        db,
        botSlug,
        reviewer.bindingId,
        reviewer.actorId,
      );
      if (
        !permissions.capabilities.includes('review-pairing') ||
        pairing.bindingId !== reviewer.bindingId ||
        pairing.actorId === reviewer.actorId
      )
        throw new MessagingError('pairing-unauthorized');
      const delegable = permissions.delegableCapabilities ?? [];
      const current = readExternalRoleForBot(db, botSlug, pairing.roleId);
      if (
        [role, ...(current ? [current] : [])].some(
          (item) => !canDelegateExternalRole(item, botSlug, delegable),
        )
      )
        throw new MessagingError('pairing-delegation-denied');
    }
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
        reviewedBy: reviewer ? 'paired-reviewer' : 'authenticated-web',
        reviewerActorId: reviewer?.actorId,
      }),
      pairing.id,
      botSlug,
    );
    bumpSenderPolicy(db, botSlug);
    return;
  }
  const policy = readSenderPolicy(db, botSlug);
  if (policy.revision !== input.expectedRevision) throw new MessagingError('sender-policy-stale');
  if (input.kind === 'default-role') {
    if (input.roleId && !readExternalRoleForBot(db, botSlug, input.roleId))
      throw new MessagingError('role-stale');
    db.prepare(
      'INSERT INTO messaging_sender_policies (bot_slug, restricted, revision, default_role_id) VALUES (?, ?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET revision = excluded.revision, default_role_id = excluded.default_role_id',
    ).run(botSlug, policy.restricted ? 1 : 0, policy.revision + 1, input.roleId);
    return;
  }
  db.prepare(
    'INSERT INTO messaging_sender_policies (bot_slug, restricted, revision) VALUES (?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET restricted = excluded.restricted, revision = excluded.revision',
  ).run(botSlug, input.restricted ? 1 : 0, policy.revision + 1);
  if (input.restricted) {
    const pending = db
      .prepare(`SELECT a.source_event_id FROM inbox_admissions a JOIN source_events e USING(source_event_id)
      WHERE a.bot_slug = ? AND a.attempt_state IN ('pending', 'retryable') AND e.source_kind = 'bridge-message'`)
      .all(botSlug) as { source_event_id: string }[];
    for (const row of pending)
      if (sourceAdmission(db, botSlug, row.source_event_id) !== 'wake')
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
  const local = approvedConversationPairing(db, botSlug, sender.bindingId, sender.actorId);
  const [match] = externalContactRoles(db, identity, sender.actorId, local, {
    at: event.at,
    messageId: event.messageId,
    bindingId: sender.bindingId,
  });
  if (!match) return undefined;
  const { pairing, role } = match;
  return {
    bindingId: sender.bindingId,
    providerId: identity.providerId,
    fingerprint: identity.fingerprint,
    actorId: event.actor.id,
    namespace: sender.namespace,
    pairingId: pairing.id,
    pairingRevision: pairing.revision,
    policyRevision: readSenderPolicy(db, botSlug).revision,
    role: { ...role, botSlug },
  };
}
export function externalContactAccess(
  db: DatabaseSync,
  botSlug: string,
  bindingId: string,
  actorId: string,
): ExternalContactAccess {
  const identity = readMessagingIdentity(db, bindingId);
  const empty = {
    canSpeak: false,
    roleIds: [],
    capabilities: [],
    deniedCapabilities: [],
  };
  if (identity.botSlug !== botSlug) throw new MessagingError('identity-unavailable');
  if (identity.revokedAt || !identity.enabled || !platformPeople(identity.platform))
    return { ...empty, status: 'unavailable' };
  if (
    personBlockApplies(db, botSlug, identity, actorId) ||
    senderBlocked(db, botSlug, {
      fingerprint: identity.fingerprint,
      actor: { kind: 'user', id: actorId },
    })
  )
    return { ...empty, status: 'blocked' };
  const local = approvedConversationPairing(db, botSlug, bindingId, actorId);
  const roles = externalContactRoles(db, identity, actorId, local);
  const { capabilities, deniedCapabilities } = effectivePairingPermissions(
    db,
    botSlug,
    bindingId,
    actorId,
  );
  const canSpeak = canExternalContactSpeak(
    readSenderPolicy(db, botSlug).restricted,
    () => roles.length > 0,
  );
  return {
    status: roles.length ? 'paired' : canSpeak ? 'visitor' : 'unpaired',
    canSpeak,
    roleIds: roles.map(({ role }) => role.id),
    capabilities,
    deniedCapabilities,
  };
}

function senderAdmissionAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  if (event.channel === 'tob') return cloudMessageAllowed(db, botSlug, event, false);
  if (externalBotTurnsExhausted(db, botSlug, event)) return false;
  return (
    !chatPairingApplies(event) ||
    canExternalContactSpeak(
      readSenderPolicy(db, botSlug).restricted,
      () => currentSenderRole(db, botSlug, event) !== undefined,
    ) ||
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
function senderContextAllowed(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): boolean {
  if (event.channel === 'tob') return cloudMessageAllowed(db, botSlug, event, true);
  if (senderAdmissionAllowed(db, botSlug, event)) return true;
  if (
    !platformPeople(event.channel)?.groups ||
    event.conversation.kind !== 'group' ||
    event.mentionedAccount
  )
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
          return (
            bridgeChannel(OWNER_HUMAN_CONTEXT, db, ingest.channelId, botSlug, true).type === 'group'
          );
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
export type SenderAdmission = 'wake' | 'context' | 'refused';
export function senderAdmission(
  db: DatabaseSync,
  botSlug: string,
  event: Omit<MessagingInboundEvent, 'text'>,
): SenderAdmission {
  if (sourceBlocked(db, botSlug, event)) return 'refused';
  if (senderAdmissionAllowed(db, botSlug, event)) return 'wake';
  return senderContextAllowed(db, botSlug, event) ? 'context' : 'refused';
}
export function sourceAdmission(
  db: DatabaseSync,
  botSlug: string,
  sourceEventId: string,
): SenderAdmission {
  const row = db
    .prepare(
      "SELECT payload_json FROM source_events WHERE source_event_id = ? AND source_kind = 'bridge-message'",
    )
    .get(sourceEventId) as { payload_json: string } | undefined;
  if (!row) return 'wake';
  const event = (
    JSON.parse(row.payload_json) as { external?: { event?: Omit<MessagingInboundEvent, 'text'> } }
  ).external?.event;
  if (event?.channel === 'tob')
    return cloudMessageAllowed(db, botSlug, event, false)
      ? 'wake'
      : cloudMessageAllowed(db, botSlug, event, true)
        ? 'context'
        : 'refused';
  if (event?.fingerprint && sourceBlocked(db, botSlug, event)) return 'refused';
  if (!readSenderPolicy(db, botSlug).restricted) return 'wake';
  return event ? senderAdmission(db, botSlug, event) : 'refused';
}
