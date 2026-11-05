import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseModulePort,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('Human attention unread status', () => {
  const recorder = () => {
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
    const plan = (sql: string) =>
      database.read((db) =>
        db
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all()
          .map((row) => String((row as { detail: string }).detail)),
      );
    return { attention: createHumanAttentionQuery(recorded), statements, plan };
  };

  it('reads placements only after each Channel read position', () => {
    const { attention, statements, plan } = recorder();
    expect(attention.status(true)).toMatchObject({ unreadCount: 0 });
    attention.unreadByChannel();
    const counts = statements.filter(
      (statement) =>
        statement.includes('count(*) AS count FROM') || statement.includes('AS unread_count'),
    );
    expect(counts.length).toBeGreaterThanOrEqual(3);
    for (const sql of counts) {
      const details = plan(sql);
      expect(details).toContainEqual(
        expect.stringMatching(/^SEARCH p USING .*channel_id=\? AND revision>\?/),
      );
      expect(details.some((detail) => /^SCAN p\b/.test(detail))).toBe(false);
    }
    for (const sql of counts.filter((statement) => !statement.includes('p.for_human = 1')))
      expect(plan(sql)).toContainEqual(
        expect.stringMatching(/^SEARCH p USING INDEX channel_placements_latest_message /),
      );
    const replies = counts.find((sql) => sql.includes('p.for_human = 1'));
    expect(plan(replies!)).toContainEqual(
      expect.stringMatching(/^SEARCH p USING INDEX channel_placements_for_human /),
    );
  });

  it('never scans message, placement or Admission history for action attention', () => {
    const { attention, statements, plan } = recorder();
    attention.durableAttention();
    attention.actionSummary();
    attention.list({ limit: 20 });
    attention.openTimedQuestionCards();
    const scans = statements
      .flatMap(plan)
      .filter(
        (detail) =>
          /^SCAN (e|p)( USING (COVERING )?INDEX sqlite_autoindex_\w+)?$/.test(detail) ||
          detail.includes('inbox_admissions_bot_pending'),
      );
    expect(scans).toEqual([]);
  });

  it('finds private input requests through their partial index', () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: createTempRoot(), schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'messaging');
    const statements: string[] = [];
    const store = createSqliteChannelStore({
      rootDir: createTempRoot(),
      database: {
        ...database,
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
      },
    });
    expect(store.privateInputRequests?.()).toEqual([]);
    const sql = statements.find((statement) => statement.includes('privateInputRequest'))!;
    const details = database.read((db) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => String((row as { detail: string }).detail)),
    );
    expect(details).toContainEqual(expect.stringContaining('source_events_attention_private'));
    expect(details.some((detail) => /^SCAN e$/.test(detail))).toBe(false);
  });
});
