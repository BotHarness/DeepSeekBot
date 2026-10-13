import { createHash } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { channelSql, conversationSql, OPEN_ADMISSION_SQL, SNOOZED_SQL } from './attention.js';

export type InboxResolution = 'done' | 'ignored';

export interface InboxOpenFilter {
  sourceKind?: string[];
  channelId?: string;
  assignmentSessionId?: string;
  author?: string;
  since?: string;
  until?: string;
}

export interface InboxListInput extends InboxOpenFilter {
  includeSnoozed?: boolean;
  limit?: number;
  cursor?: string;
}

export interface InboxOpenGroup {
  conversation: string;
  sourceKind: string;
  channelId?: string;
  channelName?: string;
  assignmentSessionId?: string;
  count: number;
  ids: string[];
  oldestAt: string;
  latestAt: string;
  latest: string;
  snoozedUntil?: string;
}

export interface InboxListPage {
  total: number;
  snoozed: number;
  groups: InboxOpenGroup[];
  nextCursor?: string;
}

export interface InboxResolveInput {
  ids?: string[];
  filter?: InboxOpenFilter;
  outcome: InboxResolution;
  note?: string;
  confirm?: string;
}

export type InboxResolveOutcome =
  | { outcome: 'resolved'; resolved: string[]; alreadyResolved: string[] }
  | { outcome: 'confirm'; count: number; token: string; sample: string[] };

export interface InboxSnoozeInput {
  ids?: string[];
  filter?: InboxOpenFilter;
  until: string;
  note?: string;
  confirm?: string;
}

export type InboxSnoozeOutcome =
  | {
      outcome: 'snoozed';
      snoozed: string[];
      snoozedUntil: string;
      items: Array<{ id: string; snoozedUntil: string }>;
    }
  | { outcome: 'confirm'; count: number; token: string; sample: string[] };

export interface OrchestratorInboxTriage {
  current(): string[];
  list(input?: InboxListInput): InboxListPage;
  resolve(input: InboxResolveInput): InboxResolveOutcome;
  snooze(input: InboxSnoozeInput): InboxSnoozeOutcome;
}

export interface InboxTriage {
  openSummary(botSlug: string, limit?: number): string;
  access(input: {
    botSlug: string;
    sessionId: string;
    current: () => string[];
    changed: (channelId: string, messageId: string) => void;
    snoozed: () => void;
  }): OrchestratorInboxTriage;
}

interface OpenRow {
  source_event_id: string;
  source_kind: string;
  channel_id: string | null;
  message_id: string | null;
  assignment_session_id: string | null;
  conversation: string;
  created_at: string;
  body: string;
  snoozed_until: string | null;
}

const MAX_GROUP_IDS = 20;
const MAX_RESOLVE_IDS = 200;
const MAX_FILTER_RESOLVE = 500;
const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

const CHANNEL_SQL = channelSql('e');
const CONVERSATION_SQL = conversationSql('e');

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(flat);
  return characters.length <= max ? flat : `${characters.slice(0, max - 1).join('')}…`;
}

function time(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (Number.isNaN(Date.parse(value)))
    throw new Error(`${name}: time filters must be ISO timestamps`);
  return new Date(value).toISOString();
}

function filterPredicates(
  name: string,
  filter: InboxOpenFilter,
): { sql: string[]; values: SQLInputValue[] } {
  const sql: string[] = [];
  const values: SQLInputValue[] = [];
  for (const value of [filter.channelId, filter.assignmentSessionId, filter.author]) {
    if (value !== undefined && (value.length === 0 || value.length > 200))
      throw new Error(`${name}: invalid filter`);
  }
  if (filter.sourceKind !== undefined) {
    if (filter.sourceKind.length === 0 || filter.sourceKind.length > 20)
      throw new Error(`${name}: source_kind needs 1–20 values`);
    sql.push(
      `(e.source_kind IN (${filter.sourceKind.map(() => '?').join(', ')}) OR a.reason IN (${filter.sourceKind.map(() => '?').join(', ')}))`,
    );
    values.push(...filter.sourceKind, ...filter.sourceKind);
  }
  if (filter.channelId !== undefined) {
    sql.push(`${CHANNEL_SQL} = ?`);
    values.push(filter.channelId);
  }
  if (filter.assignmentSessionId !== undefined) {
    sql.push('e.assignment_session_id = ?');
    values.push(filter.assignmentSessionId);
  }
  if (filter.author !== undefined) {
    sql.push(`(json_extract(e.payload_json, '$.author.kind') = ?
      OR json_extract(e.payload_json, '$.author.slug') = ?
      OR json_extract(e.payload_json, '$.external.event.actor.id') = ?
      OR json_extract(e.payload_json, '$.external.event.actor.name') = ?)`);
    values.push(filter.author, filter.author, filter.author, filter.author);
  }
  const since = time(filter.since, name);
  const until = time(filter.until, name);
  if (since !== undefined && until !== undefined && since > until)
    throw new Error(`${name}: since must not follow until`);
  if (since !== undefined) {
    sql.push('e.created_at >= ?');
    values.push(since);
  }
  if (until !== undefined) {
    sql.push('e.created_at <= ?');
    values.push(until);
  }
  return { sql, values };
}

function confirmToken(botSlug: string, action: string, ids: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ botSlug, action, ids: [...ids].sort() }))
    .digest('base64url')
    .slice(0, 24);
}

function encodeCursor(cursor: { at: string; conversation: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string): { at: string; conversation: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof (decoded as { at?: unknown }).at === 'string' &&
      typeof (decoded as { conversation?: unknown }).conversation === 'string'
    )
      return decoded as { at: string; conversation: string };
  } catch {}
  throw new Error('inbox_list: invalid cursor');
}

export function createInboxTriage(
  database: OperationalDatabaseModulePort,
  channels: ChannelStore,
  now: () => Date = () => new Date(),
): InboxTriage {
  const openRows = (
    botSlug: string,
    filter: InboxOpenFilter,
    name: string,
    snoozed: 'exclude' | 'include' | 'only' = 'exclude',
  ): OpenRow[] => {
    const predicates = filterPredicates(name, filter);
    const snoozeSql =
      snoozed === 'exclude'
        ? `AND NOT ${SNOOZED_SQL}`
        : snoozed === 'only'
          ? `AND ${SNOOZED_SQL}`
          : '';
    return database.read(
      (db) =>
        db
          .prepare(`
        SELECT e.source_event_id, e.source_kind, ${CHANNEL_SQL} AS channel_id, e.message_id,
               e.assignment_session_id, ${CONVERSATION_SQL} AS conversation,
               e.created_at, e.body,
               CASE WHEN ${SNOOZED_SQL} THEN a.snoozed_until END AS snoozed_until
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND ${OPEN_ADMISSION_SQL} ${snoozeSql}
           ${predicates.sql.map((predicate) => `AND ${predicate}`).join('\n')}
         ORDER BY e.created_at DESC, e.source_event_id DESC
      `)
          .all(botSlug, ...predicates.values) as unknown as OpenRow[],
    );
  };

  const group = (rows: OpenRow[]): InboxOpenGroup[] => {
    const groups = new Map<string, InboxOpenGroup>();
    for (const row of rows) {
      const existing = groups.get(row.conversation);
      if (existing !== undefined) {
        existing.count += 1;
        existing.oldestAt = row.created_at;
        if (existing.ids.length < MAX_GROUP_IDS) existing.ids.push(row.source_event_id);
        continue;
      }
      const channelName = row.channel_id === null ? undefined : channels.get(row.channel_id)?.name;
      groups.set(row.conversation, {
        conversation: row.conversation,
        sourceKind: row.source_kind,
        ...(row.channel_id === null ? {} : { channelId: row.channel_id }),
        ...(channelName === undefined ? {} : { channelName }),
        ...(row.assignment_session_id === null
          ? {}
          : { assignmentSessionId: row.assignment_session_id }),
        count: 1,
        ids: [row.source_event_id],
        oldestAt: row.created_at,
        latestAt: row.created_at,
        latest: oneLine(row.body, 160),
        ...(row.snoozed_until === null ? {} : { snoozedUntil: row.snoozed_until }),
      });
    }
    return [...groups.values()].sort(
      (left, right) =>
        right.latestAt.localeCompare(left.latestAt) ||
        left.conversation.localeCompare(right.conversation),
    );
  };

  return {
    openSummary(botSlug, limit = 5) {
      const rows = openRows(botSlug, {}, 'inbox');
      const snoozedCount = openRows(botSlug, {}, 'inbox', 'only').length;
      if (rows.length === 0) return '';
      const groups = group(rows);
      const lines = groups.slice(0, limit).map((entry) => {
        const where =
          entry.assignmentSessionId !== undefined
            ? `Assignment ${entry.assignmentSessionId}`
            : entry.channelName !== undefined
              ? `Channel ${JSON.stringify(entry.channelName)}`
              : entry.sourceKind;
        const more = entry.count > 1 ? ` (+${entry.count - 1} more in this conversation)` : '';
        return `- [Source Event ${entry.ids[0]}] ${where}, ${entry.latestAt}: ${oneLine(entry.latest, 120)}${more}`;
      });
      const rest = [
        ...(groups.length > limit ? [`- …and ${groups.length - limit} more conversations.`] : []),
        ...(snoozedCount > 0 ? [`- ${snoozedCount} more snoozed, hidden until they return.`] : []),
      ];
      return [
        `[Open Inbox] ${rows.length} item${rows.length === 1 ? '' : 's'} you have seen but not resolved, newest conversations first. Review them with inbox_list; resolve finished ones with inbox_resolve.`,
        ...lines,
        ...rest,
      ].join('\n');
    },
    access({ botSlug, sessionId, current, changed, snoozed }) {
      const notify = (ids: string[]) => {
        if (ids.length === 0) return;
        const rows = database.read(
          (db) =>
            db
              .prepare(
                `SELECT COALESCE(e.channel_id, p.channel_id) AS channel_id,
                        COALESCE(e.message_id, p.message_id) AS message_id
                   FROM source_events e
                   LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id
                  WHERE e.source_event_id IN (${ids.map(() => '?').join(', ')})
                    AND COALESCE(e.channel_id, p.channel_id) IS NOT NULL
                    AND COALESCE(e.message_id, p.message_id) IS NOT NULL`,
              )
              .all(...ids) as unknown as Array<{ channel_id: string; message_id: string }>,
        );
        for (const row of rows) changed(row.channel_id, row.message_id);
      };
      const write = (ids: string[], outcome: InboxResolution, note: string | undefined) => {
        const at = now().toISOString();
        database.transaction(
          (db) => {
            for (const id of ids)
              db.prepare(`
                UPDATE inbox_admissions
                   SET resolved_at = ?, resolution = ?, resolution_note = ?,
                       resolved_by_session_id = ?,
                       ignored_at = CASE WHEN ? = 'ignored' THEN COALESCE(ignored_at, ?) ELSE ignored_at END,
                       ignored_by_session_id = CASE WHEN ? = 'ignored' THEN COALESCE(ignored_by_session_id, ?) ELSE ignored_by_session_id END
                 WHERE source_event_id = ? AND bot_slug = ? AND resolved_at IS NULL
              `).run(
                at,
                outcome,
                note ?? null,
                sessionId,
                outcome,
                at,
                outcome,
                sessionId,
                id,
                botSlug,
              );
          },
          ['bot-inbox'],
        );
        notify(ids);
      };
      const seen = (input: string[], name: string) => {
        const ids = [...new Set(input)];
        if (ids.length === 0 || ids.length > MAX_RESOLVE_IDS)
          throw new Error(`${name}: pass 1–${MAX_RESOLVE_IDS} ids`);
        const rows = database.read(
          (db) =>
            db
              .prepare(
                `SELECT source_event_id, attempt_state, opened_at, resolved_at
                   FROM inbox_admissions
                  WHERE bot_slug = ? AND source_event_id IN (${ids.map(() => '?').join(', ')})`,
              )
              .all(botSlug, ...ids) as unknown as Array<{
              source_event_id: string;
              attempt_state: string;
              opened_at: string | null;
              resolved_at: string | null;
            }>,
        );
        const byId = new Map(rows.map((row) => [row.source_event_id, row]));
        const inTurn = new Set(current());
        const unseen = ids.filter((id) => {
          const row = byId.get(id);
          if (row === undefined) return true;
          if (row.attempt_state === 'needs-repair') return true;
          return row.opened_at === null && row.attempt_state !== 'handled' && !inTurn.has(id);
        });
        if (unseen.length > 0)
          throw new Error(
            `${name}: not actionable (missing, unseen or needing repair): ${unseen.join(', ')}`,
          );
        return { ids, byId };
      };
      const confirmation = (rows: OpenRow[], token: string) => ({
        outcome: 'confirm' as const,
        count: rows.length,
        token,
        sample: rows.slice(0, 5).map((row) => `${row.source_event_id}: ${oneLine(row.body, 100)}`),
      });
      return {
        current,
        list(input = {}) {
          const limit = input.limit ?? 20;
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
            throw new Error('inbox_list: limit must be 1–50');
          const rows = openRows(
            botSlug,
            input,
            'inbox_list',
            input.includeSnoozed === true ? 'include' : 'exclude',
          );
          const snoozedCount =
            input.includeSnoozed === true
              ? rows.filter((row) => row.snoozed_until !== null).length
              : openRows(botSlug, input, 'inbox_list', 'only').length;
          const groups = group(rows);
          const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
          const start =
            cursor === undefined
              ? 0
              : groups.findIndex(
                  (entry) =>
                    entry.latestAt < cursor.at ||
                    (entry.latestAt === cursor.at && entry.conversation > cursor.conversation),
                );
          const remaining = start < 0 ? [] : groups.slice(start);
          const page = remaining.slice(0, limit);
          const last = page[page.length - 1];
          return {
            total: rows.length,
            snoozed: snoozedCount,
            groups: page,
            ...(remaining.length > limit && last !== undefined
              ? { nextCursor: encodeCursor({ at: last.latestAt, conversation: last.conversation }) }
              : {}),
          };
        },
        resolve(input) {
          if (input.outcome !== 'done' && input.outcome !== 'ignored')
            throw new Error('inbox_resolve: outcome must be done or ignored');
          const note = input.note?.trim();
          if (note !== undefined && Array.from(note).length > 500)
            throw new Error('inbox_resolve: note must be at most 500 characters');
          if (input.ids !== undefined && input.filter !== undefined)
            throw new Error('inbox_resolve: pass ids or a filter, not both');
          if (input.ids !== undefined) {
            const { ids, byId } = seen(input.ids, 'inbox_resolve');
            const alreadyResolved = ids.filter((id) => byId.get(id)!.resolved_at !== null).sort();
            const resolved = ids.filter((id) => byId.get(id)!.resolved_at === null).sort();
            write(resolved, input.outcome, note);
            return { outcome: 'resolved', resolved, alreadyResolved };
          }
          if (input.filter === undefined) throw new Error('inbox_resolve: pass ids or a filter');
          const rows = openRows(botSlug, input.filter, 'inbox_resolve');
          if (rows.length > MAX_FILTER_RESOLVE)
            throw new Error(
              `inbox_resolve: the filter matches ${rows.length} items; narrow it to at most ${MAX_FILTER_RESOLVE}`,
            );
          const ids = rows.map((row) => row.source_event_id);
          const token = confirmToken(botSlug, input.outcome, ids);
          if (input.confirm !== token || ids.length === 0) return confirmation(rows, token);
          const resolved = [...ids].sort();
          write(resolved, input.outcome, note);
          return { outcome: 'resolved', resolved, alreadyResolved: [] };
        },
        snooze(input) {
          const until = Date.parse(input.until);
          const at = now().getTime();
          if (Number.isNaN(until)) throw new Error('inbox_snooze: until must be an ISO timestamp');
          if (until <= at) throw new Error('inbox_snooze: until must be in the future');
          if (until - at > MAX_SNOOZE_MS)
            throw new Error('inbox_snooze: until must be within 30 days');
          const untilIso = new Date(until).toISOString();
          const note = input.note?.trim();
          if (note !== undefined && Array.from(note).length > 500)
            throw new Error('inbox_snooze: note must be at most 500 characters');
          if (input.ids !== undefined && input.filter !== undefined)
            throw new Error('inbox_snooze: pass ids or a filter, not both');
          let ids: string[];
          if (input.ids !== undefined) {
            const checked = seen(input.ids, 'inbox_snooze');
            const resolved = checked.ids.filter((id) => checked.byId.get(id)!.resolved_at !== null);
            if (resolved.length > 0)
              throw new Error(`inbox_snooze: already resolved: ${resolved.join(', ')}`);
            ids = checked.ids;
          } else {
            if (input.filter === undefined) throw new Error('inbox_snooze: pass ids or a filter');
            const rows = openRows(botSlug, input.filter, 'inbox_snooze');
            if (rows.length > MAX_FILTER_RESOLVE)
              throw new Error(
                `inbox_snooze: the filter matches ${rows.length} items; narrow it to at most ${MAX_FILTER_RESOLVE}`,
              );
            const matched = rows.map((row) => row.source_event_id);
            const token = confirmToken(botSlug, `snooze:${untilIso}`, matched);
            if (input.confirm !== token || matched.length === 0) return confirmation(rows, token);
            ids = matched;
          }
          const stamp = new Date(at).toISOString();
          const hidden = new Set(
            openRows(botSlug, {}, 'inbox_snooze', 'only').map((row) => row.source_event_id),
          );
          const items = database.transaction(
            (db) =>
              [...ids].sort().map((id) => {
                db.prepare(`
                  UPDATE inbox_admissions
                     SET snoozed_until = CASE
                           WHEN ? = 1 AND snoozed_until > ? AND snoozed_until > ?
                             THEN snoozed_until
                           ELSE ? END,
                         snoozed_at = ?,
                         snooze_note = COALESCE(?, snooze_note)
                   WHERE source_event_id = ? AND bot_slug = ? AND resolved_at IS NULL
                `).run(
                  hidden.has(id) ? 1 : 0,
                  stamp,
                  untilIso,
                  untilIso,
                  stamp,
                  note ?? null,
                  id,
                  botSlug,
                );
                const row = db
                  .prepare(
                    'SELECT snoozed_until FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?',
                  )
                  .get(id, botSlug) as { snoozed_until: string };
                return { id, snoozedUntil: row.snoozed_until };
              }),
            ['bot-inbox'],
          );
          notify(ids);
          snoozed();
          return {
            outcome: 'snoozed',
            snoozed: items.map((item) => item.id),
            snoozedUntil: items
              .map((item) => item.snoozedUntil)
              .sort()
              .at(-1)!,
            items,
          };
        },
      };
    },
  };
}
