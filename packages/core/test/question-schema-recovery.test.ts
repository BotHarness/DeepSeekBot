import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import type { QuestionDelivery } from '../src/messaging/question-messaging.js';
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
