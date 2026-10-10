import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apply,
  inject,
  mountOperationalDatabase,
  name,
  type BotHarnessCore,
  type PersonaBotRegistry,
} from '../src/index.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, remember } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

interface Stubs {
  tools: { register: ReturnType<typeof vi.fn>; guard: ReturnType<typeof vi.fn> };
  systemPrompt: { section: ReturnType<typeof vi.fn> };
  sessions: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  agents: { create: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
  skills: { register: ReturnType<typeof vi.fn> };
}

const contexts: Context[] = [];

beforeEach(() => {
  vi.stubEnv('DSH_HOME', createTempRoot('botharness-plugin-home-'));
});

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx !== undefined) await ctx.fiber.dispose();
  }
  vi.unstubAllEnvs();
});

function createStubContext(): { ctx: Context; stubs: Stubs } {
  const ctx = new Context();
  contexts.push(ctx);
  const stubs: Stubs = {
    tools: { register: vi.fn(() => () => undefined), guard: vi.fn(() => () => undefined) },
    systemPrompt: { section: vi.fn(() => () => undefined) },
    sessions: { list: vi.fn(() => []), get: vi.fn() },
    agents: { create: vi.fn(), resume: vi.fn() },
    skills: { register: vi.fn(() => () => undefined) },
  };
  ctx.provide('tools', stubs.tools);
  ctx.provide('systemPrompt', stubs.systemPrompt);
  ctx.provide('sessions', stubs.sessions);
  ctx.provide('agents', stubs.agents as never);
  ctx.provide('skills', stubs.skills);
  return { ctx, stubs };
}

describe('plugin entry', () => {
  it('declares its identity', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual([
      'tools',
      'systemPrompt',
      'sessions',
      'agents',
      'agentDefaultModel',
      'llm',
    ]);
  });

  it('registers nothing when disabled', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: false });

    expect(ctx.get('botharness')).toBeUndefined();
    expect(ctx.get('botharnessBridge')).toBeUndefined();
    expect(stubs.tools.register).not.toHaveBeenCalled();
    expect(stubs.systemPrompt.section).not.toHaveBeenCalled();
    expect(stubs.skills.register).not.toHaveBeenCalled();
  });

  it('sends plugin_started and daily_usage from the Host only while telemetry is on', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      const telemetryCalls = () =>
        fetchImpl.mock.calls.filter(([url]) => String(url) === 'https://t.botharness.ai/batch/');
      const home = process.env['DSH_HOME']!;
      for (const [config, env] of [
        [{ enabled: true, telemetry: false }, {}],
        [{ enabled: true }, { DO_NOT_TRACK: '1' }],
        [{ enabled: true }, { DO_NOT_TRACK: '', BOTHARNESS_TELEMETRY: '0' }],
      ] as const) {
        vi.stubEnv('DO_NOT_TRACK', '');
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
        const { ctx } = createStubContext();
        const monitors = process.listenerCount('uncaughtExceptionMonitor');
        apply(ctx, config);
        expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitors);
        await ctx.fiber.dispose();
        expect(telemetryCalls()).toEqual([]);
        expect(existsSync(join(home, 'botharness', 'telemetry.json'))).toBe(false);
      }

      vi.stubEnv('DO_NOT_TRACK', '');
      vi.stubEnv('BOTHARNESS_TELEMETRY', '');
      const { ctx } = createStubContext();
      const monitors = process.listenerCount('uncaughtExceptionMonitor');
      apply(ctx, { enabled: true, telemetry: true });
      expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitors + 1);
      await ctx.fiber.dispose();
      expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(monitors);
      await vi.waitFor(() => {
        expect(telemetryCalls()).toHaveLength(1);
      });
      const body = JSON.parse(String(telemetryCalls()[0]![1]?.body)) as {
        batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[];
      };
      const installId = (
        JSON.parse(readFileSync(join(home, 'botharness', 'telemetry.json'), 'utf8')) as {
          installId: string;
        }
      ).installId;
      expect(body.batch.map((event) => event.event)).toEqual(['plugin_started', 'daily_usage']);
      expect(body.batch[0]!.distinct_id).toBe(installId);
      expect(Object.keys(body.batch[0]!.properties).sort()).toEqual([
        '$process_person_profile',
        'arch',
        'dsh_version',
        'os',
        'plugin_version',
        'source',
      ]);
      expect(Object.keys(body.batch[1]!.properties).sort()).toEqual([
        '$process_person_profile',
        'messages',
        'persona_bots',
        'sessions',
        'source',
        'window_hours',
      ]);
      expect(JSON.stringify(body)).not.toContain(home);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a Human preference saved in Bot settings off across a Host restart', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      vi.stubEnv('DO_NOT_TRACK', '');
      vi.stubEnv('BOTHARNESS_TELEMETRY', '');
      const dir = join(process.env['DSH_HOME']!, 'botharness');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'telemetry.json'), JSON.stringify({ enabled: false }));
      const { ctx } = createStubContext();
      apply(ctx, { enabled: true });
      const bridge = ctx.get('botharnessBridge') as unknown as {
        telemetryStatus(): { enabled: boolean; preference: boolean };
      };
      expect(bridge.telemetryStatus()).toEqual({ enabled: false, preference: false });
      await ctx.fiber.dispose();
      expect(fetchImpl).not.toHaveBeenCalledWith(
        'https://t.botharness.ai/batch/',
        expect.anything(),
      );
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('provides the core without model-visible memory tools', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });

    expect(ctx.get('botharness')).toMatchObject({
      rootDir: expect.stringContaining('botharness'),
      operationalDatabase: expect.objectContaining({ mode: 'ready' }),
      registry: expect.anything(),
      states: expect.anything(),
      memory: expect.anything(),
      channels: expect.anything(),
      roster: expect.anything(),
      runtime: expect.anything(),
    });
    expect(stubs.tools.register).not.toHaveBeenCalled();
  });

  it('leaves the operational-logs skill unregistered until developer mode', async () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stubs.skills.register).not.toHaveBeenCalled();
  });

  it('rebuilds the activity projection from owned Session logs and follows live events', () => {
    const home = createTempRoot('botharness-plugin-activity-');
    vi.stubEnv('DSH_HOME', home);
    const seeded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    createSessionOwnership(attachOperationalModule(seeded, 'session-ownership')).claim({
      sessionId: 'owned-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      cwdReference: '/srv/shared',
      at: '2026-09-21T00:00:00.000Z',
    });
    seeded.close();

    const { ctx, stubs } = createStubContext();
    const log = (type: string) => [{ type, time: 1, data: {} }];
    stubs.sessions.list.mockReturnValue([
      {
        id: 'owned-1',
        header: { cwd: '/srv/shared', createdAt: 0 },
        snapshotEvents: () => log('tool/call'),
      },
      {
        id: 'unowned-1',
        header: { cwd: '/srv/shared', createdAt: 0 },
        snapshotEvents: () => log('tool/call'),
      },
    ]);

    apply(ctx, { enabled: true });
    const core = ctx.get('botharness') as BotHarnessCore | undefined;

    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'working' });

    ctx.emit(
      'session/event',
      { id: 'owned-1' } as never,
      { type: 'turn/end', time: 2, data: {} } as never,
    );
    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'done' });

    ctx.emit(
      'session/event',
      { id: 'unowned-1' } as never,
      { type: 'tool/call', time: 3, data: {} } as never,
    );
    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'done' });

    ctx.emit('agent/disposed', { agent: { session: { id: 'owned-1' } } } as never);
    expect(core?.states.snapshot('ada').sessions).toEqual({});
  });

  it('closes the operational database last with the plugin fiber', async () => {
    const home = createTempRoot('botharness-plugin-lifecycle-');
    vi.stubEnv('DSH_HOME', home);
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as BotHarnessCore | undefined;
    expect(core?.operationalDatabase.mode).toBe('ready');

    await ctx.fiber.dispose();
    expect(core?.operationalDatabase.mode).toBe('closed');

    const nextHost = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    expect(nextHost.mode).toBe('ready');
    nextHost.close();
  });

  it('keeps file-backed surfaces and diagnostics mounted in database recovery mode', async () => {
    const home = createTempRoot('botharness-plugin-recovery-');
    vi.stubEnv('DSH_HOME', home);
    const firstHost = mountOperationalDatabase({ dshHome: home, instanceId: 'first-host' });
    const { ctx, stubs } = createStubContext();

    try {
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      expect(core?.operationalDatabase.mode).toBe('recovery');
      expect(core?.operationalDatabase.recovery?.code).toBe('lease-unavailable');
      expect(core?.operationalDatabase.diagnostics().leaseHolder?.instanceId).toBe('first-host');
      expect(core?.registry).toBeDefined();
      expect(core?.memory).toBeDefined();
      expect(core?.channels).toBeDefined();
      expect(() =>
        core?.ownership.claim({
          sessionId: 'session-1',
          botSlug: 'ada',
          rootRole: 'orchestrator',
          at: '2026-09-21T00:00:00.000Z',
        }),
      ).toThrow(/recovery mode/);
      expect(stubs.tools.register).not.toHaveBeenCalled();
      expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(1);
      expect(ctx.get('botharnessBridge')).toBeDefined();
    } finally {
      await ctx.fiber.dispose();
      firstHost.close();
    }
  });

  it('registers the persona prompt section', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });

    expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(1);
    const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
    const persona = sections.find((section) => section?.name === 'botharness:persona');
    expect(persona?.order).toBe(10400);

    expect(persona?.text({})).toBe('');
    expect(persona?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe(
      '',
    );
  });

  it('registers the client bridge as a typert service on the gateway namespace', () => {
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const bridge = ctx.get('botharnessBridge');
    expect(bridge).toBeDefined();
    expect(bridge?.typertRemote.namespace).toBe('botharness');
    expect(
      remoteMethods(bridge as object).map((marker) => marker.exportName ?? marker.method),
    ).toEqual([
      'messagingDefaults',
      'messagingDefaultsSet',
      'channelBridges',
      'channelBridge',
      'channelIngests',
      'channelIngest',
      'messagingChannelTarget',
      'messagingReceive',
      'messagingGroupPolicy',
      'messagingThreadPolicy',
      'messagingSource',
      'messagingIdentity',
      'approvalRoute',
      'approvalTest',
      'approvalRetry',
      'pairingReview',
      'senderAccess',
      'messagingApps',
      'messagingSnapshot',
      'messagingTargets',
      'messagingAuthorize',
      'messagingRevoke',
      'messagingConversation',
      'messagingSend',
      'onboarding',
      'onboardingModel',
      'modelPlanInherit',
      'channelRetry',
      'modelCatalog',
      'modelPresets',
      'modelPresetCreate',
      'modelPresetUpdate',
      'modelPresetApply',
      'modelPlan',
      'modelPlanCustomize',
      'modelPlanAssignmentsSet',
      'modelPlanSet',
      'list',
      'activitySnapshot',
      'get',
      'create',
      'createFromGit',
      'update',
      'deletionPreview',
      'deletionConfirm',
      'deletionRetry',
      'deletionMemoryFolder',
      'pause',
      'resume',
      'channels',
      'humanIdentity',
      'humanNameSet',
      'channelHumanNameSet',
      'channelDm',
      'channelCreate',
      'channelRename',
      'channelGroupAvatarSet',
      'channelGroupInvite',
      'channelGroupInviteCancel',
      'channelGroupMemberRemove',
      'channelGroupJoinDecide',
      'channelGroupWakeSet',
      'channelGroupWakePolicies',
      'channelGroupDelete',
      'channelHistory',
      'channelHistorySources',
      'channelPurgePreview',
      'channelPurgeConfirm',
      'channelMessages',
      'channelTimeline',
      'channelReadPosition',
      'channelMarkRead',
      'channelMarkAllRead',
      'channelAllBotPreview',
      'channelSend',
      'channelSendStatus',
      'botAttention',
      'botSourcePolicies',
      'botSourcePolicySet',
      'botSourcePolicyReset',
      'activityOverview',
      'channelActivityToday',
      'humanAttention',
      'humanAssignmentContext',
      'humanAttentionStatus',
      'humanAttentionIgnore',
      'humanAttentionDismiss',
      'assignments',
      'assignment',
      'workspaceOptions',
      'messageAttachmentTarget',
      'workspaceFileTarget',
      'grants',
      'grantCreate',
      'grantRevoke',
      'grantWriteSet',
      'assignmentAccessGet',
      'assignmentAccessSet',
      'toolApprovalRules',
      'toolApprovalRuleRevoke',
      'toolApprovalStatus',
      'toolApprovalDecide',
      'userQuestionStatus',
      'userQuestionAnswer',
      'sessions',
      'sessionOwner',
      'memoryFileTarget',
      'memorySnapshot',
      'memoryFile',
      'memoryHistory',
      'memoryDiff',
      'memoryGitGraph',
      'memoryGitCommitDiff',
      'memoryWorkingChanges',
      'memoryWorkingDiff',
      'memoryRecoveryHistory',
      'memoryRestore',
      'memorySave',
      'memoryRepair',
      'profileActivity',
      'overviewMemory',
      'overviewUsage',
      'profileUsage',
      'groupProfileActivity',
      'rosterGet',
      'sectionCreate',
      'sectionRename',
      'sectionRemove',
      'channelAssign',
      'sectionReorder',
      'topReorder',
      'pinsSet',
      'hiddenSet',
      'rosterBatch',
      'developerModeSet',
      'computerAccessSet',
      'browserAccessSet',
      'browserProfileSet',
      'standingLimitsSet',
      'botAvatarSet',
      'botAppearanceSet',
      'partLibraryList',
      'partLibraryAdd',
      'partLibraryExport',
      'partLibraryImport',
      'partLibraryImportImage',
      'botBannerSet',
      'marketplaceList',
      'marketplaceSubmit',
      'marketplaceTopics',
      'marketplaceDetail',
      'marketplaceChallenge',
      'marketplaceReport',
      'releaseInfo',
      'releaseUpdate',
      'releaseInstall',
      'releaseRestart',
      'telemetryStatus',
      'telemetrySet',
      'gitStatus',
      'gitInstall',
      'scheduleList',
      'scheduleCreate',
      'scheduleUpdate',
      'scheduleDelete',
      'scheduleHistory',
      'scheduleRunNow',
      'schedulePreview',
    ]);
  });

  it('opens the roster domain when storageDomain is served', async () => {
    const { ctx } = createStubContext();
    const fake = createFakeRosterDomain();
    ctx.provide('storageDomain', fake.facility as never);

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as { roster: { available: boolean } } | undefined;
    await vi.waitFor(() => {
      expect(core?.roster.available).toBe(true);
    });
    const bridge = ctx.get('botharnessBridge');
    expect(bridge?.rosterGet()).toEqual({
      pins: [],
      hidden: [],
      sectionOrder: [],
      sections: [],
      topOrder: undefined,
    });
  });

  it('keeps loading without storageDomain and reports the roster unavailable', async () => {
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as { roster: { available: boolean } } | undefined;
    expect(core?.roster.available).toBe(false);
    const bridge = ctx.get('botharnessBridge');
    expect(bridge).toBeDefined();
    try {
      bridge?.rosterGet();
      expect.unreachable('rosterGet should throw while storage is unavailable');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'RemoteError',
        code: 'storage-unavailable',
        message: 'roster storage is unavailable',
      });
    }
  });

  it('resolves memory by Session ownership', async () => {
    const home = createTempRoot('botharness-plugin-');
    vi.stubEnv('DSH_HOME', home);
    try {
      const { ctx, stubs } = createStubContext();
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      expect(core).toBeDefined();
      const created = core?.registry.create({ slug: 'local-bot', displayName: 'Local' });
      expect(created?.ok).toBe(true);
      core?.ownership.claim({
        sessionId: 'orchestrator-local',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:00.000Z',
      });

      const store = core?.memory.storeForSession('orchestrator-local');
      expect(store).toBeDefined();
      await remember(store!, {
        path: 'confidences.md',
        body: 'tea over coffee\n',
        summary: 'Preference',
      });

      const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
      const persona = sections.find((section) => section?.name === 'botharness:persona');
      const standing = persona?.text({ agent: { session: { id: 'orchestrator-local' } } });
      expect(standing).toContain('## Core Memory (MEMORY.md)');
      expect(standing).not.toContain('## Soul');
      expect(core?.memory.storeForSession('unowned-session')).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('freezes the persona prompt section for the Session and gives an edit to new Sessions', async () => {
    const home = createTempRoot('botharness-plugin-');
    vi.stubEnv('DSH_HOME', home);
    try {
      const { ctx, stubs } = createStubContext();
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      const created = core?.registry.create({ slug: 'local-bot', displayName: 'Local' });
      expect(created?.ok).toBe(true);
      core?.ownership.claim({
        sessionId: 'orchestrator-local',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:00.000Z',
      });
      core?.ownership.claim({
        sessionId: 'orchestrator-new',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:01.000Z',
      });

      const memoryDir = core?.registry.memoryDirFor('local-bot');
      if (memoryDir === undefined) throw new Error('memory dir missing');
      writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v1\n');

      const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
      const persona = sections.find((section) => section?.name === 'botharness:persona');
      const running = { agent: { session: { id: 'orchestrator-local' } } };
      const frozen = persona?.text(running);
      expect(frozen).toContain('## Soul (SOUL.md)');
      expect(frozen).toContain('# Persona v1');

      writeFileSync(join(memoryDir, 'SOUL.md'), '# Persona v2\n');
      writeFileSync(join(memoryDir, 'MEMORY.md'), '- grew mid-Session\n');

      expect(persona?.text(running)).toBe(frozen);
      const fresh = persona?.text({ agent: { session: { id: 'orchestrator-new' } } });
      expect(fresh).toContain('# Persona v2');
      expect(fresh).toContain('- grew mid-Session');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
