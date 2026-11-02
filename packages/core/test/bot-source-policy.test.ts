import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { BOT_SOURCE_DEFAULTS, createBotSourcePolicyStore } from '../src/runtime/source-policy.js';
import { createTempRoot } from './helpers.js';

describe('per-PersonaBot source policy defaults', () => {
  it('reads inherited Group defaults without creating revisions or transactions', () => {
    const database = mountOperationalDatabase({
      dshHome: createTempRoot('source-policy-read-only-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const module = attachOperationalModule(database, 'source-policy-read-only');
      const store = createBotSourcePolicyStore(module);
      const initial = database.diagnostics().metrics.transactionsCommitted;
      expect(store.readGroupOrdinary('fresh-bot')).toMatchObject({
        wake: 'digest',
        digestCount: 5,
        digestIntervalSeconds: 30,
        overrideActive: false,
      });
      expect(database.diagnostics().metrics.transactionsCommitted).toBe(initial);
      expect(
        module.read((db) => db.prepare('SELECT bot_slug FROM bot_source_policy_revisions').all()),
      ).toEqual([]);
      store.setGroupOrdinary('fresh-bot', 'digest', 7, 45, { kind: 'human' });
      store.setGroupOrdinary('fresh-bot', 'silent', 7, 45, { kind: 'human' });
      const after = database.diagnostics().metrics.transactionsCommitted;
      expect(store.readGroupOrdinary('fresh-bot')).toMatchObject({
        wake: 'silent',
        digestCount: 7,
        digestIntervalSeconds: 45,
        overrideActive: true,
      });
      expect(database.diagnostics().metrics.transactionsCommitted).toBe(after);
    } finally {
      database.close();
    }
  });

  it('upgrades a prior Host without changing historical Admission facts', () => {
    const home = createTempRoot('botharness-source-policy-upgrade-');
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, -3)),
    });
    attachOperationalModule(prior, 'source-policy-prior').transaction((db) => {
      db.prepare(`
        INSERT INTO source_events
          (source_event_id, source_kind, bot_slug, body, created_at,
           handled_at, attempt_state, payload_json)
        VALUES ('historical-report', 'assignment-report', 'ada', 'Done',
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z',
                'handled', '{"assignmentReport":{"state":"completed"}}')
      `).run();
      db.prepare(`
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason,
                                      attempt_state, handled_at)
        VALUES ('historical-report', 'ada', 'assignment-report',
                'handled', '2026-01-01T00:00:01.000Z')
      `).run();
    });
    prior.close();

    const upgraded = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      expect(upgraded.mode).toBe('ready');
      const module = attachOperationalModule(upgraded, 'source-policy-upgraded');
      expect(createBotSourcePolicyStore(module).list('ada')).toHaveLength(9);
      expect(
        module.read((db) =>
          db
            .prepare(`
            SELECT reason, attempt_state, handled_at, source_policy_revision,
                   source_policy_wake_mode
              FROM inbox_admissions WHERE source_event_id = 'historical-report'
          `)
            .get(),
        ),
      ).toEqual({
        reason: 'assignment-report',
        attempt_state: 'handled',
        handled_at: '2026-01-01T00:00:01.000Z',
        source_policy_revision: null,
        source_policy_wake_mode: null,
      });
    } finally {
      upgraded.close();
    }
  });

  it('keeps existing audited revisions when adding Group mentions and silent modes', () => {
    const home = createTempRoot('botharness-source-group-upgrade-');
    const migrations = BOT_HARNESS_SCHEMA_PLAN.migrations;
    const groupModes = migrations.findIndex(
      (migration) =>
        migration.description ===
        'Allow ordinary Group source defaults to use mentions and silent wake modes',
    );
    expect(groupModes).toBeGreaterThan(0);
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(migrations.slice(0, groupModes)),
    });
    attachOperationalModule(prior, 'source-prior').transaction((db) => {
      db.prepare(`
        INSERT INTO bot_source_policy_revisions
          (bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
           admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active)
        VALUES ('ada', 'assignment-report', 1, 'built-in', NULL, '2026-01-01T00:00:00.000Z',
                'admit', 'conditional', NULL, NULL, 0)
      `).run();
      db.prepare(`
        INSERT INTO bot_source_policy_revisions
          (bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
           admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active)
        VALUES ('ada', 'assignment-report', 2, 'human', NULL, '2026-01-02T00:00:00.000Z',
                'admit', 'immediate', NULL, NULL, 1)
      `).run();
    });
    prior.close();

    const upgraded = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const module = attachOperationalModule(upgraded, 'source-upgraded');
      const store = createBotSourcePolicyStore(module);
      expect(
        store.list('ada').find((rule) => rule.sourceClass === 'assignment-report'),
      ).toMatchObject({
        wake: 'immediate',
        revision: 2,
        lastActor: { kind: 'human' },
      });
      expect(store.setGroupOrdinary('ada', 'silent', 5, 30, { kind: 'human' })).toMatchObject({
        wake: 'silent',
        revision: 2,
      });
      expect(() =>
        module.transaction((db) =>
          db
            .prepare(`
            UPDATE bot_source_policy_revisions SET wake_mode = 'immediate'
             WHERE bot_slug = 'ada' AND source_class = 'group-ordinary' AND revision = 2
          `)
            .run(),
        ),
      ).toThrow();
    } finally {
      upgraded.close();
    }
  });

  it('seeds every built-in rule per Bot and keeps the Human DM Admission wake path', async () => {
    const home = createTempRoot('botharness-source-policy-');
    const turns: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        turns.push(run.bot.slug);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada');
      expect(dm).toBeDefined();
      if (dm === undefined) throw new Error('Human DM unavailable');
      const policy = core.sourcePolicy.list('ada');
      expect(policy).toHaveLength(Object.keys(BOT_SOURCE_DEFAULTS).length);
      for (const rule of policy) {
        expect(rule).toMatchObject({
          admission: 'admit',
          wake: BOT_SOURCE_DEFAULTS[rule.sourceClass].wake,
          revision: 1,
          lastActor: { kind: 'built-in' },
        });
      }
      expect(policy.find((rule) => rule.sourceClass === 'group-ordinary')).toMatchObject({
        digestCount: 5,
        digestIntervalSeconds: 30,
      });
      expect(core.sourcePolicy.list('bea')).toHaveLength(policy.length);
      expect(createBridgeMethods({ ...core }).botSourcePolicies({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: { policies: policy },
      });
      await core.channels.appendMessage(dm.id, {
        id: 'source-policy-human-dm',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Hello Ada',
      });
      const admitted = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'source-policy-human-dm',
        body: 'Hello Ada',
      });
      expect(admitted.admitted).toBe(true);
      await core.runtime.whenIdle();
      expect(turns).toEqual(['ada']);
      expect(
        core.sourcePolicy.list('ada').find((rule) => rule.sourceClass === 'human-dm'),
      ).toMatchObject({ recentWakeCount: 1 });
      const database = attachOperationalModule(core.operationalDatabase, 'source-policy-test');
      expect(
        database.read((db) =>
          db
            .prepare(`
              SELECT a.reason, a.source_policy_revision, a.source_policy_wake_mode,
                     a.attempt_state
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE e.message_id = 'source-policy-human-dm'
            `)
            .get(),
        ),
      ).toMatchObject({
        reason: 'human-dm',
        source_policy_revision: 1,
        source_policy_wake_mode: 'immediate',
        attempt_state: 'handled',
      });
      expect(
        database.read((db) =>
          db
            .prepare('SELECT COUNT(*) AS count FROM bot_source_policy_revisions WHERE bot_slug = ?')
            .get('ada'),
        ),
      ).toEqual({ count: policy.length });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restarted = createCore({ dshHome: home, agents });
    try {
      expect(restarted.sourcePolicy.list('ada')).toHaveLength(
        Object.keys(BOT_SOURCE_DEFAULTS).length,
      );
    } finally {
      await restarted.runtime.close();
      restarted.operationalDatabase.close();
    }
  });

  it('shares one audited Assignment report rule across Bot and Human edits and reset', async () => {
    const home = createTempRoot('botharness-source-policy-edit-');
    const core = createCore({ dshHome: home });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const baseline = core.sourcePolicy
        .list('ada')
        .find((rule) => rule.sourceClass === 'assignment-report');
      expect(baseline).toMatchObject({ wake: 'conditional', revision: 1, overrideActive: false });
      expect(() =>
        core.sourcePolicy.setAssignmentReport('ada', 'immediate', {
          kind: 'bot',
          botSlug: 'bea',
        }),
      ).toThrow('only its own');
      expect(
        core.sourcePolicy.list('ada').find((rule) => rule.sourceClass === 'assignment-report'),
      ).toMatchObject({ revision: 1 });
      const botEdit = core.sourcePolicy.setAssignmentReport('ada', 'immediate', {
        kind: 'bot',
        botSlug: 'ada',
      });
      expect(botEdit).toMatchObject({
        wake: 'immediate',
        revision: 2,
        overrideActive: true,
        lastActor: { kind: 'bot', botSlug: 'ada' },
      });
      expect(
        core.sourcePolicy.list('bea').find((rule) => rule.sourceClass === 'assignment-report'),
      ).toMatchObject({ wake: 'conditional', revision: 1 });
      const methods = createBridgeMethods({ ...core });
      expect(methods.botSourcePolicySet({ slug: 'ada', wake: 'conditional' })).toMatchObject({
        ok: true,
        value: { policy: { revision: 3, lastActor: { kind: 'human' } } },
      });
      expect(methods.botSourcePolicySet({ slug: 'ada', wake: 'digest' })).toMatchObject({
        ok: false,
      });
      expect(methods.botSourcePolicyReset({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: {
          policy: {
            wake: 'conditional',
            revision: 4,
            overrideActive: false,
            lastActor: { kind: 'human' },
          },
        },
      });
      const rows = attachOperationalModule(
        core.operationalDatabase,
        'source-policy-edit-test',
      ).read((db) =>
        db
          .prepare(`
          SELECT revision, actor_kind, wake_mode, override_active
            FROM bot_source_policy_revisions
           WHERE bot_slug = 'ada' AND source_class = 'assignment-report'
           ORDER BY revision
        `)
          .all(),
      );
      expect(rows).toMatchObject([
        { revision: 1, actor_kind: 'built-in', wake_mode: 'conditional', override_active: 0 },
        { revision: 2, actor_kind: 'bot', wake_mode: 'immediate', override_active: 1 },
        { revision: 3, actor_kind: 'human', wake_mode: 'conditional', override_active: 1 },
        { revision: 4, actor_kind: 'human', wake_mode: 'conditional', override_active: 0 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restarted = createCore({ dshHome: home });
    try {
      expect(
        restarted.sourcePolicy.list('ada').find((rule) => rule.sourceClass === 'assignment-report'),
      ).toMatchObject({ revision: 4, overrideActive: false, lastActor: { kind: 'human' } });
    } finally {
      await restarted.runtime.close();
      restarted.operationalDatabase.close();
    }
  });

  it('audits ordinary Group defaults, rejects invalid or cross-Bot edits, and restores the default', async () => {
    const home = createTempRoot('botharness-group-source-policy-');
    const core = createCore({ dshHome: home });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      expect(() =>
        core.sourcePolicy.setGroupOrdinary('ada', 'immediate', 5, 30, {
          kind: 'bot',
          botSlug: 'bea',
        }),
      ).toThrow('only its own');
      expect(() =>
        core.sourcePolicy.setGroupOrdinary('ada', 'digest', 0, 30, { kind: 'human' }),
      ).toThrow('bounds');
      const botEdit = core.sourcePolicy.setGroupOrdinary('ada', 'digest', 7, 45, {
        kind: 'bot',
        botSlug: 'ada',
      });
      expect(botEdit).toMatchObject({
        wake: 'digest',
        digestCount: 7,
        digestIntervalSeconds: 45,
        revision: 2,
        lastActor: { kind: 'bot', botSlug: 'ada' },
      });
      expect(
        core.sourcePolicy.list('bea').find((rule) => rule.sourceClass === 'group-ordinary'),
      ).toMatchObject({ wake: 'digest', revision: 1 });
      const methods = createBridgeMethods({ ...core });
      expect(
        methods.botSourcePolicySet({
          slug: 'ada',
          sourceClass: 'group-ordinary',
          wake: 'mentions',
          digestCount: 7,
          digestIntervalSeconds: 45,
        }),
      ).toMatchObject({
        ok: true,
        value: { policy: { wake: 'mentions', revision: 3, lastActor: { kind: 'human' } } },
      });
      expect(
        methods.botSourcePolicySet({
          slug: 'ada',
          sourceClass: 'group-ordinary',
          wake: 'conditional',
          digestCount: 7,
          digestIntervalSeconds: 45,
        }),
      ).toMatchObject({ ok: false });
      const protectedClasses = [
        'group-invite',
        'group-join-request',
        'group-join-decision',
        'assignment-lifecycle',
      ];
      for (const sourceClass of protectedClasses) {
        expect(
          methods.botSourcePolicySet({ slug: 'ada', sourceClass, wake: 'immediate' }),
        ).toMatchObject({ ok: false });
        expect(methods.botSourcePolicyReset({ slug: 'ada', sourceClass })).toMatchObject({
          ok: false,
        });
      }
      const unchangedRules = core.sourcePolicy.list('ada');
      for (const sourceClass of protectedClasses)
        expect(unchangedRules.find((rule) => rule.sourceClass === sourceClass)).toMatchObject({
          revision: 1,
        });
      const editableImmediate = ['human-dm', 'bot-dm', 'group-mention'];
      for (const sourceClass of editableImmediate) {
        expect(
          methods.botSourcePolicySet({ slug: 'ada', sourceClass, delivery: 'turn' }),
        ).toMatchObject({
          ok: true,
          value: { policy: { sourceClass, wake: 'immediate', delivery: 'turn' } },
        });
        expect(methods.botSourcePolicyReset({ slug: 'ada', sourceClass })).toMatchObject({
          ok: true,
          value: { policy: { sourceClass, delivery: 'steer' } },
        });
      }
      expect(unchangedRules.find((rule) => rule.sourceClass === 'group-ordinary')).toMatchObject({
        revision: 3,
      });
      expect(
        methods.botSourcePolicyReset({ slug: 'ada', sourceClass: 'group-ordinary' }),
      ).toMatchObject({
        ok: true,
        value: {
          policy: {
            wake: 'digest',
            digestCount: 5,
            digestIntervalSeconds: 30,
            revision: 4,
            overrideActive: false,
            lastActor: { kind: 'human' },
          },
        },
      });
      expect(
        attachOperationalModule(core.operationalDatabase, 'group-source-policy-audit').read((db) =>
          db
            .prepare(`
              SELECT revision, actor_kind, wake_mode, override_active
                FROM bot_source_policy_revisions
               WHERE bot_slug = 'ada' AND source_class = 'group-ordinary'
               ORDER BY revision
            `)
            .all(),
        ),
      ).toMatchObject([
        { revision: 1, actor_kind: 'built-in', wake_mode: 'digest', override_active: 0 },
        { revision: 2, actor_kind: 'bot', wake_mode: 'digest', override_active: 1 },
        { revision: 3, actor_kind: 'human', wake_mode: 'mentions', override_active: 1 },
        { revision: 4, actor_kind: 'human', wake_mode: 'digest', override_active: 0 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restarted = createCore({ dshHome: home });
    try {
      expect(
        restarted.sourcePolicy.list('ada').find((rule) => rule.sourceClass === 'group-ordinary'),
      ).toMatchObject({ revision: 4, wake: 'digest', overrideActive: false });
    } finally {
      await restarted.runtime.close();
      restarted.operationalDatabase.close();
    }
  });
});
