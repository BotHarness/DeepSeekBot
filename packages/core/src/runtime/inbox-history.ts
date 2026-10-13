import { createHash, randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { ATTENTION_STATE_SQL, type BotAttentionState } from './attention.js';

export interface InboxHistoryInput {
  query?: string;
  kind?: string;
  channelId?: string;
  causeSourceEventId?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

export interface InboxHistoryItem {
  sourceEventId: string;
  at: string;
  kind: string;
  sourceKind: string;
  state: BotAttentionState;
  channelId?: string;
  channelName?: string;
  causeSourceEventId?: string;
  resolutionNote?: string;
  snippet: string;
}

export interface InboxHistoryPage {
  items: InboxHistoryItem[];
  nextCursor?: string;
}

export interface InboxHistoryQuery {
  list(botSlug: string, input?: InboxHistoryInput): InboxHistoryPage;
  rebuild(): void;
  clear(): void;
}

interface HistoryRow {
  source_event_id: string;
  created_at: string;
  reason: string;
  source_kind: string;
  state: BotAttentionState;
  channel_id: string | null;
  cause_source_event_id: string | null;
  resolution_note: string | null;
  snippet: string;
}

interface SearchSnapshot {
  botSlug: string;
  fingerprint: string;
  ids: string[];
  expires: number;
}

type HistoryCursor =
  | { type: 'list'; botSlug: string; fingerprint: string; maxRowid: number; at: string; id: string }
  | { type: 'search'; token: string; offset: number };

const CAUSE =
  "coalesce(json_extract(e.payload_json, '$.causeSourceEventId'), json_extract(e.payload_json, '$.botCausation.parentSourceEventId'))";
const FIELDS = `
  e.source_event_id, e.created_at, a.reason, e.source_kind,
  coalesce(e.channel_id, (SELECT p.channel_id FROM channel_placements p
    WHERE p.source_event_id = e.source_event_id ORDER BY p.channel_id LIMIT 1)) AS channel_id,
  ${CAUSE} AS cause_source_event_id,
  a.resolution_note,
  ${ATTENTION_STATE_SQL} AS state
`;

function cursorDecode(value: string): HistoryCursor {
  if (value.length > 2048) throw new Error('inbox_history: invalid cursor');
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) throw new Error();
    const cursor = decoded as Record<string, unknown>;
    if (
      cursor['type'] === 'search' &&
      typeof cursor['token'] === 'string' &&
      Number.isSafeInteger(cursor['offset']) &&
      Number(cursor['offset']) >= 0
    ) {
      return { type: 'search', token: cursor['token'], offset: Number(cursor['offset']) };
    }
    if (
      cursor['type'] === 'list' &&
      typeof cursor['botSlug'] === 'string' &&
      typeof cursor['fingerprint'] === 'string' &&
      typeof cursor['at'] === 'string' &&
      typeof cursor['id'] === 'string' &&
      Number.isSafeInteger(cursor['maxRowid']) &&
      Number(cursor['maxRowid']) >= 0
    ) {
      return {
        type: 'list',
        botSlug: cursor['botSlug'],
        fingerprint: cursor['fingerprint'],
        at: cursor['at'],
        id: cursor['id'],
        maxRowid: Number(cursor['maxRowid']),
      };
    }
  } catch {}
  throw new Error('inbox_history: invalid cursor');
}

function encode(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function time(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('inbox_history: time filters must be ISO timestamps');
  return new Date(value).toISOString();
}

export function createInboxHistoryQuery(
  database: OperationalDatabaseModulePort,
  channels: ChannelStore,
  now: () => Date = () => new Date(),
): InboxHistoryQuery {
  const snapshots = new Map<string, SearchSnapshot>();
  const item = (row: HistoryRow): InboxHistoryItem => ({
    sourceEventId: row.source_event_id,
    at: row.created_at,
    kind: row.reason,
    sourceKind: row.source_kind,
    state: row.state,
    ...(row.channel_id === null
      ? {}
      : {
          channelId: row.channel_id,
          ...(channels.get(row.channel_id)?.name === undefined
            ? {}
            : { channelName: channels.get(row.channel_id)!.name }),
        }),
    ...(row.cause_source_event_id === null
      ? {}
      : { causeSourceEventId: row.cause_source_event_id }),
    ...(row.resolution_note === null ? {} : { resolutionNote: row.resolution_note }),
    snippet: Array.from(row.snippet).slice(0, 300).join(''),
  });

  return {
    clear() {
      snapshots.clear();
    },
    rebuild() {
      snapshots.clear();
      database.transaction((db) =>
        db.exec("INSERT INTO inbox_history_fts(inbox_history_fts) VALUES ('rebuild')"),
      );
    },
    list(botSlug, input = {}) {
      const limit = input.limit ?? 30;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
        throw new Error('inbox_history: limit must be 1–50');
      const query = input.query?.trim();
      if (query !== undefined && (Array.from(query).length < 3 || Array.from(query).length > 300))
        throw new Error('inbox_history: trigram search needs 3–300 characters');
      for (const value of [input.kind, input.channelId, input.causeSourceEventId]) {
        if (value !== undefined && (value.length === 0 || value.length > 150))
          throw new Error('inbox_history: invalid filter');
      }
      const since = time(input.since);
      const until = time(input.until);
      if (since !== undefined && until !== undefined && since > until)
        throw new Error('inbox_history: since must not follow until');
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            botSlug,
            query,
            kind: input.kind,
            channelId: input.channelId,
            causeSourceEventId: input.causeSourceEventId,
            since,
            until,
          }),
        )
        .digest('hex');
      const cursor = input.cursor === undefined ? undefined : cursorDecode(input.cursor);
      const predicates = ['a.bot_slug = ?'];
      const values: SQLInputValue[] = [botSlug];
      if (input.kind === 'dm') {
        predicates.push("a.reason IN ('human-dm', 'bot-dm')");
      } else if (input.kind === 'mention') {
        predicates.push("a.reason = 'group-mention'");
      } else if (input.kind !== undefined) {
        predicates.push('(a.reason = ? OR e.source_kind = ?)');
        values.push(input.kind, input.kind);
      }
      if (input.channelId !== undefined) {
        predicates.push(
          '(e.channel_id = ? OR EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id AND p.channel_id = ?))',
        );
        values.push(input.channelId, input.channelId);
      }
      if (input.causeSourceEventId !== undefined) {
        predicates.push(`${CAUSE} = ?`);
        values.push(input.causeSourceEventId);
      }
      if (since !== undefined) {
        predicates.push('e.created_at >= ?');
        values.push(since);
      }
      if (until !== undefined) {
        predicates.push('e.created_at <= ?');
        values.push(until);
      }
      const from = `FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
        JOIN inbox_history_documents d ON d.rowid = e.rowid`;
      const where = predicates.join(' AND ');
      if (query === undefined) {
        if (
          cursor !== undefined &&
          (cursor.type !== 'list' ||
            cursor.botSlug !== botSlug ||
            cursor.fingerprint !== fingerprint)
        )
          throw new Error('inbox_history: cursor does not match this query');
        const maxRowid =
          cursor?.type === 'list'
            ? cursor.maxRowid
            : database.read((db) =>
                Number(
                  db
                    .prepare('SELECT coalesce(max(rowid), 0) AS max_rowid FROM source_events')
                    .get()!.max_rowid,
                ),
              );
        const rows = database.read(
          (db) =>
            db
              .prepare(`
          SELECT ${FIELDS}, d.search_text AS snippet ${from}
          WHERE ${where} AND e.rowid <= ?
            ${cursor === undefined ? '' : 'AND (e.created_at < ? OR (e.created_at = ? AND e.source_event_id < ?))'}
          ORDER BY e.created_at DESC, e.source_event_id DESC LIMIT ?
        `)
              .all(
                ...values,
                maxRowid,
                ...(cursor?.type === 'list' ? [cursor.at, cursor.at, cursor.id] : []),
                limit + 1,
              ) as unknown as HistoryRow[],
        );
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map(item),
          ...(rows.length <= limit || last === undefined
            ? {}
            : {
                nextCursor: encode({
                  type: 'list',
                  botSlug,
                  fingerprint,
                  maxRowid,
                  at: last.created_at,
                  id: last.source_event_id,
                }),
              }),
        };
      }

      const timestamp = now().getTime();
      for (const [key, snapshot] of snapshots)
        if (snapshot.expires <= timestamp) snapshots.delete(key);
      let token: string;
      let offset: number;
      let snapshot: SearchSnapshot;
      if (cursor === undefined) {
        const match = '"' + query.replaceAll('"', '""') + '"';
        const rows = database.read(
          (db) =>
            db
              .prepare(`
          SELECT e.source_event_id ${from}
          JOIN inbox_history_fts ON inbox_history_fts.rowid = e.rowid
          WHERE ${where} AND inbox_history_fts MATCH ?
          ORDER BY bm25(inbox_history_fts), e.created_at DESC, e.source_event_id DESC
          LIMIT 10001
        `)
              .all(...values, match) as Array<{ source_event_id: string }>,
        );
        if (rows.length > 10000)
          throw new Error(
            'inbox_history: more than 10000 matches; narrow the kind, Channel or time range',
          );
        token = randomUUID();
        offset = 0;
        snapshot = {
          botSlug,
          fingerprint,
          ids: rows.map((row) => row.source_event_id),
          expires: timestamp + 600_000,
        };
        while (snapshots.size >= 64) snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(token, snapshot);
      } else {
        if (cursor.type !== 'search')
          throw new Error('inbox_history: cursor does not match this query');
        const found = snapshots.get(cursor.token);
        if (
          found === undefined ||
          found.botSlug !== botSlug ||
          found.fingerprint !== fingerprint ||
          cursor.offset > found.ids.length
        )
          throw new Error('inbox_history: search cursor expired or does not match this query');
        token = cursor.token;
        offset = cursor.offset;
        snapshot = found;
      }
      const items: InboxHistoryItem[] = [];
      while (items.length < limit && offset < snapshot.ids.length) {
        const ids = snapshot.ids.slice(offset, offset + limit - items.length);
        offset += ids.length;
        const rows = database.read(
          (db) =>
            db
              .prepare(`
          SELECT ${FIELDS}, snippet(inbox_history_fts, 0, '', '', '…', 64) AS snippet ${from}
          JOIN inbox_history_fts ON inbox_history_fts.rowid = e.rowid
          WHERE ${where} AND inbox_history_fts MATCH ?
            AND e.source_event_id IN (SELECT value FROM json_each(?))
        `)
              .all(
                ...values,
                '"' + query.replaceAll('"', '""') + '"',
                JSON.stringify(ids),
              ) as unknown as HistoryRow[],
        );
        const byId = new Map(rows.map((row) => [row.source_event_id, row]));
        for (const id of ids) {
          const row = byId.get(id);
          if (row !== undefined) items.push(item(row));
        }
      }
      return {
        items,
        ...(offset < snapshot.ids.length
          ? { nextCursor: encode({ type: 'search', token, offset }) }
          : {}),
      };
    },
  };
}
