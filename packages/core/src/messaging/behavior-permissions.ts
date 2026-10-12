import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { MessagingError } from './provider.js';
import type { BehaviorPermission, BehaviorChoices } from './behavior-policy.js';
import { assertBehaviorCompatibility } from './behavior-compatibility.js';
export { resolveBehaviorPermissions } from './behavior-policy.js';
export type {
  BehaviorPermission,
  BehaviorChoices,
  EffectiveBehaviorPermission,
} from './behavior-policy.js';

const itemFields = {
  name: z.string().trim().min(1).max(80),
  behavior: z.string().trim().min(1).max(1000),
  excludes: z.array(z.string().uuid()).max(49).optional(),
  expectedExcludedRevisions: z
    .record(z.string().uuid(), z.number().int().positive())
    .refine((value) => Object.keys(value).length <= 49)
    .optional(),
};
export const behaviorPermissionInputs = [
  z.object({ kind: z.literal('create-behavior-permission'), ...itemFields }).strict(),
  z
    .object({
      kind: z.literal('edit-behavior-permission'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      ...itemFields,
    })
    .strict(),
  z
    .object({
      kind: z.literal('delete-behavior-permission'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
] as const;
const inputSchema = z.discriminatedUnion('kind', behaviorPermissionInputs);
export function behaviorPermissions(db: DatabaseSync, botSlug: string): BehaviorPermission[] {
  return (
    db
      .prepare('SELECT body FROM messaging_behavior_permissions WHERE bot_slug = ? ORDER BY rowid')
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as BehaviorPermission);
}
export function changeBehaviorPermission(
  db: DatabaseSync,
  botSlug: string,
  raw: z.infer<typeof inputSchema>,
): void {
  const input = inputSchema.parse(raw);
  const items = behaviorPermissions(db, botSlug);
  const previous =
    input.kind === 'create-behavior-permission'
      ? undefined
      : items.find((item) => item.id === input.id);
  if (
    input.kind !== 'create-behavior-permission' &&
    (!previous || previous.revision !== input.expectedRevision)
  )
    throw new MessagingError('behavior-permission-stale');
  if (input.kind === 'delete-behavior-permission') {
    const references = (
      db
        .prepare('SELECT body FROM messaging_permission_groups WHERE bot_slug = ?')
        .all(botSlug) as { body: string }[]
    ).map((row) => JSON.parse(row.body) as BehaviorChoices);
    if (
      references.some((group) =>
        [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(input.id),
      )
    )
      throw new MessagingError('behavior-permission-in-use');
    db.prepare('DELETE FROM messaging_behavior_permissions WHERE id = ? AND bot_slug = ?').run(
      input.id,
      botSlug,
    );
    for (const peer of items.filter((item) => item.excludes?.includes(input.id)))
      writeItem(db, {
        ...peer,
        excludes: (peer.excludes ?? []).filter((id) => id !== input.id),
        revision: peer.revision + 1,
        updatedAt: new Date().toISOString(),
      });
    return;
  }
  if (!previous && items.length >= 50) throw new MessagingError('behavior-permission-capacity');
  if (
    items.some(
      (item) =>
        item.id !== previous?.id &&
        item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    )
  )
    throw new MessagingError('behavior-permission-name');
  const at = new Date().toISOString();
  const excludes = [...new Set(input.excludes ?? previous?.excludes ?? [])];
  const peerIds = [...new Set([...(previous?.excludes ?? []), ...excludes])];
  for (const id of peerIds) {
    const peer = items.find((item) => item.id === id);
    if (
      id === previous?.id ||
      !peer ||
      (input.excludes !== undefined && input.expectedExcludedRevisions?.[id] !== peer.revision)
    )
      throw new MessagingError('behavior-permission-stale');
  }
  const item: BehaviorPermission = {
    id: previous?.id ?? randomUUID(),
    botSlug,
    name: input.name,
    behavior: input.behavior,
    ...(excludes.length || previous?.excludes ? { excludes } : {}),
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? at,
    updatedAt: at,
  };
  const peers = peerIds.flatMap((id) => {
    const peer = items.find((entry) => entry.id === id)!;
    const has = peer.excludes?.includes(item.id) ?? false;
    const wants = excludes.includes(id);
    return has === wants
      ? []
      : [
          {
            ...peer,
            excludes: wants
              ? [...(peer.excludes ?? []), item.id]
              : (peer.excludes ?? []).filter((id) => id !== item.id),
            revision: peer.revision + 1,
            updatedAt: at,
          },
        ];
  });
  const replacements = new Map([item, ...peers].map((entry) => [entry.id, entry]));
  assertBehaviorCompatibility(db, botSlug, [
    ...items.filter((entry) => !replacements.has(entry.id)),
    ...replacements.values(),
  ]);
  for (const value of replacements.values()) writeItem(db, value);
}
function writeItem(db: DatabaseSync, item: BehaviorPermission): void {
  db.prepare(
    'INSERT INTO messaging_behavior_permissions (id, bot_slug, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',
  ).run(item.id, item.botSlug, JSON.stringify(item));
}
