import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';

const productDirectory = process.argv[2];
assert.ok(
  productDirectory && process.argv.length === 3,
  'Pass the installed deepseekbot package directory',
);
const product = resolve(productDirectory);
const {
  name,
  version,
  private: unpublished,
} = JSON.parse(readFileSync(join(product, 'package.json'), 'utf8'));
assert.equal(name, 'deepseekbot');
assert.notEqual(unpublished, true, 'Use a published npm package');
assert.match(version, /^\d+\.\d+\.\d+$/u);

const home = mkdtempSync(join(tmpdir(), 'bh-release-upgrade-fixture-'));
try {
  const env = { ...process.env, DSH_HOME: home };
  delete env.DEEPSEEK_API_KEY;
  delete env.DEEPSEEKBOT_HOST;
  delete env.DEEPSEEKBOT_HOST_TOKEN;
  const cli = spawnSync(
    process.execPath,
    [join(product, 'dist/deepseekbot.mjs'), 'list', '--home', home],
    {
      env,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );
  if (cli.error) throw cli.error;
  assert.equal(cli.status, 0, cli.stderr);
  const path = join(home, 'botharness/botharness.db');
  const database = new DatabaseSync(path);
  try {
    seed(database);
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    database.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; VACUUM');
  } finally {
    database.close();
  }
  const output = new URL(
    `../packages/core/test/fixtures/release-upgrade/v${version}.db.gz`,
    import.meta.url,
  );
  writeFileSync(output, gzipSync(readFileSync(path), { level: 9 }));
  process.stdout.write(`Wrote fixture for deepseekbot@${version}\n`);
} finally {
  rmSync(home, { recursive: true, force: true });
}

function seed(database) {
  const bot = 'bot-upgrade-fixture';
  const timestamp = '2026-01-01T00:00:00.000Z';
  const hasTable = database.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
  );
  const migrations = new Set(
    hasTable.get('schema_migrations')
      ? database
          .prepare('SELECT id FROM schema_migrations')
          .all()
          .map(({ id }) => id)
      : [],
  );
  const group = 'group-upgrade-fixture';
  const dm = 'dm-bot-upgrade-fixture';
  const model = { provider: 'deepseek-official', model: 'deepseek-flash' };
  const persona = { slug: bot, displayName: 'Fixture Bot', workspaces: [], createdAt: timestamp };
  if (migrations.has('private-bots')) persona.ownerHumanId = 'local-human';
  const preset = {
    id: 'fixture-preset',
    name: 'Fixture Model Preset',
    revision: 1,
    createdAt: timestamp,
    orchestrator: model,
    assignmentDefault: model,
  };
  if (migrations.has('model-preset-sub-choices')) {
    const kind = migrations.has('model-preset-sub-engine-choices') ? { kind: 'model' } : {};
    preset.sub = {
      choices: [{ ...model, allowedEfforts: [''], defaultEffort: '', ...kind }],
      default: { ...kind, ...model },
    };
  }
  const schedule = {
    id: 'fixture-schedule',
    kind: 'every',
    title: 'Fixture schedule',
    prompt: 'Review synthetic data.',
    everySeconds: 86400,
    scheduledAt: '2026-01-02T00:00:00.000Z',
  };

  database.exec('BEGIN IMMEDIATE');
  database
    .prepare('INSERT INTO persona_bots (slug, body) VALUES (?, ?)')
    .run(bot, JSON.stringify(persona));
  const insertChannel = database.prepare(
    'INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)',
  );
  const insertEvent = database.prepare(`
    INSERT INTO source_events
      (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
    VALUES (?, 'human-message', ?, ?, ?, ?, ?, ?)
  `);
  const place = database.prepare(
    'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, 1, ?, ?)',
  );
  for (const [id, type] of [
    [group, 'group'],
    [dm, 'dm'],
  ]) {
    const channel = {
      id,
      type,
      name: `Fixture ${type}`,
      members: [bot],
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(type === 'dm' ? { botSlug: bot } : {}),
    };
    if (type === 'group' && migrations.has('member-lifecycle'))
      channel.ownerHumanId = 'local-human';
    insertChannel.run(id, JSON.stringify(channel));
    const message = `human-fixture-${type}`;
    const event = `fixture-${type}-event`;
    const payload = {
      id: message,
      at: timestamp,
      format: 'text',
      author: { kind: 'human' },
      attachments: [
        {
          fileId: 'file:00000000-0000-4000-8000-000000000001',
          name: 'fixture.txt',
          mime: 'text/plain',
          size: 28,
        },
      ],
    };
    insertEvent.run(
      event,
      bot,
      id,
      message,
      `Fixture ${type} message.`,
      timestamp,
      JSON.stringify(payload),
    );
    place.run(id, event, message);
  }
  database
    .prepare(`
    INSERT INTO channel_human_members (channel_id, human_id, display_name, visible_from_revision, joined_at)
    VALUES (?, 'local-human', 'Fixture Human', 1, ?)
  `)
    .run(group, timestamp);
  database
    .prepare(`
    INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at, provenance, persona_snapshot)
    VALUES ('fixture-session', ?, 'orchestrator', ?, 'created', 'Fixture Memory text.')
  `)
    .run(bot, timestamp);
  database
    .prepare(`
    INSERT INTO bot_schedules (schedule_id, bot_slug, record_json, enabled, creator, locked, created_at, updated_at)
    VALUES (?, ?, ?, 0, 'human', 0, ?, ?)
  `)
    .run(schedule.id, bot, JSON.stringify(schedule), timestamp, timestamp);
  database
    .prepare('INSERT INTO model_presets (id, body) VALUES (?, ?)')
    .run(preset.id, JSON.stringify(preset));
  database
    .prepare(`
    INSERT INTO tool_approval_rules (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active)
    VALUES ('fixture-rule', ?, 'orchestrator', 'fixture-scope', 'tool', 'fixture-tool', '{}', ?, 1)
  `)
    .run(bot, timestamp);
  database
    .prepare(`
    INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, output_tokens, total_tokens)
    VALUES (?, '2026-01-01', ?, ?, 'orchestrator', 12, 8, 20)
  `)
    .run(bot, model.provider, model.model);
  database.prepare('UPDATE persona_bots_import SET imported_at = ?').run(timestamp);
  database.prepare('UPDATE usage_receipt_state SET fingerprint_key = ?').run('01'.repeat(32));
  if (hasTable.get('channel_change_epoch')) {
    database.prepare('UPDATE channel_change_epoch SET epoch = ?').run('01'.repeat(8));
  }
  if (hasTable.get('channel_changes')) {
    database.prepare('UPDATE channel_changes SET changed_at = ?').run(Date.parse(timestamp));
  }
  database.exec('COMMIT');
}
