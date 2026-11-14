import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { TeamService } from '../src/team/service.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createUsageProjection } from '../src/usage/usage.js';
import { requireBotModel } from '../src/team/models.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import { MEMBER_METHODS } from '../src/team/member-methods.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createBotRuntime, type OrchestratorAssignmentAccess } from '../src/runtime/bot-runtime.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { trackTestOwner } from './helpers.js';

const permitted = { provider: 'provider', model: 'allowed' };
const denied = { provider: 'provider', model: 'denied' };
const option = { ...denied, allowedEfforts: [''], defaultEffort: '' };
const now = new Date('2026-11-14T12:00:00Z');
function fixture() {
  const root = createTempRoot('team-usage-models-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(root, 'channels') });
  const team = new TeamService(database, channels);
  const member = humanContext('member-id');
  database.transaction(
    (db) => {
      db.prepare(
        "INSERT INTO humans (human_id, display_name, status, created_at) VALUES (?, 'Member', 'active', ?)",
      ).run(member.humanId, now.toISOString());
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(member.humanId);
      db.prepare('UPDATE team_settings SET enabled = 1').run();
    },
    ['team'],
  );
  registry.create({ slug: 'ada', displayName: 'Ada', ownerHumanId: member.humanId });
  registry.create({ slug: 'bob', displayName: 'Bob' });
  const ownership = createTestOwnership({ session: { botSlug: 'ada', rootRole: 'orchestrator' } });
  const usage = createUsageProjection({
    database: db,
    ownership,
    now: () => now,
    botOwner: (slug) => registry.get(slug)?.ownerHumanId ?? team.ownerContext().humanId,
  });
  const catalog = {
    list: vi.fn(async () => [
      {
        ...permitted,
        providerName: 'Provider',
        modelName: 'Allowed',
        efforts: [],
        credential: 'missing' as const,
      },
    ]),
    validate: vi.fn(async () => {}),
    defaultRoute: () => permitted,
  };
  const deps = {
    registry,
    channels,
    team,
    usage,
    ownership,
    states: createBotStateTracker(),
    roster: createTestRosterStore({ database: db }),
    modelCatalog: catalog,
  };
  const methods = createBridgeMethods(member, deps);
  const ownerMethods = createBridgeMethods(owner, deps);
  const restrict = () =>
    team.roles.update(owner, 'member', { models: { kind: 'only', routes: ['provider/allowed'] } });
  const fold = (seq: number, total: number) =>
    usage.handleSessionEvent('session', {
      type: 'assistant/message',
      seq,
      time: now.getTime() + seq,
      data: {
        message: { source: permitted },
        usage: {
          inputTokens: total,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: total,
        },
      },
    });
  return {
    root,
    channels,
    database,
    db,
    registry,
    team,
    member,
    methods,
    ownerMethods,
    usage,
    catalog,
    restrict,
    fold,
  };
}

describe('M10 member usage and role models', () => {
  it('attributes an actual member DM root turn and its Assignment creator, refusing default and Session route changes', async () => {
    const f = fixture();
    const ownership = createSessionOwnership(attachOperationalModule(f.db, 'session-ownership'));
    const usage = createUsageProjection({
      ownership,
      database: f.db,
      now: () => now,
      botOwner: (slug) => f.registry.get(slug)?.ownerHumanId ?? owner.humanId,
    });
    const plan = {
      orchestrator: permitted,
      assignmentDefault: denied,
      assignmentModels: [option, { ...permitted, allowedEfforts: [''], defaultEffort: '' }],
    };
    f.registry.setModelPlan('ada', plan, 0);
    f.restrict();
    let access: OrchestratorAssignmentAccess | undefined;
    const assignmentRuns = vi.fn(async () => {});
    const runtime = createBotRuntime({
      database: f.db,
      registry: f.registry,
      channels: f.channels,
      ownership,
      now: () => now,
      grants: createTestWorkspaceGrants(f.db, f.root),
      requireModelRoute: (slug, route) => requireBotModel(f.team, f.registry.get(slug), route),
      agents: {
        runOrchestrator: async (run) => {
          await createModelRouteReadiness(f.registry, f.catalog, (slug, route) =>
            requireBotModel(f.team, f.registry.get(slug), route),
          ).prepare(run.bot.slug, 'orchestrator');
          access = run.assignments;
          usage.handleSessionEvent(run.sessionId, {
            type: 'turn/start',
            seq: 1,
            time: now.getTime(),
            data: { turn: 1 },
          });
          usage.handleSessionEvent(run.sessionId, {
            type: 'assistant/message',
            seq: 2,
            time: now.getTime(),
            data: {
              message: { source: permitted },
              usage: {
                inputTokens: 17,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                totalTokens: 17,
              },
            },
          });
        },
        runAssignment: assignmentRuns,
        requestAssignment: () => ({
          delivery: 'followup',
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => {},
      },
    });
    try {
      const dm = f.channels.getOrCreateDm(f.member, 'ada', 'Ada');
      if (!dm) throw new Error('missing DM');
      const admitted = runtime.admitDmMessage(f.member, {
        channelId: dm.id,
        messageId: 'member-root',
        body: 'Work',
      });
      if (!admitted.admitted) throw new Error(admitted.reason);
      await admitted.settled;
      const members = usage.byMember('today', owner.humanId, (slug) => slug);
      expect(members.members).toMatchObject([
        { humanId: f.member.humanId, totals: { totalTokens: 17 } },
      ]);
      const assignments = access;
      if (!assignments) throw new Error('missing Assignment service');
      expect(() =>
        assignments.create({ title: 'Denied', description: 'Work', grantId: TEST_GRANT_ID }),
      ).toThrow('model-not-allowed');
      expect(assignmentRuns).not.toHaveBeenCalled();
      const result = assignments.create({
        title: 'Allowed',
        description: 'Work',
        grantId: TEST_GRANT_ID,
        model: permitted,
      });
      if (result.outcome !== 'created') throw new Error('not created');
      await runtime.whenIdle();
      expect(
        f.database.read((db) =>
          db
            .prepare('SELECT human_id FROM usage_turn_humans WHERE session_id = ? AND turn = 0')
            .get(result.assignment.sessionId),
        ),
      ).toMatchObject({ human_id: f.member.humanId });
      expect(() =>
        assignments.request({
          sessionId: result.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
          model: denied,
        }),
      ).toThrow('model-not-allowed');
      f.registry.customizeModelPlan('ada', denied, 1);
      const next = runtime.admitDmMessage(f.member, {
        channelId: dm.id,
        messageId: 'now-denied',
        body: 'Continue',
      });
      if (!next.admitted) throw new Error(next.reason);
      await expect(next.settled).rejects.toMatchObject({
        code: 'model-not-allowed',
        details: { route: 'provider/denied' },
      });
      expect(
        f.channels
          .queryMessages(dm.id)
          .messages.some((message) => message.sessionFailure?.code === 'model-not-allowed'),
      ).toBe(true);
      f.registry.customizeModelPlan('ada', permitted, 2);
      f.database.transaction(
        (db) =>
          db
            .prepare(
              "UPDATE persona_bots SET owner_human_id = 'local-human', body = json_set(body, '$.ownerHumanId', 'local-human') WHERE slug = 'ada'",
            )
            .run(),
        ['bot-registry'],
      );
      expect(() =>
        assignments.request({
          sessionId: result.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
          model: denied,
        }),
      ).not.toThrow();
      expect(() =>
        assignments.create({ title: 'Owner allowed', description: 'Work', grantId: TEST_GRANT_ID }),
      ).not.toThrow();
    } finally {
      await runtime.close();
    }
  });

  it('bounds report and model policy reads with 1000 members and records surrounding-query timings', () => {
    const f = fixture();
    const day = f.usage.overview('today').end;
    f.database.transaction(
      (db) => {
        const human = db.prepare(
          "INSERT INTO humans (human_id, display_name, status, created_at) VALUES (?, ?, 'active', ?)",
        );
        const row = db.prepare(
          "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens, human_id, legacy) VALUES ('ada', ?, 'p', 'm', 'orchestrator', 1, 1, ?, 0)",
        );
        for (let i = 0; i < 1000; i++) {
          human.run(`scale-${i}`, `Member ${i}`, now.toISOString());
          row.run(day, `scale-${i}`);
        }
      },
      ['usage'],
    );
    f.database.read((db) => {
      const queries = vi.spyOn(db, 'prepare');
      const start = performance.now();
      f.usage.overview('today');
      const baseMs = performance.now() - start;
      const before = queries.mock.calls.length;
      const scopedStart = performance.now();
      f.usage.overview('today', undefined, ['ada']);
      const scopedMs = performance.now() - scopedStart;
      expect(queries.mock.calls.length - before).toBe(4);
      queries.mockClear();
      const reportStart = performance.now();
      expect(f.usage.byMember('today', owner.humanId, (slug) => slug).members).toHaveLength(1000);
      const reportMs = performance.now() - reportStart;
      expect(queries).toHaveBeenCalledTimes(3);
      queries.mockClear();
      f.team.usageByMember(owner, 'today', f.usage, (slug) => slug);
      expect(queries).toHaveBeenCalledTimes(5);
      queries.mockClear();
      expect(f.ownerMethods.usageByMember({ period: 'today' }).ok).toBe(true);
      expect(queries).toHaveBeenCalledTimes(7);
      queries.mockClear();
      f.team.roles.modelsAllowed(f.member);
      expect(queries).toHaveBeenCalledOnce();
      queries.mockRestore();
      process.stdout.write(
        `M10 query diagnostic: overview=${baseMs.toFixed(2)}ms scoped=${scopedMs.toFixed(2)}ms members=${reportMs.toFixed(2)}ms, 1000 rows, report=3 reads policy=1 read\n`,
      );
    });
  });

  it('defaults existing and new Roles to all; unions Roles; protects Admin; Owner remains unrestricted', async () => {
    const f = fixture();
    expect(f.team.roles.list(owner).every((role) => role.models.kind === 'all')).toBe(true);
    const role = f.team.roles.create(owner, 'Extra', []).role;
    expect(role.models).toEqual({ kind: 'all' });
    f.restrict();
    expect(await f.methods.modelsAllowed({})).toEqual({
      ok: true,
      value: { all: false, routes: ['provider/allowed'] },
    });
    f.team.roles.update(owner, role.roleId, {
      models: { kind: 'only', routes: ['provider/extra', 'provider/extra'] },
    });
    f.team.roles.set(owner, f.member.humanId, ['member', role.roleId]);
    expect(f.team.mode(f.member).viewer.models).toEqual({
      all: false,
      routes: ['provider/allowed', 'provider/extra'],
    });
    f.team.roles.update(owner, role.roleId, { models: { kind: 'all' } });
    expect(f.team.roles.modelsAllowed(f.member)).toEqual({ all: true });
    expect(() =>
      f.team.roles.update(owner, 'admin', { models: { kind: 'only', routes: [] } }),
    ).toThrow('role-builtin');
    expect(f.team.roles.modelsAllowed(owner)).toEqual({ all: true });
    expect(() => f.team.roles.requireModel(owner, denied)).not.toThrow();
    expect(
      await f.methods.roleUpdate({ roleId: role.roleId, models: { kind: 'all' } }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'roles.manage' } },
    });
    expect(
      await f.ownerMethods.roleUpdate({
        roleId: role.roleId,
        models: { kind: 'only', routes: ['invalid'] },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it.each(['today', 'week', 'month', 'quarter'] as const)(
    'reconciles %s across mixed attributed and legacy rows, including deleted Humans',
    (period) => {
      const f = fixture();
      f.usage.handleSessionEvent('session', {
        type: 'turn/start',
        seq: 1,
        time: now.getTime(),
        data: { turn: 1 },
      });
      f.fold(2, 11);
      f.fold(2, 11);
      f.database.transaction(
        (db) => {
          const day = f.usage.overview(period).end;
          db.prepare(
            "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens) VALUES ('legacy-bot', ?, 'provider', 'old', 'orchestrator', 7, 7)",
          ).run(day);
          db.prepare(
            "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens, human_id, legacy) VALUES ('bob', ?, 'provider', 'old', 'assignment', 5, 5, 'deleted-human', 0)",
          ).run(day);
          db.prepare(
            "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens) VALUES ('outside', '2000-01-01', 'provider', 'old', 'orchestrator', 999, 999)",
          ).run();
        },
        ['usage'],
      );
      const members = f.usage.byMember(
        period,
        owner.humanId,
        (slug) => f.registry.get(slug)?.displayName ?? slug,
      );
      expect(members.legacy).toBe(true);
      expect(members.members.find((m) => m.humanId === owner.humanId)?.totals.totalTokens).toBe(7);
      expect(members.members.find((m) => m.humanId === f.member.humanId)?.bots).toMatchObject([
        { slug: 'ada', displayName: 'Ada', totals: { totalTokens: 11 } },
      ]);
      expect(members.members.find((m) => m.humanId === 'deleted-human')).toMatchObject({
        deleted: true,
      });
      for (const key of [
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
        'totalTokens',
      ] as const)
        expect(members.members.reduce((sum, m) => sum + (m.totals[key] ?? 0), 0)).toBe(
          f.usage.overview(period).totals[key],
        );
      expect(f.ownerMethods.usageByMember({ period })).toMatchObject({
        ok: true,
        value: { members: expect.any(Array) },
      });
      expect(f.methods.usageByMember({ period })).toMatchObject({
        ok: false,
        error: { code: 'permission-required', details: { permission: 'usage.view' } },
      });
      expect(f.methods.overviewUsage({ period })).toMatchObject({
        ok: true,
        value: { totals: { totalTokens: 11 }, bots: [{ slug: 'ada' }] },
      });
      f.team.roles.update(owner, 'member', { permissions: ['usage.view'] });
      expect(f.methods.usageByMember({ period })).toMatchObject({ ok: true });
    },
  );

  it('keeps same-millisecond root turns attributed to their own Human across replay', async () => {
    const f = fixture();
    f.database.transaction(
      (db) => {
        db.prepare('INSERT INTO usage_turn_humans VALUES (?, ?, ?, ?)').run(
          'session',
          1,
          f.member.humanId,
          now.getTime(),
        );
        db.prepare('INSERT INTO usage_turn_humans VALUES (?, ?, ?, ?)').run(
          'session',
          2,
          owner.humanId,
          now.getTime(),
        );
      },
      ['usage'],
    );
    const events = [1, 2].map((turn) => ({
      type: 'assistant/message',
      seq: turn,
      time: now.getTime(),
      data: {
        turn,
        message: { source: permitted },
        usage: {
          inputTokens: turn,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: turn,
        },
      },
    }));
    await f.usage.rebuild(['session'], async () => ({ events, inheritedEventCount: 0 }));
    await f.usage.rebuild(['session'], async () => ({ events, inheritedEventCount: 0 }));
    expect(f.usage.activity('ada', '2000-01-01T00:00:00Z')).toMatchObject([{ totalTokens: 3 }]);
    const day = f.usage.overview('today').end;
    expect(f.usage.query('ada', { start: day, end: day })).toMatchObject({
      periodTotal: 3,
      periodRecords: 1,
      rows: [{ totalTokens: 3 }],
    });
    expect(f.usage.byMember('today', owner.humanId, (slug) => slug).members).toMatchObject([
      { humanId: owner.humanId, totals: { totalTokens: 2 } },
      { humanId: f.member.humanId, totals: { totalTokens: 1 } },
    ]);
  });

  it('marks legacy only inside the requested period and keeps partial bucket reconciliation', () => {
    const f = fixture();
    f.database.transaction(
      (db) => {
        db.prepare(
          "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, unknown_total, unknown_input, legacy, human_id) VALUES ('ada', ?, 'p', 'm', 'orchestrator', 1, 1, 0, ?)",
        ).run(f.usage.overview('today').end, f.member.humanId);
        db.prepare(
          "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose) VALUES ('ada', '2000-01-01', 'p', 'm', 'orchestrator')",
        ).run();
      },
      ['usage'],
    );
    const result = f.usage.byMember('today', owner.humanId, (slug) => slug);
    expect(result.legacy).toBe(false);
    expect(result.members[0]?.totals).toEqual(f.usage.overview('today').totals);
  });

  it.each(['Bot model plan', 'Assignment default', 'Tob', 'turn start'] as const)(
    'refuses %s for a member-owned Bot and permits an Owner-owned Bot',
    async (path) => {
      const f = fixture();
      f.restrict();
      const select = async (slug: string) => {
        if (path === 'turn start') {
          const readiness = createModelRouteReadiness(
            f.registry,
            { ...f.catalog, defaultRoute: () => denied },
            (slug, route) => requireBotModel(f.team, f.registry.get(slug), route),
          );
          await readiness.prepare(slug, 'orchestrator');
          return { ok: true };
        }
        if (path === 'Tob')
          return f.ownerMethods.modelPlanCustomize({
            slug,
            expectedRevision: 0,
            orchestrator: denied,
          });
        if (path === 'Assignment default') {
          f.registry.customizeModelPlan(slug, permitted, 0);
          return f.ownerMethods.modelPlanAssignmentsSet({
            slug,
            expectedRevision: 1,
            assignmentDefault: denied,
            assignmentModels: [option],
          });
        }
        return f.ownerMethods.modelPlanSet({
          slug,
          expectedRevision: 0,
          orchestrator: denied,
          assignmentDefault: denied,
          assignmentModels: [option],
        });
      };
      if (path === 'turn start')
        await expect(select('ada')).rejects.toMatchObject({
          code: 'model-not-allowed',
          details: { route: 'provider/denied' },
        });
      else
        expect(await select('ada')).toMatchObject({
          ok: false,
          error: { code: 'model-not-allowed', details: { route: 'provider/denied' } },
        });
      expect(await select('bob')).toMatchObject({ ok: true });
    },
  );

  it('retains a disallowed setting and marks get/list; does not disclose catalog credentials', async () => {
    const f = fixture();
    expect(
      await f.ownerMethods.modelPlanSet({
        slug: 'ada',
        expectedRevision: 0,
        orchestrator: denied,
        assignmentDefault: denied,
        assignmentModels: [option],
      }),
    ).toMatchObject({ ok: true });
    f.restrict();
    expect(f.methods.get({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { bot: { modelAllowed: false } },
    });
    expect(f.methods.list({})).toMatchObject({
      ok: true,
      value: { bots: [{ slug: 'ada', modelAllowed: false }] },
    });
    expect(f.methods.get({ slug: 'bob' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(f.registry.get('ada')?.modelPlan?.orchestrator).toEqual(denied);
    const result = await f.methods.modelCatalog({});
    expect(JSON.stringify(result)).not.toContain('credential');
    expect(
      await f.methods.modelPlanCustomize({
        slug: 'ada',
        expectedRevision: 1,
        orchestrator: permitted,
      }),
    ).toMatchObject({ ok: true });
    expect(f.methods.modelPlanInherit({ slug: 'ada', expectedRevision: 2 })).toMatchObject({
      ok: true,
    });
  });

  it('keeps every provider-key/credential method out of the import-free member surface', () => {
    for (const method of [
      'providerCredentials',
      'providerCredentialSet',
      'providerCredentialRemove',
      'modelCredentialReadiness',
      'voiceProviderCredentials',
      'voiceProviderCreate',
      'voiceProviderUpdate',
      'voiceProviderDelete',
      'settings',
      'settingsSet',
    ]) {
      expect(MEMBER_METHODS.has(method), method).toBe(false);
    }
  });

  it('upgrades main generation 146 to 148 without rewriting or losing buckets', () => {
    const home = createTempRoot('m10-main-upgrade-');
    const previous = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 146),
      ),
    });
    expect(previous.mode).toBe('ready');
    const old = attachOperationalModule(previous, 'm10-main-fixture');
    old.transaction((db) => {
      db.prepare(
        "INSERT INTO usage_daily (bot_slug, day, provider, model, purpose, input_tokens, total_tokens) VALUES ('ada', '2026-11-14', 'p', 'm', 'orchestrator', 13, 13)",
      ).run();
      db.prepare("INSERT INTO usage_receipts VALUES ('fingerprint', 'ada')").run();
      db.prepare("INSERT INTO humans VALUES ('member', 'Member', 'deactivated', 'before')").run();
      db.prepare("INSERT INTO persona_bots VALUES ('ada', ?, 'member')").run(
        JSON.stringify({ slug: 'ada', ownerHumanId: 'member' }),
      );
      db.prepare("INSERT INTO tob_identity VALUES ('member', 'ada')").run();
    });
    previous.close();
    for (let restart = 0; restart < 2; restart++) {
      const upgraded = trackTestOwner(
        mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      expect(upgraded.mode).toBe('ready');
      expect(upgraded.generation).toBe(148);
      attachOperationalModule(upgraded, 'm10-upgraded-fixture').read((db) => {
        expect(db.prepare('SELECT human_id, legacy, total_tokens FROM usage_daily').all()).toEqual([
          { human_id: 'local-human', legacy: 1, total_tokens: 13 },
        ]);
        expect(db.prepare('SELECT * FROM usage_receipts').all()).toEqual([
          { fingerprint: 'fingerprint', bot_slug: 'ada', human_id: 'local-human' },
        ]);
        expect(
          db
            .prepare('SELECT models_json FROM host_roles')
            .all()
            .every((row) => row.models_json === '{"kind":"all"}'),
        ).toBe(true);
        expect(
          db.prepare("SELECT status FROM humans WHERE human_id = 'member'").get(),
        ).toMatchObject({ status: 'deactivated' });
        expect(
          db.prepare("SELECT owner_human_id FROM persona_bots WHERE slug = 'ada'").get(),
        ).toMatchObject({ owner_human_id: 'member' });
        expect(db.prepare('SELECT * FROM tob_identity').all()).toEqual([
          { human_id: 'member', bot_slug: 'ada' },
        ]);
        expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      });
      upgraded.close();
    }
  });
});
