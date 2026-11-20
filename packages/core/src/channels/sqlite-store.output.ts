import { channelAudienceSql } from '../team/channel-contract.js';
import type { HumanContext } from '../humans/context.js';
import { isChannelNotice } from './channel-notice.js';
import type { ChannelStore } from './store.js';
import type { PlacementRow } from './sqlite-store.placements.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelAccess } from './sqlite-store.types.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { createChannelHumans } from './sqlite-store.humans.js';

export function createChannelOutput({
  database,
  humanAccess,
  readRecord,
  humanMembers,
  participates,
}: {
  database: OperationalDatabaseModulePort;
  humanAccess: SqliteChannelAccess;
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  humanMembers: ReturnType<typeof createChannelHumans>['humanMembers'];
  participates: ReturnType<typeof createChannelHumans>['participates'];
}) {
  return {
    latestHumanMessageId(human: HumanContext, id) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.message_id FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        JOIN channel_records c ON c.channel_id = p.channel_id
        ${humanAccess.current ? "JOIN humans viewer ON viewer.human_id = ? AND viewer.status = 'active'" : ''}
        LEFT JOIN channel_human_members h ON h.channel_id = p.channel_id AND h.human_id = ? AND h.left_at IS NULL
        WHERE p.channel_id = ? AND json_extract(c.record_json, '$.deletedAt') IS NULL ${humanAccess.current ? `AND ${channelAudienceSql('c', 'h')}` : ''}
          AND ((json_extract(c.record_json, '$.type') = 'dm' AND (json_extract(c.record_json, '$.botSlug') IS NOT NULL OR (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL AND h.human_id IS NOT NULL))) OR
          (json_extract(c.record_json, '$.type') = 'group' AND h.human_id IS NOT NULL AND p.revision >= h.visible_from_revision))
        ORDER BY p.revision DESC LIMIT 1
      `)
          .get(...(humanAccess.current ? [human.humanId] : []), human.humanId, id),
      ) as { message_id: string } | undefined;
      return row?.message_id;
    },
    humanSendStatus(id, messageId) {
      const channel = readRecord(id);
      if (channel?.type !== 'dm' || channel.botSlug === undefined) return undefined;
      const botSlug = channel.botSlug;
      return database.read((db) => {
        const request = db
          .prepare(`
          SELECT e.source_event_id, e.created_at, a.attempt_state, a.resolved_at, a.resolution, a.handled_at, a.observed_at
          FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id AND a.bot_slug = ?
          WHERE e.channel_id = ? AND e.message_id = ? AND e.source_kind = 'human-message'
        `)
          .get(botSlug, id, messageId) as
          | {
              source_event_id: string;
              created_at: string;
              attempt_state: string;
              resolved_at: string | null;
              resolution: string | null;
              handled_at: string | null;
              observed_at: string | null;
            }
          | undefined;
        if (!request) return undefined;
        const rows = db
          .prepare(`
          SELECT output.payload_json, output.body, output.message_id
          FROM channel_output_origins origin
          JOIN source_events output ON output.source_event_id = origin.source_event_id
          JOIN session_ownership owner ON owner.session_id = origin.session_id AND owner.bot_slug = output.bot_slug
          WHERE origin.request_source_event_id = ? AND output.channel_id = ?
            AND output.source_kind = 'bot-message' AND output.bot_slug = ?
          ORDER BY output.rowid
        `)
          .all(request.source_event_id, id, botSlug) as Pick<
          PlacementRow,
          'payload_json' | 'body' | 'message_id'
        >[];
        const replies = rows.flatMap((row) => {
          const message = parseMessage(row.payload_json, row.body, row.message_id, id);
          return message &&
            !isChannelNotice(message) &&
            !message.toolApprovalRequest &&
            !message.userQuestionRequest &&
            !message.sessionFailure &&
            !message.grantRequest
            ? [message]
            : [];
        });
        const assignment = db
          .prepare(`
          SELECT link.session_id FROM request_assignments link
          JOIN assignments a ON a.session_id = link.session_id AND a.bot_slug = ?
          WHERE link.request_source_event_id = ?
          ORDER BY link.linked_at DESC, link.rowid DESC LIMIT 1
        `)
          .get(botSlug, request.source_event_id) as { session_id: string } | undefined;
        const completed = request.resolved_at !== null && request.resolution === 'done';
        const ignored = request.resolved_at !== null && request.resolution === 'ignored';
        const uncertain = ['needs-repair', 'retryable'].includes(request.attempt_state);
        return {
          sourceEventId: request.source_event_id,
          state: request.attempt_state,
          progress: {
            state: completed ? 'completed' : ignored || uncertain ? 'unknown' : 'working',
            terminal: completed || ignored,
            updatedAt: [
              request.resolved_at,
              request.handled_at,
              request.observed_at,
            ].reduce<string>(
              (latest, value) =>
                value !== null && Date.parse(value) > Date.parse(latest) ? value : latest,
              request.created_at,
            ),
          },
          replies,
          ...(assignment === undefined ? {} : { assignmentId: assignment.session_id }),
        };
      });
    },
    observeOutput(human: HumanContext, id, messageId) {
      const channel = readRecord(id);
      if (!channel) return undefined;
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.rowid AS position, p.revision, p.message_id, e.payload_json, e.body
          FROM channel_placements p
          JOIN source_events e ON e.source_event_id = p.source_event_id
         WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(id, messageId),
      ) as
        | (Pick<PlacementRow, 'revision' | 'message_id' | 'payload_json' | 'body'> & {
            position: number;
          })
        | undefined;
      const message = row && parseMessage(row.payload_json, row.body, row.message_id, id);
      if (!row || !message || message.id !== messageId) return undefined;
      const member = humanMembers(id).find((entry) => entry.human_id === human.humanId);
      const readable = !humanAccess.current || humanAccess.current.canRead(human, id);
      return {
        position: row.position,
        channel,
        message: { id: message.id, author: message.author, body: message.body },
        humanParticipant: participates(human, id),
        canRead:
          readable &&
          (channel.type === 'dm' ||
            (member !== undefined && row.revision >= member.visible_from_revision)),
      };
    },
    outputCheckpoint() {
      const row = database.read((db) =>
        db
          .prepare('SELECT rowid AS position FROM channel_placements ORDER BY rowid DESC LIMIT 1')
          .get(),
      ) as { position: number } | undefined;
      return row?.position ?? 0;
    },
  } satisfies Pick<
    ChannelStore,
    'latestHumanMessageId' | 'humanSendStatus' | 'observeOutput' | 'outputCheckpoint'
  >;
}
