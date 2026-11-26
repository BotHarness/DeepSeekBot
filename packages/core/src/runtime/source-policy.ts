import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  BOT_SOURCE_DEFAULTS,
  type BotSourceClass,
  type BotSourcePolicy,
  type BotSourcePolicyEditor,
  type BotSourceWake,
} from '../channels/source-policy.js';
import { createSqliteSourcePolicyResolver } from '../channels/sqlite-source-policy.js';

export {
  BOT_SOURCE_DEFAULTS,
  defaultGroupWakePolicy,
  type BotSourceClass,
  type BotSourcePolicy,
  type BotSourcePolicyActor,
  type BotSourcePolicyEditor,
  type BotSourceWake,
} from '../channels/source-policy.js';

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

export function createBotSourcePolicyStore(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): BotSourcePolicyStore {
  const { resolveIn, readGroupOrdinary } = createSqliteSourcePolicyResolver(database, now);
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
    readGroupOrdinary,
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
