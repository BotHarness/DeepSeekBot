import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { PairingCapability, PairingRequest } from './pairing.js';
import type { ExternalUserRole } from './sender-access.js';
import { readMessagingIdentity } from './identity.js';
import { MessagingError } from './provider.js';
import { assertBehaviorCompatibility } from './behavior-compatibility.js';
import {
  behaviorPermissions,
  resolveBehaviorPermissions,
  type BehaviorChoices,
  type EffectiveBehaviorPermission,
} from './behavior-permissions.js';

const choices = z.array(z.enum(['approve', 'reject', 'review-pairing'])).max(3);
const delegation = { delegateAllow: choices.optional(), delegateDeny: choices.optional() };
const memberIds = z.array(z.string().uuid()).max(100);
const behaviorChoices = {
  behaviorAllow: z.array(z.string().uuid()).max(50).optional(),
  behaviorDeny: z.array(z.string().uuid()).max(50).optional(),
  expectedBehaviorRevisions: z
    .record(z.string().uuid(), z.number().int().positive())
    .refine((value) => Object.keys(value).length <= 50)
    .optional(),
};
export const permissionGroupInputs = [
  z
    .object({
      kind: z.literal('create-group'),
      bindingId: z.string().min(1).max(200),
      name: z.string().trim().min(1).max(80),
      allow: choices,
      deny: choices,
      ...delegation,
      ...behaviorChoices,
      memberIds,
    })
    .strict(),
  z
    .object({
      kind: z.literal('edit-group'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      allow: choices,
      deny: choices,
      ...delegation,
      ...behaviorChoices,
      memberIds,
    })
    .strict(),
  z
    .object({
      kind: z.literal('delete-group'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('person-permissions'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      allow: choices,
      deny: choices,
      ...delegation,
    })
    .strict(),
] as const;
const inputSchema = z.discriminatedUnion('kind', permissionGroupInputs);
type GroupInput = z.infer<typeof inputSchema>;
export interface PermissionChoices {
  allow: PairingCapability[];
  deny: PairingCapability[];
  delegateAllow?: PairingCapability[];
  delegateDeny?: PairingCapability[];
}
export interface ExternalPermissionGroup extends PermissionChoices, BehaviorChoices {
  id: string;
  botSlug: string;
  bindingId: string;
  name: string;
  memberIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  available?: boolean;
}
export interface PermissionSource extends PermissionChoices {
  kind: 'role' | 'management-pairing' | 'group' | 'person';
  id: string;
  name: string;
  revision: number;
}
export interface EffectivePermissions {
  behaviorPermissions?: EffectiveBehaviorPermission[];
  capabilities: PairingCapability[];
  deniedCapabilities: PairingCapability[];
  delegableCapabilities?: PairingCapability[];
  deniedDelegableCapabilities?: PairingCapability[];
  permissionSources: PermissionSource[];
}
function groups(db: DatabaseSync, botSlug: string): ExternalPermissionGroup[] {
  return (
    db
      .prepare('SELECT body FROM messaging_permission_groups WHERE bot_slug = ? ORDER BY rowid')
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as ExternalPermissionGroup);
}
export function externalPermissionGroups(
  db: DatabaseSync,
  botSlug: string,
): ExternalPermissionGroup[] {
  return groups(db, botSlug).map((group) => {
    try {
      const binding = readMessagingIdentity(db, group.bindingId);
      return {
        ...group,
        available: binding.botSlug === botSlug && binding.enabled && !binding.revokedAt,
      };
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      return { ...group, available: false };
    }
  });
}
function ordinaryPairing(
  db: DatabaseSync,
  botSlug: string,
  id: string,
  bindingId?: string,
): PairingRequest {
  const row = db
    .prepare(
      "SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ? AND purpose = 'conversation' AND status = 'approved'",
    )
    .get(id, botSlug) as { body: string } | undefined;
  if (!row) throw new MessagingError('pairing-stale');
  const pairing = JSON.parse(row.body) as PairingRequest;
  const binding = readMessagingIdentity(db, pairing.bindingId);
  const role = db
    .prepare('SELECT id FROM messaging_external_roles WHERE bot_slug = ? AND id = ?')
    .get(botSlug, pairing.roleId ?? '');
  if (
    !binding.enabled ||
    binding.revokedAt ||
    binding.botSlug !== botSlug ||
    binding.platform !== 'feishu' ||
    (bindingId && bindingId !== binding.id) ||
    !role
  )
    throw new MessagingError('pairing-stale');
  return pairing;
}
export function changePermissionGroups(db: DatabaseSync, botSlug: string, raw: GroupInput): void {
  const input = inputSchema.parse(raw);
  const at = new Date().toISOString();
  if (input.kind === 'person-permissions') {
    const pairing = ordinaryPairing(db, botSlug, input.id);
    if (pairing.revision !== input.expectedRevision) throw new MessagingError('pairing-stale');
    db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ? AND bot_slug = ?').run(
      JSON.stringify({
        ...pairing,
        permissionExceptions: {
          allow: [...new Set(input.allow)],
          deny: [...new Set(input.deny)],
          delegateAllow: [
            ...new Set(input.delegateAllow ?? pairing.permissionExceptions?.delegateAllow ?? []),
          ],
          delegateDeny: [
            ...new Set(input.delegateDeny ?? pairing.permissionExceptions?.delegateDeny ?? []),
          ],
        },
        revision: pairing.revision + 1,
        updatedAt: at,
      }),
      pairing.id,
      botSlug,
    );
    return;
  }
  const existing =
    input.kind === 'create-group'
      ? undefined
      : groups(db, botSlug).find((group) => group.id === input.id);
  if (input.kind !== 'create-group' && (!existing || existing.revision !== input.expectedRevision))
    throw new MessagingError('permission-group-stale');
  if (input.kind === 'delete-group') {
    assertBehaviorCompatibility(
      db,
      botSlug,
      behaviorPermissions(db, botSlug),
      groups(db, botSlug).filter((group) => group.id !== input.id),
    );
    db.prepare('DELETE FROM messaging_permission_groups WHERE id = ? AND bot_slug = ?').run(
      input.id,
      botSlug,
    );
    return;
  }
  const bindingId = input.kind === 'create-group' ? input.bindingId : existing!.bindingId;
  const binding = readMessagingIdentity(db, bindingId);
  if (
    binding.botSlug !== botSlug ||
    binding.platform !== 'feishu' ||
    !binding.enabled ||
    binding.revokedAt
  )
    throw new MessagingError('permission-group-scope');
  if (input.kind === 'create-group' && groups(db, botSlug).length >= 50)
    throw new MessagingError('permission-group-capacity');
  for (const id of input.memberIds) ordinaryPairing(db, botSlug, id, bindingId);
  const behaviorAllow = [...new Set(input.behaviorAllow ?? existing?.behaviorAllow ?? [])];
  const behaviorDeny = [...new Set(input.behaviorDeny ?? existing?.behaviorDeny ?? [])];
  const currentBehavior = behaviorPermissions(db, botSlug);
  for (const id of [...behaviorAllow, ...behaviorDeny]) {
    const item = currentBehavior.find((item) => item.id === id);
    if (
      !item ||
      ((input.behaviorAllow !== undefined || input.behaviorDeny !== undefined) &&
        input.expectedBehaviorRevisions?.[id] !== item.revision)
    )
      throw new MessagingError('behavior-permission-stale');
  }
  const group: ExternalPermissionGroup = {
    id: existing?.id ?? randomUUID(),
    botSlug,
    bindingId,
    name: input.name,
    allow: [...new Set(input.allow)],
    deny: [...new Set(input.deny)],
    delegateAllow: [...new Set(input.delegateAllow ?? existing?.delegateAllow ?? [])],
    delegateDeny: [...new Set(input.delegateDeny ?? existing?.delegateDeny ?? [])],
    memberIds: [...new Set(input.memberIds)],
    behaviorAllow,
    behaviorDeny,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
  assertBehaviorCompatibility(db, botSlug, currentBehavior, [
    ...groups(db, botSlug).filter((entry) => entry.id !== group.id),
    group,
  ]);
  db.prepare(
    'INSERT INTO messaging_permission_groups (id, bot_slug, binding_id, body) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',
  ).run(group.id, botSlug, bindingId, JSON.stringify(group));
}
export function effectivePairingPermissions(
  db: DatabaseSync,
  botSlug: string,
  bindingId: string,
  actorId: string,
): EffectivePermissions {
  const empty: EffectivePermissions = {
    capabilities: [],
    deniedCapabilities: [],
    permissionSources: [],
  };
  const binding = readMessagingIdentity(db, bindingId);
  if (
    !binding.enabled ||
    binding.revokedAt ||
    binding.botSlug !== botSlug ||
    binding.platform !== 'feishu'
  )
    return empty;
  const pairings = (
    db
      .prepare(
        "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND status = 'approved'",
      )
      .all(botSlug, bindingId, actorId) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as PairingRequest);
  const permissionSources: PermissionSource[] = pairings
    .filter((p) => p.purpose !== 'conversation')
    .map((p) => ({
      kind: 'management-pairing',
      id: p.id,
      name: p.accountName,
      revision: p.revision,
      allow: p.capabilities,
      deny: [],
    }));
  const person = pairings.find((p) => p.purpose === 'conversation');
  let currentBehavior: EffectiveBehaviorPermission[] = [];
  if (person) {
    const row = db
      .prepare('SELECT body FROM messaging_external_roles WHERE bot_slug = ? AND id = ?')
      .get(botSlug, person.roleId ?? '') as { body: string } | undefined;
    if (row) {
      const role = JSON.parse(row.body) as ExternalUserRole;
      currentBehavior = resolveBehaviorPermissions(
        behaviorPermissions(db, botSlug),
        groups(db, botSlug).filter(
          (group) => group.bindingId === bindingId && group.memberIds.includes(person.id),
        ),
      );
      permissionSources.push({
        kind: 'role',
        id: role.id,
        name: role.name,
        revision: role.revision,
        allow: role.capabilities,
        deny: [],
        delegateAllow: role.delegableCapabilities ?? [],
      });
      for (const group of groups(db, botSlug).filter(
        (g) => g.bindingId === bindingId && g.memberIds.includes(person.id),
      ))
        permissionSources.push({
          kind: 'group',
          id: group.id,
          name: group.name,
          revision: group.revision,
          allow: group.allow,
          deny: group.deny,
          delegateAllow: group.delegateAllow ?? [],
          delegateDeny: group.delegateDeny ?? [],
        });
      if (person.permissionExceptions)
        permissionSources.push({
          kind: 'person',
          id: person.id,
          name: person.actorName ?? person.actorId,
          revision: person.revision,
          ...person.permissionExceptions,
        });
    }
  }
  const deniedCapabilities = [...new Set(permissionSources.flatMap((source) => source.deny))];
  const deniedDelegableCapabilities = [
    ...new Set(permissionSources.flatMap((source) => source.delegateDeny ?? [])),
  ];
  return {
    ...(currentBehavior.length ? { behaviorPermissions: currentBehavior } : {}),
    capabilities: [...new Set(permissionSources.flatMap((source) => source.allow))].filter(
      (cap) => !deniedCapabilities.includes(cap),
    ),
    deniedCapabilities,
    delegableCapabilities: [
      ...new Set(permissionSources.flatMap((source) => source.delegateAllow ?? [])),
    ].filter((cap) => !deniedDelegableCapabilities.includes(cap)),
    deniedDelegableCapabilities,
    permissionSources,
  };
}
