import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  pairingCapabilities,
  type HostExternalRole,
  type HostExternalRoleChange,
  type PairingCapability,
} from '@botharness/host-protocol/external-roles';
import { z } from 'zod';
import { coversBot } from '../../team-policy/external-contact.js';
import { MessagingError } from '../provider.js';

const name = z.string().trim().min(1).max(80);
const behavior = z.string().trim().max(2000);
const capabilities = z
  .array(z.enum(pairingCapabilities))
  .max(pairingCapabilities.length)
  .transform((values) => [...new Set(values)]);
const botScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z
    .object({
      kind: z.literal('only'),
      botSlugs: z
        .array(z.string().min(1).max(200))
        .max(10000)
        .transform((slugs) => [...new Set(slugs)]),
    })
    .strict(),
]);
const policy = z
  .array(
    z
      .object({
        topic: z.string().trim().min(1).max(80),
        text: z.string().trim().min(1).max(1000),
        effect: z.enum(['allow', 'ask', 'deny']),
      })
      .strict(),
  )
  .max(100);
const roleSettings = z.object({
  name,
  botScope,
  behavior,
  policy,
  capabilities,
  deniedCapabilities: capabilities,
  delegableCapabilities: capabilities.optional(),
});
const storedRole = roleSettings
  .extend({
    id: z.string(),
    revision: z.number().int().positive(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .transform(({ createdAt, updatedAt, ...role }): HostExternalRole => ({
    ...role,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }));
export const externalRoleChangeSchema = z.discriminatedUnion('kind', [
  roleSettings
    .partial()
    .extend({ kind: z.literal('create'), name, botScope })
    .strict(),
  roleSettings
    .partial()
    .extend({
      kind: z.literal('update'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);

type RoleRow = { body: string };

function fromRow({ body }: RoleRow): HostExternalRole {
  return storedRole.parse(JSON.parse(body));
}

export function hostExternalRoles(db: DatabaseSync): HostExternalRole[] {
  return (
    db.prepare('SELECT body FROM messaging_host_external_roles ORDER BY rowid').all() as RoleRow[]
  ).map(fromRow);
}

export function readExternalRole(
  db: DatabaseSync,
  id: string | undefined,
): HostExternalRole | undefined {
  if (!id) return undefined;
  const row = db.prepare('SELECT body FROM messaging_host_external_roles WHERE id = ?').get(id) as
    | RoleRow
    | undefined;
  return row && fromRow(row);
}

export function isSingleBotRole(
  role: Pick<HostExternalRole, 'botScope'>,
  botSlug: string,
): boolean {
  return (
    role.botScope.kind === 'only' &&
    role.botScope.botSlugs.length === 1 &&
    role.botScope.botSlugs[0] === botSlug
  );
}

export function canDelegateExternalRole(
  role: Pick<
    HostExternalRole,
    'botScope' | 'capabilities' | 'deniedCapabilities' | 'delegableCapabilities'
  >,
  botSlug: string,
  delegable: readonly PairingCapability[],
): boolean {
  return (
    isSingleBotRole(role, botSlug) &&
    [...role.capabilities, ...role.deniedCapabilities, ...(role.delegableCapabilities ?? [])].every(
      (capability) => delegable.includes(capability),
    )
  );
}

export function readExternalRoleForBot(db: DatabaseSync, botSlug: string, id: string | undefined) {
  const role = readExternalRole(db, id);
  return role && coversBot(role.botScope, botSlug) ? role : undefined;
}

export function changeHostExternalRole(
  db: DatabaseSync,
  input: HostExternalRoleChange,
): HostExternalRole {
  const previous = input.kind === 'update' ? readExternalRole(db, input.id) : undefined;
  if (input.kind === 'update' && previous?.revision !== input.expectedRevision)
    throw new MessagingError('role-stale');
  const at = new Date().toISOString();
  const role = storedRole.parse({
    id: previous?.id ?? randomUUID(),
    name: input.name ?? previous?.name,
    botScope: input.botScope ?? previous?.botScope,
    behavior: input.behavior ?? previous?.behavior ?? '',
    policy: input.policy ?? previous?.policy ?? [],
    capabilities: input.capabilities ?? previous?.capabilities ?? [],
    deniedCapabilities: input.deniedCapabilities ?? previous?.deniedCapabilities ?? [],
    delegableCapabilities: input.delegableCapabilities ?? previous?.delegableCapabilities,
    createdAt: previous?.createdAt ?? at,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: at,
  });
  db.prepare(`INSERT INTO messaging_host_external_roles (id, body) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET body = excluded.body`).run(role.id, JSON.stringify(role));
  return role;
}

export function deleteExternalRole(db: DatabaseSync, id: string): void {
  if (
    db
      .prepare(`SELECT 1 FROM messaging_pairings WHERE status IN ('pending', 'approved')
      AND json_extract(body, '$.roleId') = ? LIMIT 1`)
      .get(id)
  )
    throw new MessagingError('role-in-use');
  db.prepare('DELETE FROM messaging_host_external_roles WHERE id = ?').run(id);
  db.prepare(
    'UPDATE messaging_sender_policies SET default_role_id = NULL, revision = revision + 1 WHERE default_role_id = ?',
  ).run(id);
}
