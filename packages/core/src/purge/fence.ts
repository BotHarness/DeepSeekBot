import type { DatabaseSync } from 'node:sqlite';

export function sourceContentPurged(db: DatabaseSync, id: string): boolean {
  return (
    db
      .prepare(`SELECT 1 FROM messaging_purge_facts f LEFT JOIN source_events e ON e.source_event_id = ?
    WHERE f.source_event_id = ? OR f.source_event_id IN
      (json_extract(e.payload_json, '$.botCausation.rootSourceEventId'),
       json_extract(e.payload_json, '$.botCausation.parentSourceEventId')) LIMIT 1`)
      .get(id, id) !== undefined
  );
}

export function requireSourceContent(db: DatabaseSync, id: string): void {
  if (sourceContentPurged(db, id)) throw new Error('Source Event content was purged');
}

export function requireSourceEffects(db: DatabaseSync, id: string, botSlug: string): void {
  requireSourceContent(db, id);
  const admission = db
    .prepare('SELECT last_error FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?')
    .get(id, botSlug);
  if (admission?.last_error === 'channel-ended') throw new Error('Source Channel has ended');
}

export function requireAssignmentSource(db: DatabaseSync, id: string, botSlug: string): void {
  const disbanded = db
    .prepare(`SELECT 1 FROM source_events e
    JOIN channel_placements p ON p.source_event_id IN (e.source_event_id,
      json_extract(e.payload_json, '$.botCausation.rootSourceEventId'),
      json_extract(e.payload_json, '$.botCausation.parentSourceEventId'))
    JOIN channel_records c ON c.channel_id = p.channel_id
    WHERE e.source_event_id = ? AND json_extract(c.record_json, '$.type') = 'group'
      AND json_extract(c.record_json, '$.deletedAt') IS NOT NULL
      AND json_extract(c.record_json, '$.name') = '' LIMIT 1`)
    .get(id);
  if (disbanded === undefined) requireSourceEffects(db, id, botSlug);
}
