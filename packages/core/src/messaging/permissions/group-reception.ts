import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { BotSourcePolicyEditor } from '../../runtime/source-policy.js';
import { messagingDefaults } from '../defaults.js';
import { MessagingError } from '../provider.js';
import { DEFAULT_GROUP_WAKE_POLICY } from '../../channels/channel.js';

export const groupReceptionInput = z
  .object({
    collection: z.enum(['mentions', 'all']),
    wake: z.enum(['immediate', 'digest', 'mentions', 'silent']),
    count: z.number().int().min(1).max(100),
    intervalSeconds: z.number().int().min(1).max(86400),
    inheritance: z.enum(['inherit', 'custom']).optional(),
    expectedRevision: z.number().int().min(0).optional(),
    expectedDefaultRevision: z.number().int().min(0).optional(),
  })
  .strict();

export type GroupReceptionInput = z.infer<typeof groupReceptionInput>;
export interface GroupReceptionPolicy extends GroupReceptionInput {
  revision: number;
  defaultRevision?: number;
  changedAt: string;
  editor: BotSourcePolicyEditor | { kind: 'built-in' };
}

export function groupReceptionPolicy(db: DatabaseSync, grantId: string): GroupReceptionPolicy {
  const row = db
    .prepare(
      'SELECT body FROM messaging_group_policy_revisions WHERE grant_id = ? ORDER BY revision DESC LIMIT 1',
    )
    .get(grantId) as { body: string } | undefined;
  const grant = db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(grantId) as
    | { body: string }
    | undefined;
  const value = grant
    ? (JSON.parse(grant.body) as {
        platform: string;
        receptionInheritance?: string;
        channelBridge?: { collection: 'mentions' | 'all'; collectionInheritance?: string };
      })
    : undefined;
  const defaults = messagingDefaults(db, value?.platform);
  const stored = row ? (JSON.parse(row.body) as GroupReceptionPolicy) : undefined;
  if ((stored?.inheritance ?? value?.receptionInheritance ?? 'inherit') === 'inherit')
    return {
      collection:
        value?.channelBridge && value.channelBridge.collectionInheritance !== 'inherit'
          ? value.channelBridge.collection
          : defaults.collection,
      wake: defaults.wake,
      count: defaults.count,
      intervalSeconds: defaults.intervalSeconds,
      inheritance: 'inherit',
      defaultRevision: defaults.revision,
      revision: stored?.revision ?? 0,
      changedAt: stored?.changedAt ?? '',
      editor: stored?.editor ?? { kind: 'built-in' },
    };
  return stored
    ? {
        ...stored,
        collection: value?.channelBridge
          ? value.channelBridge.collectionInheritance === 'inherit'
            ? defaults.collection
            : value.channelBridge.collection
          : stored.collection,
        inheritance: 'custom',
        defaultRevision: defaults.revision,
      }
    : {
        inheritance: 'custom',
        defaultRevision: defaults.revision,
        revision: 0,
        changedAt: '',
        editor: { kind: 'built-in' },
        collection: 'mentions',
        wake: 'digest',
        count: DEFAULT_GROUP_WAKE_POLICY.count,
        intervalSeconds: DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
      };
}

export function commitGroupReceptionPolicy(
  db: DatabaseSync,
  grantId: string,
  input: GroupReceptionInput,
  editor: BotSourcePolicyEditor,
): GroupReceptionPolicy {
  const parsed = groupReceptionInput.parse(input);
  const previous = groupReceptionPolicy(db, grantId);
  if (
    (parsed.expectedRevision !== undefined && parsed.expectedRevision !== previous.revision) ||
    (parsed.expectedDefaultRevision !== undefined &&
      parsed.expectedDefaultRevision !== previous.defaultRevision)
  )
    throw new MessagingError('defaults-stale');
  const { expectedRevision: _revision, expectedDefaultRevision: _default, ...preferences } = parsed;
  const policy: GroupReceptionPolicy = {
    ...preferences,
    inheritance: parsed.inheritance ?? 'custom',
    revision: groupReceptionPolicy(db, grantId).revision + 1,
    changedAt: new Date().toISOString(),
    editor,
  };
  db.prepare(
    'INSERT INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, ?, ?)',
  ).run(grantId, policy.revision, JSON.stringify(policy));
  return groupReceptionPolicy(db, grantId);
}

export function initializeGroupReceptionPolicy(db: DatabaseSync, grantId: string): void {
  const policy = groupReceptionPolicy(db, grantId);
  if (policy.revision !== 0) return;
  const initial = { ...policy, changedAt: new Date().toISOString() };
  db.prepare(
    'INSERT OR IGNORE INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, 0, ?)',
  ).run(grantId, JSON.stringify(initial));
}
