import type { HumanContext } from '../humans/context.js';
import { GenuiError, genuiPrivateView, parseGenuiContent } from './genui.js';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { createChannelRecords } from './sqlite-store.records.js';

export function createChannelGenuiViews({
  readRecord,
  database,
  humanIdentity,
}: {
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  database: OperationalDatabaseModulePort;
  humanIdentity: ChannelStore['humanIdentity'];
}) {
  const readGenuiMessage = (channelId: string, messageId: string): ChannelMessage => {
    const channel = readRecord(channelId);
    if (channel?.type !== 'dm' || channel.botSlug === undefined)
      throw new GenuiError('genui-unavailable', 'The report is unavailable.');
    const row = database.read((db) =>
      db
        .prepare(`SELECT e.payload_json, e.body
      FROM channel_placements p JOIN source_events e ON e.source_event_id = p.source_event_id
      WHERE p.channel_id = ? AND p.message_id = ?`)
        .get(channelId, messageId),
    ) as { payload_json: string; body: string } | undefined;
    const message =
      row === undefined
        ? undefined
        : parseMessage(row.payload_json, row.body, messageId, channelId);
    if (
      message?.genui === undefined ||
      message.author.kind !== 'bot' ||
      message.author.slug !== channel.botSlug
    )
      throw new GenuiError('genui-unavailable', 'The report is unavailable.');
    return message;
  };

  return {
    genuiView(human: HumanContext, channelId, messageId) {
      const message = readGenuiMessage(channelId, messageId);
      const report = parseGenuiContent(message.genui);
      return database.read((db) => {
        const row = db
          .prepare(
            'SELECT version, state_json FROM genui_private_views WHERE human_id = ? AND channel_id = ? AND message_id = ? AND snapshot_id = ?',
          )
          .get(humanIdentity(human).humanId, channelId, messageId, report.snapshotId) as
          | { version: number; state_json: string }
          | undefined;
        return row === undefined
          ? genuiPrivateView(report, 0)
          : genuiPrivateView(report, row.version, JSON.parse(row.state_json));
      });
    },
    saveGenuiView(human: HumanContext, channelId, messageId, snapshotId, expectedVersion, value) {
      try {
        return database.transaction((db) => {
          const message = readGenuiMessage(channelId, messageId);
          if (message.genui?.snapshotId !== snapshotId)
            throw new GenuiError('genui-unavailable', 'The report snapshot is unavailable.');
          if (
            !Number.isSafeInteger(expectedVersion) ||
            expectedVersion < 0 ||
            expectedVersion >= Number.MAX_SAFE_INTEGER
          )
            throw new GenuiError('invalid-genui', 'Expected view version is invalid.');
          if (value === undefined)
            throw new GenuiError('invalid-genui', 'An explicit private view state is required.');
          const view = genuiPrivateView(
            parseGenuiContent(message.genui),
            expectedVersion + 1,
            value,
          );
          const state = view.state;
          const humanId = humanIdentity(human).humanId;
          const row = db
            .prepare(
              'SELECT version FROM genui_private_views WHERE human_id = ? AND channel_id = ? AND message_id = ?',
            )
            .get(humanId, channelId, messageId) as { version: number } | undefined;
          if ((row?.version ?? 0) !== expectedVersion)
            throw new GenuiError(
              'genui-view-conflict',
              'The private view changed on another client. Reload or explicitly resolve the conflict.',
            );
          const version = expectedVersion + 1;
          db.prepare(`INSERT INTO genui_private_views (human_id, channel_id, message_id, snapshot_id, version, state_json)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (human_id, channel_id, message_id)
          DO UPDATE SET snapshot_id = excluded.snapshot_id, version = excluded.version, state_json = excluded.state_json`).run(
            humanId,
            channelId,
            messageId,
            snapshotId,
            version,
            JSON.stringify(state),
          );
          return view;
        });
      } catch (error) {
        if (error instanceof OperationalDatabaseError && error.cause instanceof GenuiError)
          throw error.cause;
        throw error;
      }
    },
  } satisfies Pick<ChannelStore, 'genuiView' | 'saveGenuiView'>;
}
