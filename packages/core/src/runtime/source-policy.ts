import type { DatabaseSync } from 'node:sqlite';

import { DEFAULT_GROUP_WAKE_POLICY, type GroupWakePolicy } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const BOT_SOURCE_DEFAULTS = {
  'human-dm': { wake: 'immediate', delivery: 'steer' },
  'bot-dm': { wake: 'immediate', delivery: 'steer' },
  'group-mention': { wake: 'immediate', delivery: 'steer' },
  'group-ordinary': {
    wake: 'digest',
    digestCount: DEFAULT_GROUP_WAKE_POLICY.count,
    digestIntervalSeconds: DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
  },
  'group-invite': { wake: 'immediate' },
  'group-join-request': { wake: 'immediate' },
  'group-join-decision': { wake: 'immediate' },
  'assignment-report': { wake: 'conditional' },
  'assignment-lifecycle': { wake: 'immediate' },
} as const;

export type BotSourceClass = keyof typeof BOT_SOURCE_DEFAULTS;
export type BotSourceWake = 'immediate' | 'digest' | 'conditional' | 'mentions' | 'silent';
export type BotSourcePolicyEditor = { kind: 'human' } | { kind: 'bot'; botSlug: string };
export type BotSourcePolicyActor =
  | { kind: 'built-in' }
  | { kind: 'template' }
  | BotSourcePolicyEditor;

export interface BotSourcePolicy {
  sourceClass: BotSourceClass;
  admission: 'admit';
  wake: BotSourceWake;
  delivery: 'steer' | 'turn';
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: BotSourcePolicyActor;
  changedAt: string;
  overrideActive: boolean;
  recentWakeCount: number;
}

export interface BotSourcePolicyStore {
  resolveIn(database: DatabaseSync, botSlug: string, sourceClass: BotSourceClass): BotSourcePolicy;
  list(botSlug: string): BotSourcePolicy[];
  readGroupOrdinary(botSlug: string): BotSourcePolicy;
  setAssignmentReport(
    botSlug: string,
    wake: 'conditional' | 'immediate',
    actor: BotSourcePolicyEditor,
  ): BotSourcePolicy;
  resetAssignmentReport(botSlug: string, actor: BotSourcePolicyEditor): BotSourcePolicy;
  setGroupOrdinary(
    botSlug: string,
    wake: 'immediate' | 'digest' | 'mentions' | 'silent',
    digestCount: number,
    digestIntervalSeconds: number,
    actor: BotSourcePolicyEditor,
  ): BotSourcePolicy;
  resetGroupOrdinary(botSlug: string, actor: BotSourcePolicyEditor): BotSourcePolicy;
  setImmediateDelivery(
    botSlug: string,
    sourceClass: 'human-dm' | 'bot-dm' | 'group-mention',
    delivery: 'steer' | 'turn',
    actor: BotSourcePolicyEditor,
  ): BotSourcePolicy;
  resetImmediateDelivery(
    botSlug: string,
    sourceClass: 'human-dm' | 'bot-dm' | 'group-mention',
    actor: BotSourcePolicyEditor,
  ): BotSourcePolicy;
}

export function defaultGroupWakePolicy(policy: BotSourcePolicy): GroupWakePolicy {
  if (
    policy.sourceClass !== 'group-ordinary' ||
    (policy.wake !== 'immediate' &&
      policy.wake !== 'digest' &&
      policy.wake !== 'mentions' &&
      policy.wake !== 'silent') ||
    (policy.wake === 'digest' &&
      (policy.digestCount === undefined || policy.digestIntervalSeconds === undefined))
  )
    throw new Error('Group ordinary source default is invalid');
  return {
    mode: policy.wake === 'immediate' ? 'all' : policy.wake,
    count: policy.digestCount ?? DEFAULT_GROUP_WAKE_POLICY.count,
    intervalSeconds: policy.digestIntervalSeconds ?? DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
    revision: 0,
  };
}

interface SourcePolicyRow {
  revision: number;
  changed_at: string;
  admission_mode: string;
  wake_mode: string;
  actor_kind: string;
  actor_bot_slug: string | null;
  digest_count: number | null;
  digest_interval_seconds: number | null;
  override_active: number;
  delivery: string;
}

export function createBotSourcePolicyStore(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): BotSourcePolicyStore {
  const resolveIn = (
    db: DatabaseSync,
    botSlug: string,
    sourceClass: BotSourceClass,
    persistDefault = true,
  ): BotSourcePolicy => {
    const builtIn = BOT_SOURCE_DEFAULTS[sourceClass];
    const digestCount = 'digestCount' in builtIn ? builtIn.digestCount : null;
    const digestIntervalSeconds =
      'digestIntervalSeconds' in builtIn ? builtIn.digestIntervalSeconds : null;
    if (persistDefault)
      db.prepare(`
      INSERT OR IGNORE INTO bot_source_policy_revisions
        (bot_slug, source_class, revision, actor_kind, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds, delivery)
      VALUES (?, ?, 1, 'built-in', ?, 'admit', ?, ?, ?, ?)
    `).run(
        botSlug,
        sourceClass,
        now().toISOString(),
        builtIn.wake,
        digestCount,
        digestIntervalSeconds,
        'delivery' in builtIn ? builtIn.delivery : 'steer',
      );
    const stored = db
      .prepare(`
        SELECT revision, changed_at, admission_mode, wake_mode, actor_kind,
               actor_bot_slug, digest_count, digest_interval_seconds, override_active, delivery
          FROM bot_source_policy_revisions
         WHERE bot_slug = ? AND source_class = ?
         ORDER BY revision DESC LIMIT 1
      `)
      .get(botSlug, sourceClass) as SourcePolicyRow | undefined;
    const row: SourcePolicyRow = stored ?? {
      revision: 1,
      changed_at: now().toISOString(),
      admission_mode: 'admit',
      wake_mode: builtIn.wake,
      actor_kind: 'built-in',
      actor_bot_slug: null,
      digest_count: digestCount,
      digest_interval_seconds: digestIntervalSeconds,
      override_active: 0,
      delivery: 'delivery' in builtIn ? builtIn.delivery : 'steer',
    };
    if (row.admission_mode !== 'admit')
      throw new Error(`Protected ${sourceClass} admission mode is invalid`);
    if (sourceClass === 'assignment-report') {
      if (
        (row.wake_mode !== 'conditional' && row.wake_mode !== 'immediate') ||
        row.digest_count !== null ||
        row.digest_interval_seconds !== null
      )
        throw new Error('Assignment report source wake mode is invalid');
    } else if (sourceClass === 'group-ordinary') {
      if (
        (row.wake_mode !== 'immediate' &&
          row.wake_mode !== 'digest' &&
          row.wake_mode !== 'mentions' &&
          row.wake_mode !== 'silent') ||
        (row.wake_mode === 'digest'
          ? !Number.isSafeInteger(row.digest_count) ||
            row.digest_count! < 1 ||
            row.digest_count! > 100 ||
            !Number.isSafeInteger(row.digest_interval_seconds) ||
            row.digest_interval_seconds! < 1 ||
            row.digest_interval_seconds! > 3600
          : row.digest_count !== null || row.digest_interval_seconds !== null)
      )
        throw new Error('Group ordinary source wake mode is invalid');
    } else if (
      sourceClass === 'human-dm' ||
      sourceClass === 'bot-dm' ||
      sourceClass === 'group-mention'
    ) {
      if (
        row.wake_mode !== 'immediate' ||
        (row.delivery !== 'steer' && row.delivery !== 'turn') ||
        row.digest_count !== null ||
        row.digest_interval_seconds !== null
      ) {
        throw new Error(`Protected ${sourceClass} source policy is invalid`);
      }
    } else if (
      row.wake_mode !== builtIn.wake ||
      row.override_active !== 0 ||
      row.digest_count !== digestCount ||
      row.digest_interval_seconds !== digestIntervalSeconds
    ) {
      throw new Error(`Protected ${sourceClass} source policy is invalid`);
    }
    if (
      (row.override_active !== 0 && row.override_active !== 1) ||
      (row.actor_kind === 'built-in' && row.override_active !== 0) ||
      (row.actor_kind !== 'built-in' &&
        row.actor_kind !== 'human' &&
        row.actor_kind !== 'bot' &&
        row.actor_kind !== 'template') ||
      (row.actor_kind === 'bot' && row.actor_bot_slug !== botSlug)
    )
      throw new Error('Source policy actor is invalid');
    const previousDigest =
      sourceClass === 'group-ordinary' && row.wake_mode !== 'digest'
        ? (db
            .prepare(`
              SELECT digest_count, digest_interval_seconds
                FROM bot_source_policy_revisions
               WHERE bot_slug = ? AND source_class = 'group-ordinary' AND wake_mode = 'digest'
               ORDER BY revision DESC LIMIT 1
            `)
            .get(botSlug) as { digest_count: number; digest_interval_seconds: number } | undefined)
        : undefined;
    const effectiveDigestCount = row.digest_count ?? previousDigest?.digest_count ?? null;
    const effectiveDigestIntervalSeconds =
      row.digest_interval_seconds ?? previousDigest?.digest_interval_seconds ?? null;
    const count = db
      .prepare(`
      SELECT COUNT(*) AS count FROM bot_source_wake_attempts
       WHERE bot_slug = ? AND source_class = ? AND started_at >= ?
    `)
      .get(
        botSlug,
        sourceClass,
        new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ) as { count: number };
    return {
      sourceClass,
      admission: 'admit',
      wake: row.wake_mode as BotSourceWake,
      delivery: row.delivery === 'turn' ? 'turn' : 'steer',
      ...(effectiveDigestCount === null ? {} : { digestCount: effectiveDigestCount }),
      ...(effectiveDigestIntervalSeconds === null
        ? {}
        : { digestIntervalSeconds: effectiveDigestIntervalSeconds }),
      revision: row.revision,
      lastActor:
        row.actor_kind === 'bot'
          ? { kind: 'bot', botSlug: botSlug }
          : { kind: row.actor_kind as 'built-in' | 'human' | 'template' },
      changedAt: row.changed_at,
      overrideActive: row.override_active === 1,
      recentWakeCount: count.count,
    };
  };
  const changeSourcePolicy = (
    botSlug: string,
    sourceClass: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
    wake: BotSourceWake,
    digestCount: number | null,
    digestIntervalSeconds: number | null,
    actor: BotSourcePolicyEditor,
    overrideActive: boolean,
    delivery: 'steer' | 'turn' = 'steer',
  ): BotSourcePolicy => {
    if (actor.kind === 'bot' && actor.botSlug !== botSlug)
      throw new Error('A PersonaBot may edit only its own source policy');
    return database.transaction((db) => {
      const current = resolveIn(db, botSlug, sourceClass);
      db.prepare(`
      INSERT INTO bot_source_policy_revisions
        (bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active,
         delivery)
      VALUES (?, ?, ?, ?, ?, ?, 'admit', ?, ?, ?, ?, ?)
    `).run(
        botSlug,
        sourceClass,
        current.revision + 1,
        actor.kind,
        actor.kind === 'bot' ? actor.botSlug : null,
        now().toISOString(),
        wake,
        wake === 'digest' ? digestCount : null,
        wake === 'digest' ? digestIntervalSeconds : null,
        overrideActive ? 1 : 0,
        delivery,
      );
      return resolveIn(db, botSlug, sourceClass);
    });
  };
  return {
    resolveIn,
    readGroupOrdinary(botSlug) {
      return database.read((db) => resolveIn(db, botSlug, 'group-ordinary', false));
    },
    list(botSlug) {
      return database.transaction((db) =>
        (Object.keys(BOT_SOURCE_DEFAULTS) as BotSourceClass[]).map((sourceClass) =>
          resolveIn(db, botSlug, sourceClass),
        ),
      );
    },
    setAssignmentReport(botSlug, wake, actor) {
      if (wake !== 'conditional' && wake !== 'immediate')
        throw new Error('Assignment report wake must be conditional or immediate');
      return changeSourcePolicy(botSlug, 'assignment-report', wake, null, null, actor, true);
    },
    resetAssignmentReport(botSlug, actor) {
      return changeSourcePolicy(
        botSlug,
        'assignment-report',
        'conditional',
        null,
        null,
        actor,
        false,
      );
    },
    setGroupOrdinary(botSlug, wake, digestCount, digestIntervalSeconds, actor) {
      if (wake !== 'immediate' && wake !== 'digest' && wake !== 'mentions' && wake !== 'silent')
        throw new Error('Group ordinary wake must be immediate, digest, mentions, or silent');
      if (
        !Number.isSafeInteger(digestCount) ||
        digestCount < 1 ||
        digestCount > 100 ||
        !Number.isSafeInteger(digestIntervalSeconds) ||
        digestIntervalSeconds < 1 ||
        digestIntervalSeconds > 3600
      )
        throw new Error('Group ordinary digest bounds are invalid');
      return changeSourcePolicy(
        botSlug,
        'group-ordinary',
        wake,
        digestCount,
        digestIntervalSeconds,
        actor,
        true,
      );
    },
    setImmediateDelivery(botSlug, sourceClass, delivery, actor) {
      if (delivery !== 'steer' && delivery !== 'turn')
        throw new Error('Delivery must be steer or turn');
      return changeSourcePolicy(
        botSlug,
        sourceClass,
        'immediate',
        null,
        null,
        actor,
        true,
        delivery,
      );
    },
    resetImmediateDelivery(botSlug, sourceClass, actor) {
      return changeSourcePolicy(botSlug, sourceClass, 'immediate', null, null, actor, false);
    },
    resetGroupOrdinary(botSlug, actor) {
      const builtIn = BOT_SOURCE_DEFAULTS['group-ordinary'];
      return changeSourcePolicy(
        botSlug,
        'group-ordinary',
        builtIn.wake,
        builtIn.digestCount,
        builtIn.digestIntervalSeconds,
        actor,
        false,
      );
    },
  };
}
