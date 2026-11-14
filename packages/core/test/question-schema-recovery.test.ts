import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import { commitMessagingDefaults, messagingDefaults } from '../src/messaging/defaults.js';
import { groupReceptionPolicy } from '../src/messaging/group-policy.js';
import { readMessagingIdentity } from '../src/messaging/identity.js';
import type { QuestionDelivery } from '../src/messaging/question-messaging.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const qqHotfix = {
  generation: 116,
  module: 'messaging',
  description: 'Historical #3419 QQ defaults hotfix that occupied generation 116',
  migrate(database: import('node:sqlite').DatabaseSync) {
    database.exec(`
      CREATE TABLE messaging_default_revisions_qualified (
        platform TEXT NOT NULL CHECK (platform IN ('feishu', 'slack', 'discord', 'weixin', 'qq')),
        revision INTEGER NOT NULL CHECK (revision > 0), body TEXT NOT NULL,
        PRIMARY KEY (platform, revision)
      );
      INSERT INTO messaging_default_revisions_qualified SELECT * FROM messaging_default_revisions;
      DROP TABLE messaging_default_revisions;
      ALTER TABLE messaging_default_revisions_qualified RENAME TO messaging_default_revisions;
      CREATE TRIGGER messaging_defaults_no_update BEFORE UPDATE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      CREATE TRIGGER messaging_defaults_no_delete BEFORE DELETE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
    `);
  },
};

function hotfixProfile(generation: 116 | 136) {
  const dshHome = createTempRoot('bh-question-schema-');
  const plan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations
      .filter((step) => step.generation <= generation)
      .map((step) => (step.generation === 116 ? qqHotfix : step)),
  );
  const owner = trackTestOwner(mountOperationalDatabase({ dshHome, schemaPlan: plan }));
  expect(owner.mode).toBe('ready');
  attachOperationalModule(owner, 'messaging').transaction((db) => {
    db.prepare('INSERT INTO messaging_default_revisions VALUES (?, ?, ?)').run(
      'qq',
      1,
      '{"collection":"all","newConversations":"auto"}',
    );
  });
  owner.close();
  return dshHome;
}

it.each([116, 136] as const)(
  'activates question messaging after QQ-hotfix generation %s without losing defaults',
  async (generation) => {
    const dshHome = hotfixProfile(generation);
    const core = createCore({ dshHome });
    try {
      expect(core.operationalDatabase.mode).toBe('ready');
      expect(core.externalMessaging.questions.snapshot('ada')).toEqual([]);
      expect(
        attachOperationalModule(core.operationalDatabase, 'messaging').read((db) =>
          db.prepare('SELECT * FROM messaging_default_revisions WHERE platform = ?').all('qq'),
        ),
      ).toEqual([
        { platform: 'qq', revision: 1, body: '{"collection":"all","newConversations":"auto"}' },
      ]);
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);

it.each([
  'CREATE TABLE messaging_question_deliveries (id TEXT, bot_slug TEXT, body TEXT)',
  'CREATE VIEW messaging_question_deliveries AS SELECT 1 AS id',
  `CREATE TABLE unrelated (bot_slug TEXT);
   CREATE INDEX messaging_question_deliveries_bot ON unrelated(bot_slug)`,
])('refuses an incompatible question schema without changing the source database: %s', (schema) => {
  const dshHome = hotfixProfile(136);
  const path = join(dshHome, 'botharness', 'botharness.db');
  const source = new DatabaseSync(path);
  source.exec(schema);
  source.close();
  const before = readFileSync(path);
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  expect(owner.mode).toBe('recovery');
  expect(owner.diagnostics().recovery).toMatchObject({
    code: 'migration-failed',
    message: expect.stringContaining('question'),
  });
  owner.close();
  expect(readFileSync(path)).toEqual(before);
});

it.each([115, 136])(
  'keeps official generation %s upgrades and subsequent restarts usable',
  async (generation) => {
    const dshHome = createTempRoot('bh-question-official-');
    const previous = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((step) => step.generation <= generation),
        ),
      }),
    );
    expect(previous.mode).toBe('ready');
    previous.close();
    for (let attempt = 0; attempt < 2; attempt++) {
      const core = createCore({ dshHome });
      try {
        expect(core.operationalDatabase.mode).toBe('ready');
        expect(core.operationalDatabase.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
        expect(core.externalMessaging.questions.snapshot('ada')).toEqual([]);
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    }
  },
);

it('restores a missing lookup index without losing completed notification receipts', async () => {
  const dshHome = createTempRoot('bh-question-index-');
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((step) => step.generation <= 136),
      ),
    }),
  );
  const delivery: QuestionDelivery = {
    id: 'kept-question',
    botSlug: 'ada',
    channelId: 'dm:ada',
    sessionId: 'kept-session',
    reference: 'kept-reference',
    questionHash: 'a'.repeat(64),
    route: {
      botSlug: 'ada',
      pairingId: 'pair',
      pairingRevision: 1,
      bindingId: 'binding',
      revision: 1,
    },
    createdAt: '2026-11-01T00:00:00Z',
    status: 'answered',
    delivery: 'sent',
    attempts: 1,
    receipt: { version: 1, messageId: 'receipt', conversationId: 'conversation' },
    submission: 'accepted',
    update: 'updated',
  };
  attachOperationalModule(owner, 'messaging').transaction((db) => {
    db.prepare('INSERT INTO messaging_question_deliveries VALUES (?, ?, ?)').run(
      delivery.id,
      'ada',
      JSON.stringify(delivery),
    );
    db.exec('DROP INDEX messaging_question_deliveries_bot');
  });
  owner.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    const core = createCore({ dshHome });
    try {
      expect(core.externalMessaging.questions.snapshot('ada')).toEqual([delivery]);
      const port = attachOperationalModule(core.operationalDatabase, 'messaging');
      expect(
        port.read((db) =>
          db
            .prepare(
              "SELECT name FROM sqlite_schema WHERE name = 'messaging_question_deliveries_bot'",
            )
            .get(),
        ),
      ).toEqual({ name: 'messaging_question_deliveries_bot' });
      expect(() =>
        port.transaction((db) =>
          db
            .prepare('INSERT INTO messaging_question_deliveries VALUES (?, ?, ?)')
            .run('invalid', 'ada', 'invalid json'),
        ),
      ).toThrow();
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }
});

it('retains Bot identity, Channel history, Memory and custom QQ policy revisions', async () => {
  const dshHome = hotfixProfile(136);
  const open = (generation: number) =>
    trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((step) => step.generation <= generation),
        ),
      }),
    );
  const previous = open(136);
  const rootDir = join(dshHome, 'botharness', 'bots');
  mkdirSync(join(rootDir, 'ada', 'memory'), { recursive: true });
  writeFileSync(
    join(rootDir, 'ada', 'bot.json'),
    JSON.stringify({
      slug: 'ada',
      displayName: 'Existing Ada',
      workspaces: [],
      createdAt: '2026-11-01T00:00:00Z',
    }),
  );
  const registry = createPersonaBotRegistry({ rootDir, database: previous });
  const identity = registry.get('ada');
  const memoryPath = join(registry.defaultMemoryDirFor('ada'), 'retained.md');
  writeFileSync(memoryPath, 'Existing Memory stays byte-for-byte.\n');
  const port = attachOperationalModule(previous, 'messaging');
  const channels = createSqliteChannelStore({
    rootDir: join(dshHome, 'botharness', 'channels'),
    database: port,
  });
  const channel = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Existing Ada');
  if (!channel) throw new Error('Fixture DM was not created');
  const message = {
    id: 'retained-message',
    at: '2026-11-01T00:00:00Z',
    author: { kind: 'bot' as const, slug: 'ada' },
    body: 'Existing history stays.',
  };
  expect(await channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, message)).toMatchObject(
    message,
  );
  const policy = '{"collection":"mentions","wake":"mentions"}';
  port.transaction((db) => {
    db.prepare(`INSERT INTO messaging_bindings
      (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at)
      VALUES ('binding', 'ada', 'dsh-im/qq', 'qq', 'fixture', ?, '2026-11-01T00:00:00Z')`).run(
      'a'.repeat(64),
    );
    db.exec(`INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body)
      VALUES ('grant', 'binding', 'ada', 1, '2026-11-01T00:00:00Z', '{}')`);
    db.prepare('INSERT INTO messaging_group_policy_revisions VALUES (?, ?, ?)').run(
      'grant',
      7,
      policy,
    );
  });
  previous.close();
  const upgraded = open(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
  expect(upgraded.mode).toBe('ready');
  expect(createPersonaBotRegistry({ rootDir, database: upgraded }).get('ada')).toEqual(identity);
  const after = attachOperationalModule(upgraded, 'messaging');
  expect(
    createSqliteChannelStore({
      rootDir: join(dshHome, 'botharness', 'channels'),
      database: after,
    }).readMessages(channel.id),
  ).toEqual([expect.objectContaining(message)]);
  expect(readFileSync(memoryPath, 'utf8')).toBe('Existing Memory stays byte-for-byte.\n');
  expect(
    after.read((db) => db.prepare('SELECT * FROM messaging_group_policy_revisions').all()),
  ).toEqual([{ grant_id: 'grant', revision: 7, body: policy }]);
  expect(() =>
    after.transaction((db) => db.exec("UPDATE messaging_group_policy_revisions SET body = '{}'")),
  ).toThrow();
  upgraded.close();
});

it.each([
  { name: 'official115', generation: 115, hotfix: false },
  { name: 'official136', generation: 136, hotfix: false },
  { name: 'healthy137', generation: 137, hotfix: false },
  { name: 'hotfix116', generation: 116, hotfix: true },
  { name: 'failed136', generation: 136, hotfix: true },
])(
  'qualifies QQ defaults from $name without changing history or scoped overrides',
  ({ generation, hotfix }) => {
    const dshHome = hotfix
      ? hotfixProfile(generation === 116 ? 116 : 136)
      : createTempRoot('bh-qq-forward-');
    const prior = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((step) => step.generation <= generation),
        ),
      }),
    );
    expect(prior.mode).toBe('ready');
    const old = attachOperationalModule(prior, 'messaging').transaction((db) => {
      for (const count of [8, 9]) {
        const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'discord');
        commitMessagingDefaults(db, { ...preferences, expectedRevision: revision, count });
      }
      db.prepare(
        'INSERT INTO messaging_bindings (id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled,display_name,enabled_inherited) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        'qq-custom',
        'ada',
        'qq',
        'qq',
        'app',
        'a'.repeat(64),
        '2026-11-01T00:00:00Z',
        0,
        'QA',
        0,
      );
      db.prepare(
        'INSERT INTO messaging_grants (id,binding_id,bot_slug,body,revision,created_at) VALUES (?,?,?,?,?,?)',
      ).run(
        'qq-grant',
        'qq-custom',
        'ada',
        JSON.stringify({ platform: 'qq', receptionInheritance: 'custom' }),
        1,
        '2026-11-01T00:00:00Z',
      );
      db.prepare(
        'INSERT INTO messaging_group_policy_revisions (grant_id,revision,body) VALUES (?,?,?)',
      ).run(
        'qq-grant',
        1,
        JSON.stringify({
          collection: 'mentions',
          wake: 'silent',
          count: 3,
          intervalSeconds: 60,
          inheritance: 'custom',
          revision: 1,
          changedAt: '2026-11-01T00:00:00Z',
          editor: { kind: 'human' },
        }),
      );
      if (hotfix)
        db.prepare('INSERT INTO messaging_default_revisions VALUES (?,?,?)').run(
          'qq',
          2,
          JSON.stringify({
            platform: 'qq',
            revision: 2,
            changedAt: '2026-11-01T00:00:00Z',
            collection: 'all',
            wake: 'digest',
            count: 10,
            intervalSeconds: 600,
            identityEnabled: true,
            newConversations: 'auto',
          }),
        );
      return db
        .prepare('SELECT * FROM messaging_default_revisions ORDER BY platform,revision')
        .all();
    });
    prior.close();
    let owner = trackTestOwner(
      mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    try {
      expect(owner.mode).toBe('ready');
      expect(owner.diagnostics().generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      let port = attachOperationalModule(owner, 'messaging');
      expect(
        port.read((db) =>
          db.prepare('SELECT * FROM messaging_default_revisions ORDER BY platform,revision').all(),
        ),
      ).toEqual(old);
      const saved = port.transaction((db) =>
        commitMessagingDefaults(db, {
          platform: 'qq',
          expectedRevision: hotfix ? 2 : 0,
          collection: 'all',
          wake: 'digest',
          count: 10,
          intervalSeconds: 600,
          identityEnabled: true,
          newConversations: 'auto',
        }),
      );
      expect(saved.revision).toBe(hotfix ? 3 : 1);
      expect(port.read((db) => groupReceptionPolicy(db, 'qq-grant'))).toMatchObject({
        collection: 'mentions',
        wake: 'silent',
        inheritance: 'custom',
        revision: 1,
      });
      expect(port.read((db) => readMessagingIdentity(db, 'qq-custom'))).toMatchObject({
        enabled: false,
        enabledInheritance: 'custom',
      });
      for (const sql of [
        "UPDATE messaging_default_revisions SET body = '{}' WHERE platform = 'qq'",
        "DELETE FROM messaging_default_revisions WHERE platform = 'discord'",
        "INSERT INTO messaging_default_revisions VALUES ('unknown',1,'{}')",
      ])
        expect(() => port.transaction((db) => db.prepare(sql).run())).toThrow();
      owner.close();
      owner = trackTestOwner(
        mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      port = attachOperationalModule(owner, 'messaging');
      expect(owner.mode).toBe('ready');
      expect(port.read((db) => messagingDefaults(db, 'qq'))).toEqual(saved);
      expect(
        port.read((db) =>
          db
            .prepare(
              "SELECT * FROM messaging_default_revisions WHERE platform!='qq' OR revision<? ORDER BY platform,revision",
            )
            .all(saved.revision),
        ),
      ).toEqual(old);
      expect(port.read((db) => groupReceptionPolicy(db, 'qq-grant'))).toMatchObject({
        collection: 'mentions',
        inheritance: 'custom',
      });
    } finally {
      owner.close();
    }
  },
);
