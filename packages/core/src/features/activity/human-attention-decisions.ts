import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { HumanContext } from '../../humans/context.js';
import {
  assignmentDmRequester,
  assignmentForeignDm,
  attentionBotOwner,
} from './human-attention-sql.js';
import type { HumanAttentionDecisions } from './human-attention-types.js';

export const HUMAN_INBOX_SNOOZE_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export function createHumanAttentionDecisions(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): HumanAttentionDecisions {
  return {
    dismiss(human: HumanContext, item) {
      return database.transaction(
        (db) => {
          const revision =
            item.kind === 'channel-unread' &&
            item.channelId !== undefined &&
            item.messageId !== undefined
              ? (
                  db
                    .prepare(
                      'SELECT revision FROM channel_placements WHERE channel_id = ? AND message_id = ?',
                    )
                    .get(item.channelId, item.messageId) as { revision: number } | undefined
                )?.revision
              : undefined;
          if (item.kind === 'channel-unread' && revision === undefined) return false;
          db.prepare(
            'INSERT OR IGNORE INTO human_inbox_dismissals (human_id, item_id, source_key, through_revision, dismissed_at) VALUES (?, ?, ?, ?, ?)',
          ).run(
            human.humanId,
            item.id,
            item.sourceEventId ?? '',
            revision ?? null,
            now().toISOString(),
          );
          return true;
        },
        ['human-attention'],
      );
    },
    restore(human: HumanContext, item) {
      return database.transaction(
        (db) =>
          (item.kind === 'channel-unread'
            ? db
                .prepare(
                  'DELETE FROM human_inbox_dismissals WHERE human_id = $humanId AND item_id = ?',
                )
                .run({ humanId: human.humanId }, item.id)
            : db
                .prepare(
                  'DELETE FROM human_inbox_dismissals WHERE human_id = $humanId AND item_id = ? AND source_key = ?',
                )
                .run({ humanId: human.humanId }, item.id, item.sourceEventId ?? '')
          ).changes > 0,
        ['human-attention'],
      );
    },
    snooze(human: HumanContext, item, until) {
      if (
        item.kind === 'channel-unread' ||
        item.category === 'unread' ||
        item.category === 'handled'
      )
        return false;
      return database.transaction(
        (db) => {
          if (until === null) {
            db.prepare(
              'DELETE FROM human_inbox_snoozes WHERE human_id = $humanId AND item_id = ? AND source_key = ?',
            ).run({ humanId: human.humanId }, item.id, item.sourceEventId ?? '');
            return true;
          }
          db.prepare(
            'INSERT OR REPLACE INTO human_inbox_snoozes (human_id, item_id, source_key, until, snoozed_at) VALUES (?, ?, ?, ?, ?)',
          ).run(human.humanId, item.id, item.sourceEventId ?? '', until, now().toISOString());
          return true;
        },
        ['human-attention'],
      );
    },
    ignoreAssignmentReport(human: HumanContext, sourceEventId) {
      return database.transaction(
        (db) => {
          const latest = db
            .prepare(`
            SELECT e.source_event_id
              FROM source_events e
              JOIN assignments a ON a.session_id = e.assignment_session_id
             WHERE e.source_event_id = ?
               AND ((${attentionBotOwner('e.bot_slug')} AND NOT ${assignmentForeignDm('a.session_id')})
                 OR ${assignmentDmRequester('a.session_id')})
               AND e.source_kind = 'assignment-report'
               AND a.latest_report_state = 'completed'
               AND e.source_event_id = (
                 SELECT newer.source_event_id FROM source_events newer
                  WHERE newer.assignment_session_id = a.session_id
                    AND newer.source_kind = 'assignment-report'
                  ORDER BY newer.rowid DESC LIMIT 1
               )
          `)
            .get({ humanId: human.humanId }, sourceEventId);
          if (latest === undefined) return false;
          db.prepare(`
            INSERT OR IGNORE INTO human_attention_decisions
              (human_id, source_event_id, decision, decided_at) VALUES (?, ?, 'ignored', ?)
          `).run(human.humanId, sourceEventId, now().toISOString());
          return true;
        },
        ['human-attention'],
      );
    },
  };
}
