import { createHash } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createHumanAttentionQuery, UNREAD_COUNT_LIMIT } from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const indexes = [
  'source_events_attention_question',
  'source_events_attention_approval',
  'source_events_attention_private',
  'source_events_attention_grant',
  'source_events_attention_rejection',
  'source_events_attention_takeover',
];

describe('Human attention candidate indexes', () => {
  it.each([112, 113])(
    'upgrades generation %i without rewriting canonical history and refuses older writers',
    (generation) => {
      const dshHome = createTempRoot('attention-index-upgrade-');
      const priorPlan = defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
          (migration) => migration.generation <= generation,
        ),
      );
      const prior = trackTestOwner(mountOperationalDatabase({ dshHome, schemaPlan: priorPlan }));
      const database = attachOperationalModule(prior, 'attention-index-upgrade');
      database.transaction((connection) => {
        const event = connection.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', 'unplaced-history', ?, ?, ?, ?)`);
        for (let index = 0; index < 2000; index++) {
          const id = `unplaced-${index}`;
          event.run(
            id,
            id,
            'Retained historical content',
            '2026-11-01T00:00:00.000Z',
            JSON.stringify({
              author: { kind: 'bot', slug: 'ada' },
              ...(index % 100 === 0 ? { grantRequest: true } : {}),
            }),
          );
        }
      });
      const facts = () =>
        database.read((connection) =>
          createHash('sha256')
            .update(
              JSON.stringify(
                connection.prepare('SELECT * FROM source_events ORDER BY source_event_id').all(),
              ),
            )
            .digest('hex'),
        );
      const before = facts();
      prior.close();
      const upgraded = trackTestOwner(
        mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      expect(upgraded.mode).toBe('ready');
      expect(upgraded.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      const current = attachOperationalModule(upgraded, 'attention-index-upgrade');
      const after = current.read((connection) =>
        createHash('sha256')
          .update(
            JSON.stringify(
              connection.prepare('SELECT * FROM source_events ORDER BY source_event_id').all(),
            ),
          )
          .digest('hex'),
      );
      expect(after).toBe(before);
      expect(
        current.read((connection) =>
          connection
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'source_events_attention_%' ORDER BY name",
            )
            .all()
            .map((row) => row.name),
        ),
      ).toEqual([...indexes].sort());
      expect(
        current.read((connection) => connection.prepare('PRAGMA integrity_check').get()),
      ).toEqual({
        integrity_check: 'ok',
      });
      expect(
        current.read((connection) => connection.prepare('PRAGMA foreign_key_check').all()),
      ).toEqual([]);
      upgraded.close();
      const older = trackTestOwner(mountOperationalDatabase({ dshHome, schemaPlan: priorPlan }));
      expect(older.mode).toBe('recovery');
      expect(older.diagnostics().recovery?.code).toBe('upgrade-required');
    },
  );

  it('uses selective candidates rather than scanning placements for an empty action list', () => {
    const dshHome = createTempRoot('attention-index-plan-');
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'attention-index-plan');
    const channels = createSqliteChannelStore({ database, rootDir: dshHome });
    const channel = channels.getOrCreateDm('ada', 'Ada')!;
    database.transaction((connection) => {
      const event = connection.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', 'ada', ?, ?, ?, ?, ?)`);
      const placement = connection.prepare(`INSERT INTO channel_placements
        (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)`);
      for (let index = 1; index <= 2000; index++) {
        const id = `ordinary-${index}`;
        event.run(
          id,
          channel.id,
          id,
          'Ordinary history',
          '2026-11-01T00:00:00.000Z',
          JSON.stringify({ author: { kind: 'bot', slug: 'ada' } }),
        );
        placement.run(channel.id, index, id, id);
      }
    });
    const plans: string[] = [];
    const observed = {
      ...database,
      read<Result>(callback: Parameters<typeof database.read<Result>>[0]): Result {
        return database.read((connection) =>
          callback(
            new Proxy(connection, {
              get(target, property) {
                if (property === 'prepare')
                  return (sql: string) => {
                    const statement = target.prepare(sql);
                    if (!sql.includes("SELECT 'question:'")) return statement;
                    return new Proxy(statement, {
                      get(prepared, method) {
                        if (method === 'all')
                          return (...parameters: SQLInputValue[]) => {
                            plans.push(
                              ...target
                                .prepare('EXPLAIN QUERY PLAN ' + sql)
                                .all(...parameters)
                                .map((row) => String(row.detail)),
                            );
                            return prepared.all(...parameters);
                          };
                        const value = Reflect.get(prepared, method);
                        return typeof value === 'function' ? value.bind(prepared) : value;
                      },
                    });
                  };
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }),
          ),
        );
      },
    };
    expect(createHumanAttentionQuery(observed).status()).toEqual({
      unreadCount: UNREAD_COUNT_LIMIT,
      hasAction: false,
    });
    expect(plans.length).toBeGreaterThan(0);
    for (const index of indexes) expect(plans.some((detail) => detail.includes(index))).toBe(true);
    expect(plans.filter((detail) => /^SCAN p\b/.test(detail))).toEqual([]);
  });
});
