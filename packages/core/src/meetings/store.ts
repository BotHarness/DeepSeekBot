import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type MeetingPlatform = 'zoom' | 'synthetic';
export type MeetingState = 'waiting' | 'in-meeting' | 'left' | 'failed';
export type MeetingEndReason =
  | 'meeting-ended'
  | 'alone'
  | 'time-limit'
  | 'asked-to-leave'
  | 'not-admitted'
  | 'join-failed'
  | 'audio-lost'
  | 'host-stopped';

export interface MeetingDispatcher {
  readonly kind: 'owner' | 'member' | 'external' | 'bot';
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

export interface MeetingAttendance {
  readonly id: string;
  readonly botSlug: string;
  readonly platform: MeetingPlatform;
  readonly url: string;
  readonly state: MeetingState;
  readonly listenOnly: boolean;
  readonly originChannelId?: string | undefined;
  readonly dispatcher: MeetingDispatcher;
  readonly startedAt: string;
  readonly joinedAt?: string | undefined;
  readonly endedAt?: string | undefined;
  readonly endReason?: MeetingEndReason | undefined;
}

export interface MeetingLine {
  readonly seq: number;
  readonly at: string;
  readonly author: 'meeting' | 'bot';
  readonly speaker?: string | undefined;
  readonly body: string;
}

export interface MeetingSpeechFacts {
  readonly id: string;
  readonly platform: MeetingPlatform;
  readonly listenOnly: boolean;
  readonly originChannelId?: string | undefined;
  readonly lines: readonly MeetingLine[];
  readonly ended?: MeetingEndReason | undefined;
}

export const MEETING_LIVE_STATES: readonly MeetingState[] = ['waiting', 'in-meeting'];
const TOPICS = ['meetings', 'source-event', 'bot-inbox'] as const;
const PENDING_LINES = 200;

interface AttendanceRow {
  attendance_id: string;
  bot_slug: string;
  platform: MeetingPlatform;
  url: string;
  state: MeetingState;
  listen_only: number;
  origin_channel_id: string | null;
  dispatcher_json: string;
  started_at: string;
  joined_at: string | null;
  ended_at: string | null;
  end_reason: MeetingEndReason | null;
}

function attendance(row: AttendanceRow): MeetingAttendance {
  return {
    id: row.attendance_id,
    botSlug: row.bot_slug,
    platform: row.platform,
    url: row.url,
    state: row.state,
    listenOnly: row.listen_only === 1,
    ...(row.origin_channel_id === null ? {} : { originChannelId: row.origin_channel_id }),
    dispatcher: JSON.parse(row.dispatcher_json) as MeetingDispatcher,
    startedAt: row.started_at,
    ...(row.joined_at === null ? {} : { joinedAt: row.joined_at }),
    ...(row.ended_at === null ? {} : { endedAt: row.ended_at }),
    ...(row.end_reason === null ? {} : { endReason: row.end_reason }),
  };
}

export interface MeetingStore {
  create(input: {
    botSlug: string;
    platform: MeetingPlatform;
    url: string;
    listenOnly: boolean;
    originChannelId?: string | undefined;
    dispatcher: MeetingDispatcher;
  }): MeetingAttendance;
  get(id: string): MeetingAttendance | undefined;
  live(botSlug: string): MeetingAttendance | undefined;
  list(botSlug: string, limit?: number): MeetingAttendance[];
  joined(id: string): MeetingAttendance | undefined;
  hear(id: string, line: { speaker?: string | undefined; body: string }): HeardLine | undefined;
  said(id: string, body: string): MeetingLine | undefined;
  end(id: string, state: 'left' | 'failed', reason: MeetingEndReason): HeardLine | undefined;
  lines(id: string, after?: number): MeetingLine[];
  failInterrupted(): string[];
}

export interface HeardLine {
  readonly line?: MeetingLine;
  readonly sourceEventId: string;
  readonly admitted: boolean;
}

export function createMeetingStore(options: {
  database: OperationalDatabaseModulePort;
  now?: () => Date;
  createId?: () => string;
}): MeetingStore {
  const { database } = options;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  const row = (db: DatabaseSync, id: string) =>
    db.prepare('SELECT * FROM meeting_attendances WHERE attendance_id = ?').get(id) as
      | AttendanceRow
      | undefined;

  const appendLine = (
    db: DatabaseSync,
    id: string,
    author: MeetingLine['author'],
    speaker: string | undefined,
    body: string,
  ): MeetingLine => {
    const next = (
      db
        .prepare(
          'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM meeting_lines WHERE attendance_id = ?',
        )
        .get(id) as { seq: number }
    ).seq;
    const at = now().toISOString();
    db.prepare(
      'INSERT INTO meeting_lines (attendance_id, seq, at, author, speaker, body) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, next, at, author, speaker ?? null, body);
    return { seq: next, at, author, ...(speaker === undefined ? {} : { speaker }), body };
  };

  const admit = (
    db: DatabaseSync,
    current: AttendanceRow,
    line: MeetingLine | undefined,
    ended: MeetingEndReason | undefined,
  ): HeardLine => {
    const pending = db
      .prepare(`
        SELECT e.source_event_id, e.payload_json FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id AND a.bot_slug = e.bot_slug
         WHERE e.source_kind = 'meeting-speech' AND e.bot_slug = ?
           AND json_extract(e.payload_json, '$.meeting.id') = ?
           AND e.observed_at IS NULL AND a.observed_at IS NULL
           AND a.attempt_state IN ('pending', 'retryable') AND a.side_effect_started_at IS NULL
         ORDER BY e.rowid DESC LIMIT 1
      `)
      .get(current.bot_slug, current.attendance_id) as
      | { source_event_id: string; payload_json: string }
      | undefined;
    const previous =
      pending === undefined
        ? []
        : (JSON.parse(pending.payload_json) as { meeting: MeetingSpeechFacts }).meeting.lines;
    const lines = [...previous, ...(line === undefined ? [] : [line])].slice(-PENDING_LINES);
    const facts: MeetingSpeechFacts = {
      id: current.attendance_id,
      platform: current.platform,
      listenOnly: current.listen_only === 1,
      ...(current.origin_channel_id === null ? {} : { originChannelId: current.origin_channel_id }),
      lines,
      ...(ended === undefined ? {} : { ended }),
    };
    const payload = JSON.stringify({ meeting: facts });
    const body = ended !== undefined ? `Meeting ended: ${ended}` : (line?.body ?? '');
    if (pending !== undefined) {
      db.prepare(
        'UPDATE source_events SET body = ?, payload_json = ? WHERE source_event_id = ?',
      ).run(body, payload, pending.source_event_id);
      return {
        ...(line === undefined ? {} : { line }),
        sourceEventId: pending.source_event_id,
        admitted: false,
      };
    }
    const sourceEventId = createId();
    db.prepare(`
      INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json)
      VALUES (?, 'meeting-speech', ?, ?, ?, ?)
    `).run(sourceEventId, current.bot_slug, body, now().toISOString(), payload);
    db.prepare(`
      INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_wake_mode)
      VALUES (?, ?, 'meeting', 'immediate')
    `).run(sourceEventId, current.bot_slug);
    return { ...(line === undefined ? {} : { line }), sourceEventId, admitted: true };
  };

  return {
    create(input) {
      const id = `meet-${createId().replaceAll('-', '').slice(0, 16)}`;
      const startedAt = now().toISOString();
      database.transaction((db) => {
        db.prepare(`
          INSERT INTO meeting_attendances
            (attendance_id, bot_slug, platform, url, state, listen_only, origin_channel_id, dispatcher_json, started_at)
          VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?, ?)
        `).run(
          id,
          input.botSlug,
          input.platform,
          input.url,
          input.listenOnly ? 1 : 0,
          input.originChannelId ?? null,
          JSON.stringify(input.dispatcher),
          startedAt,
        );
      }, TOPICS);
      return database.read((db) => attendance(row(db, id)!));
    },
    get(id) {
      return database.read((db) => {
        const found = row(db, id);
        return found === undefined ? undefined : attendance(found);
      });
    },
    live(botSlug) {
      return database.read((db) => {
        const found = db
          .prepare(
            "SELECT * FROM meeting_attendances WHERE bot_slug = ? AND state IN ('waiting', 'in-meeting') ORDER BY started_at DESC LIMIT 1",
          )
          .get(botSlug) as AttendanceRow | undefined;
        return found === undefined ? undefined : attendance(found);
      });
    },
    list(botSlug, limit = 20) {
      return database.read((db) =>
        (
          db
            .prepare(
              'SELECT * FROM meeting_attendances WHERE bot_slug = ? ORDER BY started_at DESC LIMIT ?',
            )
            .all(botSlug, limit) as unknown as AttendanceRow[]
        ).map(attendance),
      );
    },
    joined(id) {
      return database.transaction((db) => {
        db.prepare(
          "UPDATE meeting_attendances SET state = 'in-meeting', joined_at = ? WHERE attendance_id = ? AND state = 'waiting'",
        ).run(now().toISOString(), id);
        const found = row(db, id);
        return found === undefined ? undefined : attendance(found);
      }, TOPICS);
    },
    hear(id, input) {
      const body = input.body.trim();
      if (body === '') return undefined;
      return database.transaction((db) => {
        const current = row(db, id);
        if (current === undefined || current.state !== 'in-meeting') return undefined;
        const line = appendLine(db, id, 'meeting', input.speaker, body);
        return admit(db, current, line, undefined);
      }, TOPICS);
    },
    said(id, body) {
      return database.transaction((db) => {
        const current = row(db, id);
        if (current === undefined || current.state !== 'in-meeting') return undefined;
        return appendLine(db, id, 'bot', undefined, body);
      }, TOPICS);
    },
    end(id, state, reason) {
      return database.transaction((db) => {
        const current = row(db, id);
        if (current === undefined || !MEETING_LIVE_STATES.includes(current.state)) return undefined;
        db.prepare(
          'UPDATE meeting_attendances SET state = ?, ended_at = ?, end_reason = ? WHERE attendance_id = ?',
        ).run(state, now().toISOString(), reason, id);
        return current.state === 'in-meeting' ? admit(db, current, undefined, reason) : undefined;
      }, TOPICS);
    },
    lines(id, after = 0) {
      return database.read((db) =>
        (
          db
            .prepare(
              'SELECT seq, at, author, speaker, body FROM meeting_lines WHERE attendance_id = ? AND seq > ? ORDER BY seq LIMIT 500',
            )
            .all(id, after) as unknown as Array<{
            seq: number;
            at: string;
            author: MeetingLine['author'];
            speaker: string | null;
            body: string;
          }>
        ).map((line) => ({
          seq: line.seq,
          at: line.at,
          author: line.author,
          ...(line.speaker === null ? {} : { speaker: line.speaker }),
          body: line.body,
        })),
      );
    },
    failInterrupted() {
      return database.transaction((db) => {
        const live = db
          .prepare(
            "SELECT attendance_id FROM meeting_attendances WHERE state IN ('waiting', 'in-meeting')",
          )
          .all() as Array<{ attendance_id: string }>;
        db.prepare(
          "UPDATE meeting_attendances SET state = 'failed', ended_at = ?, end_reason = 'host-stopped' WHERE state IN ('waiting', 'in-meeting')",
        ).run(now().toISOString());
        return live.map((item) => item.attendance_id);
      }, TOPICS);
    },
  };
}

export function meetingInboxFacts(payloadJson: string | null | undefined) {
  if (payloadJson == null) return {};
  const parsed = JSON.parse(payloadJson) as { meeting?: MeetingSpeechFacts };
  return parsed.meeting === undefined ? {} : { meeting: parsed.meeting };
}

export function hasPendingMeetingSpeech(
  database: OperationalDatabaseModulePort,
  botSlug: string,
): boolean {
  return (
    database.read((db) =>
      db
        .prepare(`
          SELECT 1 AS found FROM inbox_admissions a JOIN source_events e USING(source_event_id)
           WHERE a.bot_slug = ? AND a.reason = 'meeting' AND a.attempt_state = 'pending'
             AND e.observed_at IS NULL
           LIMIT 1
        `)
        .get(botSlug),
    ) !== undefined
  );
}
