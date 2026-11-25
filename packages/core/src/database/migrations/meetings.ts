import type { DatabaseSync } from 'node:sqlite';

import type { SchemaMigration } from '../schema.js';
import { rebuildWithKind } from './shared.js';

export const MEETING_ATTENDANCE_MIGRATION: SchemaMigration = {
  id: 'meeting-attendance',
  module: 'meetings',
  description: 'Own Meeting Attendances and admit what a Bot hears in a meeting into its Bot Inbox',
  rebuildsReferencedTables: true,
  migrate(database) {
    const linked = linkedObjects(database, ['source_events', 'inbox_admissions']);
    for (const object of [...linked].reverse())
      database.exec(`DROP ${object.type.toUpperCase()} "${object.name}"`);
    rebuildWithKind(database, 'source_events', 'self-record', ['meeting-speech']);
    rebuildWithKind(database, 'inbox_admissions', 'bot-action', ['meeting']);
    for (const object of linked) database.exec(object.sql);
    database.exec(`
      CREATE TABLE meeting_attendances (
        attendance_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        platform TEXT NOT NULL,
        call_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('in-meeting', 'left', 'failed')),
        origin_channel_id TEXT,
        dispatcher_json TEXT NOT NULL CHECK (json_valid(dispatcher_json)),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        end_reason TEXT
      );
      CREATE INDEX meeting_attendances_bot ON meeting_attendances (bot_slug, started_at);
      CREATE TABLE meeting_lines (
        attendance_id TEXT NOT NULL REFERENCES meeting_attendances(attendance_id),
        seq INTEGER NOT NULL,
        at TEXT NOT NULL,
        author TEXT NOT NULL CHECK (author = 'meeting'),
        speaker TEXT,
        body TEXT NOT NULL,
        PRIMARY KEY (attendance_id, seq)
      );
    `);
  },
};

function linkedObjects(
  database: DatabaseSync,
  tables: readonly string[],
): Array<{ type: 'view' | 'trigger'; name: string; sql: string }> {
  const all = database
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') AND sql IS NOT NULL ORDER BY rowid",
    )
    .all() as Array<{ type: 'view' | 'trigger'; name: string; sql: string }>;
  const names = new Set(tables);
  const linked = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of all) {
      if (linked.has(object.name)) continue;
      if (![...names].some((name) => new RegExp(`\\b${name}\\b`, 'u').test(object.sql))) continue;
      linked.add(object.name);
      names.add(object.name);
      grew = true;
    }
  }
  return all
    .filter((object) => linked.has(object.name))
    .sort((left, right) => (left.type === right.type ? 0 : left.type === 'view' ? -1 : 1))
    .map(({ type, name, sql }) => ({ type, name, sql }));
}
