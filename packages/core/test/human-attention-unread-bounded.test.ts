import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('Human attention unread status', () => {
  it('reads placements only after each Channel read position', () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: createTempRoot(), schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'human-attention');
    const statements: string[] = [];
    const recorded: OperationalDatabaseModulePort = {
      module: database.module,
      read: (query) =>
        database.read((db) =>
          query(
            new Proxy(db, {
              get(target, key) {
                if (key === 'prepare')
                  return (sql: string) => {
                    statements.push(sql);
                    return target.prepare(sql);
                  };
                const value = Reflect.get(target, key) as unknown;
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }) as DatabaseSync,
          ),
        ),
      transaction: (command, topics) => database.transaction(command, topics),
    };
    const attention = createHumanAttentionQuery(recorded);
    expect(attention.status(true)).toMatchObject({ unreadCount: 0 });
    const sql = statements.find((statement) => statement.includes('unread_events'));
    expect(sql).toBeDefined();
    const plan = database.read((db) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql!}`)
        .all()
        .map((row) => String((row as { detail: string }).detail)),
    );
    expect(plan).toContainEqual(
      expect.stringMatching(/^SEARCH p USING .*channel_id=\? AND revision>\?/),
    );
    expect(plan.some((detail) => /^SCAN p\b/.test(detail))).toBe(false);
  });
});
