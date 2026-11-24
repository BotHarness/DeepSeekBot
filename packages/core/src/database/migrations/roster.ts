import type { SchemaMigration } from '../schema.js';

export const ROSTER_ARRANGEMENT_MIGRATION: SchemaMigration = {
  id: 'roster-arrangement',
  module: 'roster',
  description: 'Own Channel sections and roster arrangement in the Profile database',
  migrate(database) {
    database.exec(`
      CREATE TABLE roster_arrangement (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE TABLE roster_arrangement_import (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        imported_at TEXT NOT NULL
      );
    `);
  },
};

export const HUMAN_ROSTER_ARRANGEMENTS_MIGRATION: SchemaMigration = {
  id: 'human-roster-arrangements',
  module: 'roster',
  description: 'Keep each Human sidebar arrangement independent from the legacy local Human roster',
  migrate(database) {
    database.exec(`CREATE TABLE human_roster_arrangements (
      human_id TEXT PRIMARY KEY REFERENCES humans(human_id) ON DELETE CASCADE,
      body TEXT NOT NULL
    )`);
  },
};
