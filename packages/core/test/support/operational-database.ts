import { join } from 'node:path';
import { type OperationalDatabaseFaultStage } from '../../src/database/owner.js';
import { defineSchemaPlan, type SchemaPlan } from '../../src/database/schema.js';

export function planWithRecords(): SchemaPlan {
  return defineSchemaPlan([
    {
      id: 'test-step-1',
      module: 'test-records',
      description: 'create a representative owning-module table',
      migrate(database) {
        database.exec(`
          CREATE TABLE test_records (
            id INTEGER PRIMARY KEY,
            value TEXT NOT NULL
          ) STRICT;
        `);
      },
    },
  ]);
}

export function databasePath(dshHome: string): string {
  return join(dshHome, 'botharness', 'botharness.db');
}

export function faultAt(
  stage: OperationalDatabaseFaultStage,
): (context: { stage: OperationalDatabaseFaultStage }) => void {
  return (context) => {
    if (context.stage === stage) throw new Error(`fault:${stage}`);
  };
}
