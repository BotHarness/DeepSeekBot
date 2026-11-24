import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

interface StewardRole {
  botSlug: string;
  revision: number;
}

export function readSteward(database: OperationalDatabaseModulePort): StewardRole | undefined {
  return database.read(
    (db) =>
      db
        .prepare('SELECT bot_slug AS botSlug, revision FROM steward_role WHERE singleton = 1')
        .get() as StewardRole | undefined,
  );
}

export function isSteward(database: OperationalDatabaseModulePort, botSlug: string): boolean {
  return readSteward(database)?.botSlug === botSlug;
}

export function initializeSteward(db: DatabaseSync, botSlug: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO steward_role (singleton, bot_slug)
      SELECT 1, t.bot_slug FROM tob_identity t
      JOIN team_settings s ON s.owner_human_id = t.human_id
      WHERE t.bot_slug = ?
  `).run(botSlug);
}

export function humanDmForSource(
  db: DatabaseSync,
  slug: string,
  humanId: string,
  sourceEventId: string,
): string | undefined {
  const row = db
    .prepare(`
    SELECT e.channel_id FROM source_events e
    JOIN channel_records c ON c.channel_id = e.channel_id
    WHERE e.source_event_id = ? AND e.source_kind = 'human-message'
      AND COALESCE(e.human_id, 'local-human') = ?
      AND json_extract(c.record_json, '$.type') = 'dm'
      AND json_extract(c.record_json, '$.botSlug') = ?
      AND COALESCE(json_extract(c.record_json, '$.dmHumanId'), c.owner_human_id) = ?
      AND json_type(c.record_json, '$.deletedAt') IS NULL
  `)
    .get(sourceEventId, humanId, slug, humanId);
  return typeof row?.channel_id === 'string' ? row.channel_id : undefined;
}

export function isStewardDmSource(
  database: OperationalDatabaseModulePort,
  slug: string,
  sourceEventId: string | undefined,
): boolean {
  if (sourceEventId === undefined || !isSteward(database, slug)) return false;
  return database.read((db) => {
    const owner = db
      .prepare(`
      SELECT t.owner_human_id FROM team_settings t
      JOIN persona_bots b ON b.owner_human_id = t.owner_human_id
      WHERE b.slug = ?
    `)
      .get(slug)?.owner_human_id;
    return (
      typeof owner === 'string' && humanDmForSource(db, slug, owner, sourceEventId) !== undefined
    );
  });
}
