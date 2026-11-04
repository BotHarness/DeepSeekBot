import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-10-09T00:00:00Z';
const event =
  'INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
const admission =
  "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, attempt_state, handled_at) VALUES (?, ?, ?, 'handled', ?)";

it('admits Self-Record kinds at generation 75 and keeps rows and purge triggers', () => {
  const home = createTempRoot('bh1276-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 75),
    ),
  });
  attachOperationalModule(prior, 'test').transaction((db) => {
    db.prepare(event).run('old', 'bot-message', 'mira', 'dm-mira', 'm-1', 'hi', AT, '{}');
    db.prepare(admission).run('old', 'mira', 'human-dm', AT);
    expect(() =>
      db.prepare(event).run('new', 'self-record', 'mira', 'dm-mira', 'm-2', '', AT, '{}'),
    ).toThrow();
  });
  prior.close();

  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  expect(current.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
  const port = attachOperationalModule(current, 'test');
  port.transaction((db) => {
    db.prepare(event).run('new', 'self-record', 'mira', 'dm-mira', 'm-2', '', AT, '{}');
    db.prepare(admission).run('new', 'mira', 'bot-action', AT);
    db.prepare(event).run('commit', 'self-record', 'mira', 'dm-mira', 'm-3', '', AT, '{}');
    db.prepare(admission).run('commit', 'mira', 'memory-commit', AT);
  });
  expect(
    port.read((db) =>
      db.prepare('SELECT source_event_id, reason FROM inbox_admissions ORDER BY 1').all(),
    ),
  ).toEqual([
    { source_event_id: 'commit', reason: 'memory-commit' },
    { source_event_id: 'new', reason: 'bot-action' },
    { source_event_id: 'old', reason: 'human-dm' },
  ]);
  const triggers = port.read((db) =>
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('source_events', 'inbox_admissions') ORDER BY name",
      )
      .all(),
  );
  expect(triggers.map((row) => (row as { name: string }).name)).toEqual([
    'channel_placements_for_human_update',
    'channel_placements_notice_update',
    'inbox_history_after_update',
    'inbox_history_before_update',
    'inbox_history_delete',
    'inbox_history_insert',
    'messaging_purge_admission_insert',
    'messaging_purge_admission_update',
    'messaging_purge_source_delete',
    'messaging_purge_source_insert',
    'messaging_purge_source_update',
  ]);
  current.close();
});
