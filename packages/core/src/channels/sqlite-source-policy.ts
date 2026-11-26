import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  BOT_SOURCE_DEFAULTS,
  type BotSourceClass,
  type BotSourcePolicy,
  type BotSourceWake,
} from './source-policy.js';

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

export function createSqliteSourcePolicyResolver(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
) {
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
    const row: SourcePolicyRow =
      stored?.actor_kind === 'built-in' && sourceClass === 'group-ordinary'
        ? {
            ...stored,
            digest_count: stored.wake_mode === 'digest' ? digestCount : stored.digest_count,
            digest_interval_seconds:
              stored.wake_mode === 'digest'
                ? digestIntervalSeconds
                : stored.digest_interval_seconds,
          }
        : (stored ?? {
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
          });
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
              SELECT digest_count, digest_interval_seconds, actor_kind
                FROM bot_source_policy_revisions
               WHERE bot_slug = ? AND source_class = 'group-ordinary' AND wake_mode = 'digest'
               ORDER BY revision DESC LIMIT 1
            `)
            .get(botSlug) as
            | { digest_count: number; digest_interval_seconds: number; actor_kind: string }
            | undefined)
        : undefined;
    if (previousDigest?.actor_kind === 'built-in') {
      previousDigest.digest_count = digestCount!;
      previousDigest.digest_interval_seconds = digestIntervalSeconds!;
    }
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
  return {
    resolveIn,
    readGroupOrdinary(botSlug: string): BotSourcePolicy {
      return database.read((db) => resolveIn(db, botSlug, 'group-ordinary', false));
    },
  };
}
