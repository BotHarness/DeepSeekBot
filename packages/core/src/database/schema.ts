import type { DatabaseSync } from 'node:sqlite';

export const FOUNDATION_SCHEMA_GENERATION = 1;

export interface SchemaMigration {
  readonly id: string;

  module: string;
  description: string;

  rebuildsReferencedTables?: boolean;
  migrate(database: DatabaseSync): void;
}

export type PlannedSchemaMigration = Readonly<SchemaMigration & { generation: number }>;

export const FOUNDATION_SCHEMA_ID = 'foundation';
export const LEGACY_SCHEMA_GENERATION_LIMIT = 153;

export interface SchemaPlan {
  readonly targetGeneration: number;
  readonly migrations: readonly PlannedSchemaMigration[];
  generationOf(id: string): number;
}

export interface LegacyForwardMigrationPlanEntry {
  readonly source: 'dsh-storage-domain';
  readonly sourceName: string;
  readonly targetOwner: 'roster' | 'session-ownership';
  readonly policy: 'import-once-when-target-empty';
}

export const LEGACY_FORWARD_MIGRATION_PLAN: readonly LegacyForwardMigrationPlanEntry[] = [
  {
    source: 'dsh-storage-domain',
    sourceName: 'botharness_roster',
    targetOwner: 'roster',
    policy: 'import-once-when-target-empty',
  },
  {
    source: 'dsh-storage-domain',
    sourceName: 'botharness_sessions',
    targetOwner: 'session-ownership',
    policy: 'import-once-when-target-empty',
  },
];

export function defineSchemaPlan(migrations: readonly SchemaMigration[] = []): SchemaPlan {
  const ids = new Set([FOUNDATION_SCHEMA_ID]);
  const ordered = migrations.map((migration, index) => {
    if (
      typeof migration.id !== 'string' ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(migration.id) ||
      ids.has(migration.id)
    ) {
      throw new TypeError(`Schema migration id must be unique kebab-case: ${migration.id}`);
    }
    ids.add(migration.id);
    if (typeof migration.migrate !== 'function') {
      throw new TypeError(`Schema migration ${migration.id} must define a synchronous migration`);
    }
    if (migration.module.trim().length === 0) {
      throw new TypeError(`Schema migration ${migration.id} must name its owning module`);
    }
    return Object.freeze({ ...migration, generation: FOUNDATION_SCHEMA_GENERATION + index + 1 });
  });

  return Object.freeze({
    targetGeneration: FOUNDATION_SCHEMA_GENERATION + ordered.length,
    migrations: Object.freeze(ordered),
    generationOf(id: string): number {
      if (id === FOUNDATION_SCHEMA_ID) return FOUNDATION_SCHEMA_GENERATION;
      const migration = ordered.find((entry) => entry.id === id);
      if (migration === undefined) throw new TypeError(`Unknown schema migration id: ${id}`);
      return migration.generation;
    },
  });
}

export const FOUNDATION_SCHEMA_PLAN = defineSchemaPlan();
