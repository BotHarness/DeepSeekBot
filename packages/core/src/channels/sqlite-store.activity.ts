import { channelAudienceSql } from '../team/channel-contract.js';
import type { HumanContext } from '../humans/context.js';
import { notChannelNoticeSql } from './channel-notice.js';
import { toolApprovalHistoryEntry, type ToolApprovalHistoryEntry } from './approval-history.js';
import { isValidSlug } from '../bots/slug.js';
import { isChannelMessageAuthor } from './channel.js';
import type { ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelAccess } from './sqlite-store.types.js';

export function createChannelActivity({
  database,
  humanAccess,
}: {
  database: OperationalDatabaseModulePort;
  humanAccess: SqliteChannelAccess;
}) {
  return {
    latestBotActivity(human: HumanContext) {
      const rows = database.read((db) =>
        db
          .prepare(`
        WITH RECURSIVE slugs(slug) AS (
          SELECT min(bot_slug) FROM source_events WHERE bot_slug IS NOT NULL
          UNION ALL
          SELECT (SELECT min(bot_slug) FROM source_events WHERE bot_slug > slugs.slug)
            FROM slugs WHERE slug IS NOT NULL
        )
        SELECT slug, (
          SELECT unixepoch(e.created_at, 'subsec') * 1000
            FROM source_events e
           WHERE e.bot_slug = slugs.slug
             AND json_extract(e.payload_json, '$.author.kind') = 'bot'
             AND json_extract(e.payload_json, '$.author.slug') = slugs.slug
             AND ${notChannelNoticeSql('e.payload_json')}
             AND EXISTS (
               SELECT 1 FROM channel_placements p
                 JOIN channel_records c ON c.channel_id = p.channel_id
                 ${humanAccess.current ? "JOIN humans viewer ON viewer.human_id = ? AND viewer.status = 'active'" : ''}
        LEFT JOIN channel_human_members m ON m.channel_id = p.channel_id
                   AND m.human_id = ? AND m.left_at IS NULL
                WHERE p.source_event_id = e.source_event_id
                  AND json_extract(c.record_json, '$.deletedAt') IS NULL ${humanAccess.current ? `AND ${channelAudienceSql()}` : ''}
                  AND ((json_extract(c.record_json, '$.type') = 'dm'
                        AND (json_extract(c.record_json, '$.botSlug') IS NOT NULL OR (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL AND m.human_id IS NOT NULL)))
                    OR (json_extract(c.record_json, '$.type') = 'group'
                        AND m.human_id IS NOT NULL AND p.revision >= m.visible_from_revision))
             )
           ORDER BY e.created_at DESC, e.source_event_id DESC LIMIT 1
        ) AS at
          FROM slugs WHERE slug IS NOT NULL
      `)
          .all(...(humanAccess.current ? [human.humanId] : []), human.humanId),
      ) as Array<{ slug: string; at: number }>;
      return new Map(
        rows.filter((row) => Number.isFinite(row.at)).map((row) => [row.slug, row.at]),
      );
    },
    toolApprovalHistory(botSlug, page) {
      if (!isValidSlug(botSlug)) return [];
      const after = page.after;
      const rows = database.read((db) =>
        db
          .prepare(`
        SELECT p.channel_id,
               p.message_id AS decision_id, d.payload_json AS decision_json, d.body AS decision_body,
               rp.message_id AS request_id, r.payload_json AS request_json, r.body AS request_body
          FROM channel_placements p
          JOIN source_events d ON d.source_event_id = p.source_event_id
          JOIN channel_records c ON c.channel_id = p.channel_id
          JOIN channel_placements rp ON rp.channel_id = p.channel_id
            AND rp.message_id = json_extract(d.payload_json, '$.toolApprovalDecision.requestMessageId')
          JOIN source_events r ON r.source_event_id = rp.source_event_id
         WHERE json_extract(c.record_json, '$.deletedAt') IS NULL
           AND json_extract(r.payload_json, '$.author.kind') = 'bot'
           AND json_extract(r.payload_json, '$.author.slug') = ?
           AND (? IS NULL
             OR json_extract(d.payload_json, '$.at') < ?
             OR (json_extract(d.payload_json, '$.at') = ? AND p.message_id < ?))
         ORDER BY json_extract(d.payload_json, '$.at') DESC, p.message_id DESC
         LIMIT ?
      `)
          .all(
            botSlug,
            after?.decidedAt ?? null,
            after?.decidedAt ?? null,
            after?.decidedAt ?? null,
            after?.decisionMessageId ?? null,
            page.limit,
          ),
      ) as Array<{
        channel_id: string;
        decision_id: string;
        decision_json: string;
        decision_body: string;
        request_id: string;
        request_json: string;
        request_body: string;
      }>;
      const entries: ToolApprovalHistoryEntry[] = [];
      for (const row of rows) {
        const decision = parseMessage(
          row.decision_json,
          row.decision_body,
          row.decision_id,
          row.channel_id,
        );
        const request = parseMessage(
          row.request_json,
          row.request_body,
          row.request_id,
          row.channel_id,
        );
        const entry =
          decision === undefined || request === undefined
            ? undefined
            : toolApprovalHistoryEntry(row.channel_id, decision, request, botSlug);
        if (entry !== undefined) entries.push(entry);
      }
      return entries;
    },
    humanMessageCounts(human: HumanContext, from, to) {
      const rows = database.read((db) =>
        db
          .prepare(`
        SELECT p.channel_id, CASE WHEN json_extract(e.payload_json, '$.external.localChannelId') IS NOT NULL
                 THEN json_object('kind', 'bridged', 'source', COALESCE(
                   json_extract(e.payload_json, '$.external.event.actor.name'),
                   json_extract(e.payload_json, '$.external.event.actor.id')))
                 ELSE json_extract(e.payload_json, '$.author') END AS author_json,
               COUNT(DISTINCT p.source_event_id) AS count
          FROM source_events e
          CROSS JOIN channel_placements p ON p.source_event_id = e.source_event_id
          JOIN channel_records c ON c.channel_id = p.channel_id
          ${humanAccess.current ? "JOIN humans viewer ON viewer.human_id = ? AND viewer.status = 'active'" : ''}
        LEFT JOIN channel_human_members m ON m.channel_id = p.channel_id
            AND m.human_id = ? AND m.left_at IS NULL
         WHERE e.created_at >= date(?, '-1 day') AND e.created_at < date(?, '+2 day')
           AND json_extract(c.record_json, '$.deletedAt') IS NULL ${humanAccess.current ? `AND ${channelAudienceSql()}` : ''}
           AND ${notChannelNoticeSql('e.payload_json')}
           AND ((json_extract(c.record_json, '$.type') = 'dm'
                 AND (json_extract(c.record_json, '$.botSlug') IS NOT NULL OR (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL AND m.human_id IS NOT NULL)))
             OR (json_extract(c.record_json, '$.type') = 'group'
                 AND m.human_id IS NOT NULL AND p.revision >= m.visible_from_revision))
           AND julianday(e.created_at) >= julianday(?) AND julianday(e.created_at) < julianday(?)
         GROUP BY p.channel_id, author_json
      `)
          .all(...(humanAccess.current ? [human.humanId] : []), human.humanId, from, to, from, to),
      ) as Array<{ channel_id: string; author_json: string; count: number }>;
      return rows.map((row) => {
        const author: unknown = JSON.parse(row.author_json);
        if (!isChannelMessageAuthor(author)) throw new Error('Invalid committed message author');
        return { channelId: row.channel_id, author, count: row.count };
      });
    },
  } satisfies Pick<
    ChannelStore,
    'latestBotActivity' | 'toolApprovalHistory' | 'humanMessageCounts'
  >;
}
