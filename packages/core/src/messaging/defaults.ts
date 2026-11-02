import type { ChannelRecord } from '../channels/channel.js';
import { defaultGroupWakePolicy, type BotSourcePolicy } from '../runtime/source-policy.js';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { MessagingError } from './provider.js';

export const messagingDefaultsPlatform = z.enum(['feishu', 'slack', 'discord', 'weixin']);
export type MessagingDefaultsPlatform = z.infer<typeof messagingDefaultsPlatform>;

export const messagingDefaultsInput = z
  .object({
    platform: messagingDefaultsPlatform,
    expectedRevision: z.number().int().min(0),
    collection: z.enum(['mentions', 'all']),
    wake: z.enum(['immediate', 'digest', 'mentions', 'silent']),
    count: z.number().int().min(1).max(100),
    intervalSeconds: z.number().int().min(1).max(86400),
    identityEnabled: z.boolean(),
    typingEnabled: z.boolean().optional(),
    newConversations: z.enum(['auto', 'ask']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.platform === 'weixin'
        ? value.collection === 'all' &&
          value.wake === 'immediate' &&
          (value.newConversations === undefined || value.newConversations === 'auto')
        : value.typingEnabled === undefined,
    { message: 'Defaults must match the qualified platform capabilities' },
  );
export type MessagingDefaultsInput = z.infer<typeof messagingDefaultsInput>;
export type MessagingDefaults<Platform extends string = MessagingDefaultsPlatform> = Omit<
  MessagingDefaultsInput,
  'expectedRevision' | 'platform'
> & {
  platform: Platform;
  revision: number;
  changedAt: string;
};
export function messagingDefaults<Platform extends string = 'feishu'>(
  db: DatabaseSync,
  platform?: Platform,
): MessagingDefaults<Platform> {
  const key = platform ?? 'feishu';
  const row = db
    .prepare(
      'SELECT body FROM messaging_default_revisions WHERE platform = ? ORDER BY revision DESC LIMIT 1',
    )
    .get(key) as { body: string } | undefined;
  return row
    ? (JSON.parse(row.body) as MessagingDefaults<Platform>)
    : {
        platform: key as Platform,
        collection: key === 'weixin' ? 'all' : 'mentions',
        wake: key === 'weixin' ? 'immediate' : 'digest',
        count: 5,
        intervalSeconds: 30,
        identityEnabled: true,
        ...(key === 'weixin' ? { typingEnabled: true } : {}),
        newConversations: 'auto',
        revision: 0,
        changedAt: '',
      };
}
export function commitMessagingDefaults(
  db: DatabaseSync,
  input: MessagingDefaultsInput,
): MessagingDefaults {
  const parsed = messagingDefaultsInput.parse(input);
  const prior = messagingDefaults(db, parsed.platform);
  if (prior.revision !== parsed.expectedRevision) throw new MessagingError('defaults-stale');
  const { expectedRevision: _expected, ...preferences } = parsed;
  const value = {
    ...preferences,
    newConversations: preferences.newConversations ?? prior.newConversations ?? 'auto',
    ...(parsed.platform === 'weixin'
      ? { typingEnabled: preferences.typingEnabled ?? prior.typingEnabled ?? true }
      : {}),
    revision: prior.revision + 1,
    changedAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO messaging_default_revisions (platform, revision, body) VALUES (?, ?, ?)',
  ).run(value.platform, value.revision, JSON.stringify(value));
  if (!prior.identityEnabled && value.identityEnabled) {
    if (value.platform === 'weixin')
      db.prepare(
        'UPDATE messaging_bindings SET receive_after = ? WHERE platform = ? AND enabled_inherited = 1 AND revoked_at IS NULL',
      ).run(value.changedAt, value.platform);
    const rows = db
      .prepare(
        'SELECT g.id, g.body FROM messaging_grants g JOIN messaging_bindings b ON b.id = g.binding_id WHERE b.platform = ? AND b.enabled_inherited = 1 AND b.revoked_at IS NULL AND g.revoked_at IS NULL',
      )
      .all(value.platform) as { id: string; body: string }[];
    for (const row of rows)
      db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
        JSON.stringify({ ...JSON.parse(row.body), receiveAfter: value.changedAt }),
        row.id,
      );
  }
  if (prior.typingEnabled !== value.typingEnabled)
    db.prepare(
      'UPDATE messaging_bindings SET revision = revision + 1 WHERE platform = ? AND revoked_at IS NULL AND ((enabled_inherited = 1 AND ? = 1) OR (typing_inherited = 1 AND ? = 1))',
    ).run(value.platform, Number(prior.identityEnabled !== value.identityEnabled), 1);
  else if (prior.identityEnabled !== value.identityEnabled)
    db.prepare(
      'UPDATE messaging_bindings SET revision = revision + 1 WHERE platform = ? AND enabled_inherited = 1 AND revoked_at IS NULL',
    ).run(value.platform);
  return value;
}

const WAKE_LOUDNESS: Record<string, number> = {
  silent: 0,
  context: 0,
  mentions: 1,
  digest: 2,
  conditional: 2,
  all: 3,
  immediate: 3,
};

export function botWakeCeiling(
  rule: BotSourcePolicy | undefined,
): 'mentions' | 'silent' | undefined {
  return rule?.overrideActive &&
    rule.sourceClass === 'group-ordinary' &&
    (rule.wake === 'mentions' || rule.wake === 'silent')
    ? rule.wake
    : undefined;
}

export function exceedsBotWakeCeiling(wake: string, rule: BotSourcePolicy | undefined): boolean {
  const ceiling = botWakeCeiling(rule);
  return ceiling !== undefined && (WAKE_LOUDNESS[wake] ?? 3) > WAKE_LOUDNESS[ceiling]!;
}

export function externalMemberWake(
  channel: ChannelRecord,
  botSlug: string,
  rule: BotSourcePolicy | undefined,
  defaults: MessagingDefaults<string>,
) {
  const channelCustom = channel.wakePolicies?.[botSlug];
  const custom =
    channelCustom && !exceedsBotWakeCeiling(channelCustom.mode, rule) ? channelCustom : undefined;
  const policy =
    custom ??
    (rule?.overrideActive
      ? defaultGroupWakePolicy(rule)
      : {
          mode: defaults.wake === 'immediate' ? ('all' as const) : defaults.wake,
          count: defaults.count,
          intervalSeconds: defaults.intervalSeconds,
          revision: 0,
        });
  return {
    policy,
    origin: custom
      ? ('channel' as const)
      : rule?.overrideActive
        ? ('bot' as const)
        : ('platform' as const),
    defaultRevision: defaults.revision,
  };
}
