import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { messagingDefaults, commitMessagingDefaults } from '../src/messaging/defaults.js';
import { readMessagingIdentity } from '../src/messaging/identity.js';
import { groupReceptionPolicy } from '../src/messaging/permissions/index.js';
import { createTempRoot } from './helpers.js';
it('upgrades legacy choices without reinterpreting identity, group policy, or Human Thread overrides', () => {
  const home = createTempRoot('bh-defaults-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 51),
    ),
  });
  const at = '2026-10-03T00:00:00Z';
  attachOperationalModule(prior, 'messaging').transaction((db) => {
    db.prepare(
      'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, enabled, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('identity', 'ada', 'lark', 'feishu', 'app', 'a'.repeat(64), at, 0, 'QA');
    db.prepare(
      'INSERT INTO messaging_grants (id, binding_id, bot_slug, body, revision, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('grant', 'identity', 'ada', JSON.stringify({ platform: 'feishu' }), 1, at);
    db.prepare(
      'INSERT INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, ?, ?)',
    ).run(
      'grant',
      2,
      JSON.stringify({
        collection: 'all',
        wake: 'silent',
        count: 7,
        intervalSeconds: 42,
        revision: 2,
        editor: { kind: 'human' },
        changedAt: at,
      }),
    );
    db.prepare(
      'INSERT INTO messaging_thread_policy_revisions (grant_id, thread_id, revision, body) VALUES (?, ?, ?, ?)',
    ).run('grant', 'topic', 1, JSON.stringify({ mode: 'exclude', editor: { kind: 'human' } }));
  });
  prior.close();
  const next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(next.mode).toBe('ready');
    const port = attachOperationalModule(next, 'messaging');
    port.transaction((db) => {
      const { revision, changedAt: _at, ...preferences } = messagingDefaults(db);
      commitMessagingDefaults(db, {
        ...preferences,
        expectedRevision: revision,
        collection: 'mentions',
        identityEnabled: true,
      });
    });
    expect(port.read((db) => readMessagingIdentity(db, 'identity'))).toMatchObject({
      enabled: false,
      enabledInheritance: 'custom',
      revision: 1,
    });
    expect(port.read((db) => groupReceptionPolicy(db, 'grant'))).toMatchObject({
      collection: 'all',
      wake: 'silent',
      count: 7,
      inheritance: 'custom',
      revision: 2,
    });
    expect(
      port.read((db) => db.prepare('SELECT body FROM messaging_thread_policy_revisions').get()),
    ).toEqual({ body: '{"mode":"exclude","editor":{"kind":"human"}}' });
  } finally {
    next.close();
  }
});

it('retains Lark revisions and existing Slack custom identities when upgrading the qualified defaults table', () => {
  const home = createTempRoot('bh-slack-defaults-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 53),
    ),
  });
  const priorPort = attachOperationalModule(prior, 'messaging');
  const old = priorPort.transaction((db) => {
    const { revision, changedAt: _at, ...preferences } = messagingDefaults(db);
    const saved = commitMessagingDefaults(db, {
      ...preferences,
      expectedRevision: revision,
      collection: 'all',
      count: 8,
    });
    db.prepare(
      'INSERT INTO messaging_bindings (id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled,display_name,enabled_inherited) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'slack-old',
      'ada',
      'slack',
      'slack',
      'app',
      'a'.repeat(64),
      '2026-10-05T00:00:00Z',
      0,
      'QA',
      0,
    );
    return saved;
  });
  prior.close();
  const next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(next.mode).toBe('ready');
    const port = attachOperationalModule(next, 'messaging');
    expect(port.read((db) => messagingDefaults(db))).toEqual(old);
    port.transaction((db) => {
      const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'slack');
      commitMessagingDefaults(db, {
        ...preferences,
        expectedRevision: revision,
        identityEnabled: true,
        collection: 'all',
        count: 2,
      });
    });
    expect(port.read((db) => messagingDefaults(db))).toEqual(old);
    expect(port.read((db) => readMessagingIdentity(db, 'slack-old'))).toMatchObject({
      enabled: false,
      enabledInheritance: 'custom',
      revision: 1,
    });
    expect(() =>
      port.transaction((db) =>
        db
          .prepare("UPDATE messaging_default_revisions SET body = '{}' WHERE platform = 'slack'")
          .run(),
      ),
    ).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({ message: expect.stringContaining('immutable') }),
      }),
    );
    expect(() =>
      port.transaction((db) =>
        db.prepare("DELETE FROM messaging_default_revisions WHERE platform = 'feishu'").run(),
      ),
    ).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({ message: expect.stringContaining('immutable') }),
      }),
    );
  } finally {
    next.close();
  }
});

it('qualifies Discord on upgrade while preserving every earlier revision and custom identity', () => {
  const home = createTempRoot('bh-discord-defaults-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 58),
    ),
  });
  const priorPort = attachOperationalModule(prior, 'messaging');
  const old = priorPort.transaction((db) => {
    for (const platform of ['feishu', 'slack'] as const) {
      for (const count of [8, 9]) {
        const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, platform);
        commitMessagingDefaults(db, { ...preferences, expectedRevision: revision, count });
      }
    }
    db.prepare(
      'INSERT INTO messaging_bindings (id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled,display_name,enabled_inherited) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'discord-old',
      'ada',
      'discord',
      'discord',
      'app',
      'a'.repeat(64),
      '2026-10-06T00:00:00Z',
      0,
      'QA',
      0,
    );
    return db.prepare('SELECT * FROM messaging_default_revisions ORDER BY platform,revision').all();
  });
  prior.close();
  let next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(next.mode).toBe('ready');
    const port = attachOperationalModule(next, 'messaging');
    expect(
      port.read((db) =>
        db.prepare('SELECT * FROM messaging_default_revisions ORDER BY platform,revision').all(),
      ),
    ).toEqual(old);
    expect(port.read((db) => readMessagingIdentity(db, 'discord-old'))).toMatchObject({
      enabled: false,
      enabledInheritance: 'custom',
      revision: 1,
    });
    const saved = port.transaction((db) => {
      const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'discord');
      return commitMessagingDefaults(db, {
        ...preferences,
        expectedRevision: revision,
        collection: 'all',
        count: 2,
      });
    });
    expect(saved).toMatchObject({ platform: 'discord', revision: 1, count: 2 });
    expect(
      port.read((db) =>
        db
          .prepare(
            "SELECT * FROM messaging_default_revisions WHERE platform != 'discord' ORDER BY platform,revision",
          )
          .all(),
      ),
    ).toEqual(old);
    for (const statement of [
      "UPDATE messaging_default_revisions SET body = '{}' WHERE platform = 'discord'",
      "DELETE FROM messaging_default_revisions WHERE platform = 'slack'",
    ]) {
      expect(() => port.transaction((db) => db.prepare(statement).run())).toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({ message: expect.stringContaining('immutable') }),
        }),
      );
    }
    expect(() =>
      port.transaction((db) =>
        db.prepare("INSERT INTO messaging_default_revisions VALUES ('unknown', 1, '{}')").run(),
      ),
    ).toThrow();
    next.close();
    next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(
      attachOperationalModule(next, 'messaging').read((db) => messagingDefaults(db, 'discord')),
    ).toEqual(saved);
  } finally {
    next.close();
  }
});

it('qualifies WeChat without changing existing enabled or typing choices, and keeps revisions immutable after restart', () => {
  const home = createTempRoot('bh-wechat-defaults-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 69),
    ),
  });
  attachOperationalModule(prior, 'messaging').transaction((db) => {
    for (const enabled of [0, 1])
      db.prepare(
        'INSERT INTO messaging_bindings (id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled,display_name,enabled_inherited,typing_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        `wechat-${enabled}`,
        `bot-${enabled}`,
        'weixin',
        'weixin',
        `app-${enabled}`,
        `${enabled}`.repeat(64),
        '2026-10-08T00:00:00Z',
        enabled,
        'QA',
        0,
        enabled,
      );
  });
  prior.close();
  let next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    const port = attachOperationalModule(next, 'messaging');
    const saved = port.transaction((db) => {
      const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'weixin');
      return commitMessagingDefaults(db, {
        ...preferences,
        expectedRevision: revision,
        identityEnabled: false,
        typingEnabled: false,
      });
    });
    for (const enabled of [false, true])
      expect(
        port.read((db) => readMessagingIdentity(db, `wechat-${Number(enabled)}`)),
      ).toMatchObject({
        enabled,
        typingEnabled: enabled,
        enabledInheritance: 'custom',
        typingInheritance: 'custom',
        revision: 1,
      });
    for (const sql of [
      "UPDATE messaging_default_revisions SET body = '{}' WHERE platform = 'weixin'",
      "DELETE FROM messaging_default_revisions WHERE platform = 'weixin'",
    ])
      expect(() => port.transaction((db) => db.prepare(sql).run())).toThrow();
    next.close();
    next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(
      attachOperationalModule(next, 'messaging').read((db) => messagingDefaults(db, 'weixin')),
    ).toEqual(saved);
  } finally {
    next.close();
  }
});
