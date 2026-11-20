import type { DatabaseSync } from 'node:sqlite';
import type { BotSourceClass, BotSourcePolicyStore } from '../runtime/source-policy.js';
import { isValidSlug } from '../bots/slug.js';
import { isBotDmChannel, type ChannelMessage, type ChannelRecord } from './channel.js';
import type { ChannelStore } from './store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';

interface AdmissionRow {
  bot_slug: string;
  reason: string;
  attempt_state: string;
  ignored_at: string | null;
  observed_at: string | null;
}

export function createChannelAdmissions({
  database,
  sourcePolicy,
  readRecord,
  options,
  sql,
}: {
  database: OperationalDatabaseModulePort;
  sourcePolicy: BotSourcePolicyStore;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  options: SqliteChannelStoreOptions;
  sql: {
    insertSourceAdmission: string;
  };
}) {
  let sourceHumanIdentityCache: boolean | undefined;

  const sourceHumanIdentity = () =>
    (sourceHumanIdentityCache ??= database.read((db) =>
      db
        .prepare('PRAGMA table_info(source_events)')
        .all()
        .some((column) => column.name === 'human_id'),
    ));

  const insertSourceAdmission = (
    db: DatabaseSync,
    sourceEventId: string,
    botSlug: string,
    sourceClass: BotSourceClass,
  ): void => {
    const rule = sourcePolicy.resolveIn(db, botSlug, sourceClass);
    db.prepare(sql.insertSourceAdmission).run(
      sourceEventId,
      botSlug,
      sourceClass,
      rule.revision,
      rule.wake,
    );
  };

  const causeChannel = (
    sourceEventId: string,
    botSlug: string,
    targetChannelId: string,
  ): ChannelRecord | 'target' | undefined => {
    const cause = database.read(
      (db) =>
        db
          .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId) as { channel_id: string | null } | undefined,
    );
    if (cause?.channel_id == null) return undefined;
    if (cause.channel_id === targetChannelId) return 'target';
    const channel = readRecord(cause.channel_id);
    if (channel === undefined) return undefined;
    if (channel.type === 'group' || isBotDmChannel(channel))
      return channel.members.includes(botSlug) ? channel : undefined;
    return channel.botSlug === botSlug ? channel : undefined;
  };

  const admissionStatuses = (sourceEventId: string): ChannelMessage['deliveries'] => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT bot_slug, reason, attempt_state, ignored_at, observed_at FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug',
        )
        .all(sourceEventId),
    ) as unknown as AdmissionRow[];
    return rows.length === 0
      ? undefined
      : rows.map((row) => {
          const groupAdmission = row.reason === 'group-mention' || row.reason === 'group-ordinary';
          return {
            botSlug: row.bot_slug,
            state: (row.attempt_state === 'handled' && row.ignored_at !== null
              ? 'ignored'
              : groupAdmission && row.attempt_state === 'running' && row.observed_at === null
                ? 'pending'
                : groupAdmission && row.attempt_state === 'pending' && row.observed_at !== null
                  ? 'observed'
                  : row.attempt_state) as NonNullable<
              ChannelMessage['deliveries']
            >[number]['state'],
          };
        });
  };

  const methods = {
    admissionChanged(channelId, messageId) {
      const message = this.message(channelId, messageId);
      if (message !== undefined) options.onAdmissionChanged?.(channelId, messageId, message);
    },
    admissionActivity(botSlug, sinceIso) {
      if (!isValidSlug(botSlug)) return [];
      const rows = database.read((db) =>
        db
          .prepare(
            `SELECT reason, COALESCE(observed_at, handled_at) AS at FROM inbox_admissions
              WHERE bot_slug = ? AND ignored_at IS NULL
                AND COALESCE(observed_at, handled_at) IS NOT NULL
                AND COALESCE(observed_at, handled_at) >= ?
              ORDER BY at
              LIMIT 20000`,
          )
          .all(botSlug, sinceIso),
      ) as unknown as Array<{ reason: string; at: string }>;
      return rows.map((row) => ({ at: row.at, reason: row.reason }));
    },
  } satisfies Pick<ChannelStore, 'admissionChanged' | 'admissionActivity'> & ThisType<ChannelStore>;

  return { sourceHumanIdentity, admissionStatuses, causeChannel, insertSourceAdmission, methods };
}
