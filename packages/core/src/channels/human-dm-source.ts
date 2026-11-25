import type { OperationalDatabaseModulePort } from '../database/owner.js';

export function isOwnHumanDmSource(
  database: OperationalDatabaseModulePort,
  botSlug: string,
  sourceEventId: string | undefined,
): boolean {
  if (sourceEventId === undefined) return false;
  return database.read(
    (db) =>
      db
        .prepare(`
      SELECT 1 FROM source_events e
      JOIN channel_records c ON c.channel_id = e.channel_id
      JOIN persona_bots b ON b.slug = ?
      WHERE e.source_event_id = ? AND e.source_kind = 'human-message'
        AND COALESCE(e.human_id, 'local-human') = b.owner_human_id
        AND json_extract(c.record_json, '$.type') = 'dm'
        AND json_extract(c.record_json, '$.botSlug') = b.slug
        AND COALESCE(json_extract(c.record_json, '$.dmHumanId'), c.owner_human_id) = b.owner_human_id
        AND json_type(c.record_json, '$.deletedAt') IS NULL
    `)
        .get(botSlug, sourceEventId) !== undefined,
  );
}
