import { randomUUID } from 'node:crypto';
import type { ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';
import { eventPayload } from './sqlite-store.message-payload.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelPlacements } from './sqlite-store.placements.js';
import type { SqliteChannelStoreOptions } from './sqlite-store.types.js';

export function createChannelNotices({
  causeChannel,
  humanBotDm,
  database,
  now,
  revisionOf,
  options,
  sql,
}: {
  causeChannel: ReturnType<typeof createChannelAdmissions>['causeChannel'];
  humanBotDm: ReturnType<typeof createChannelRecords>['humanBotDm'];
  database: OperationalDatabaseModulePort;
  now: () => Date;
  revisionOf: ReturnType<typeof createChannelPlacements>['revisionOf'];
  options: SqliteChannelStoreOptions;
  sql: {
    insertMemorySourceEvent: string;
    insertMemoryPlacement: string;
    insertMirroredMemoryPlacement: string;
    insertHandledMemoryAdmission: string;
    insertBotCreateSourceEvent: string;
    insertBotCreatePlacement: string;
    insertHandledBotCreateAdmission: string;
  };
}) {
  return {
    appendMemoryCommits(input) {
      const cause = causeChannel(input.causeSourceEventId, input.botSlug, '');
      const dm = humanBotDm(input.botSlug);
      const channel = (cause === 'target' ? undefined : cause) ?? dm;
      if (channel === undefined) return [];
      const committed: ChannelMessage[] = [];
      for (const commit of input.commits) {
        const recorded = database.read((db) =>
          db
            .prepare(`
              SELECT 1 FROM source_events
               WHERE bot_slug = ? AND json_type(payload_json, '$.memoryCommit') IS NOT NULL
                 AND json_extract(payload_json, '$.memoryCommit.sha') = ?
            `)
            .get(input.botSlug, commit.sha),
        );
        if (recorded !== undefined) continue;
        const message: ChannelMessage = {
          id: `memory-commit-${randomUUID()}`,
          at: now().toISOString(),
          author: { kind: 'system' },
          body: '',
          memoryCommit: { botSlug: input.botSlug, ...commit },
        };
        const revision = revisionOf(channel.id) + 1;
        const humanDm = channel.id === dm?.id ? undefined : dm;
        const humanDmRevision = humanDm === undefined ? undefined : revisionOf(humanDm.id) + 1;
        const sourceEventId = randomUUID();
        database.transaction(
          (db) => {
            db.prepare(sql.insertMemorySourceEvent).run(
              sourceEventId,
              input.botSlug,
              channel.id,
              message.id,
              message.at,
              JSON.stringify({
                ...JSON.parse(eventPayload(message)),
                causeSourceEventId: input.causeSourceEventId,
              }),
            );
            db.prepare(sql.insertMemoryPlacement).run(
              channel.id,
              revision,
              sourceEventId,
              message.id,
            );
            if (humanDm !== undefined && humanDmRevision !== undefined)
              db.prepare(sql.insertMirroredMemoryPlacement).run(
                humanDm.id,
                humanDmRevision,
                sourceEventId,
                message.id,
              );
            db.prepare(sql.insertHandledMemoryAdmission).run(
              sourceEventId,
              input.botSlug,
              message.at,
            );
          },
          ['source-event', 'channel', 'bot-inbox'],
        );
        committed.push(message);
        for (const commit of [
          { channelId: channel.id, message, revision },
          ...(humanDm === undefined || humanDmRevision === undefined
            ? []
            : [
                {
                  channelId: humanDm.id,
                  message: { ...message, noticeOrigin: { channelId: channel.id } },
                  revision: humanDmRevision,
                },
              ]),
        ])
          try {
            options.onCommitted?.(commit);
          } catch (error) {
            options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
          }
      }
      return committed;
    },
    appendBotCreateAction(input) {
      const cause = causeChannel(input.causeSourceEventId, input.botSlug, '');
      const channel = (cause === 'target' ? undefined : cause) ?? humanBotDm(input.botSlug);
      if (channel === undefined) return undefined;
      const message: ChannelMessage = {
        id: `bot-create-action-${randomUUID()}`,
        at: now().toISOString(),
        author: { kind: 'bot', slug: input.botSlug },
        body: '',
        botCreateAction: { botSlug: input.created.botSlug, displayName: input.created.displayName },
      };
      const revision = revisionOf(channel.id) + 1;
      const sourceEventId = randomUUID();
      database.transaction(
        (db) => {
          db.prepare(sql.insertBotCreateSourceEvent).run(
            sourceEventId,
            input.botSlug,
            channel.id,
            message.id,
            message.at,
            JSON.stringify({
              ...JSON.parse(eventPayload(message)),
              causeSourceEventId: input.causeSourceEventId,
            }),
          );
          db.prepare(sql.insertBotCreatePlacement).run(
            channel.id,
            revision,
            sourceEventId,
            message.id,
          );
          db.prepare(sql.insertHandledBotCreateAdmission).run(
            sourceEventId,
            input.botSlug,
            message.at,
          );
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
      try {
        options.onCommitted?.({ channelId: channel.id, message, revision });
      } catch (error) {
        options.warn?.(`Channel post-commit notification failed: ${String(error)}`);
      }
      return message;
    },
  } satisfies Pick<ChannelStore, 'appendMemoryCommits' | 'appendBotCreateAction'>;
}
