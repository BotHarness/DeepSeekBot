import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBridgeMethods,
  type BridgeMethods,
  type BridgeMethodsDeps,
} from '../src/bridge/methods.js';
import { BRIDGE_NAMESPACE, BRIDGE_SERVICE_KEY, registerBridge } from '../src/bridge/rpc.js';

import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createChannelStore } from '../src/channels/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createBotSourcePolicyStore,
  type BotSourcePolicyStore,
} from '../src/runtime/source-policy.js';
import { createTestOwnership } from './helpers.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    registryDatabase(root).close();
    rmSync(root, { recursive: true, force: true });
  }
});

function setup(
  sourcePolicy?: BotSourcePolicyStore,
  extras: Pick<BridgeMethodsDeps, 'channelManagement' | 'tob'> = {},
  operational = false,
) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-rpc-'));
  roots.push(root);
  const registry = createTestRegistry({ rootDir: root });
  const channels = (operational ? createSqliteChannelStore : createChannelStore)({
    database: attachOperationalModule(registryDatabase(root), 'channels'),
    rootDir: join(root, 'channels'),
    now: () => new Date('2026-09-19T00:00:00.000Z'),
  });
  const methods: BridgeMethods = createBridgeMethods({
    registry,
    states: createBotStateTracker(),
    channels,
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: registryDatabase(root) }),
    createBotId: () => 'ada',
    ...extras,
    ...(sourcePolicy === undefined ? {} : { sourcePolicy }),
  });
  const ctx = new Context();
  const service = registerBridge(ctx, methods);
  return { root, registry, channels, methods, service };
}

function parameterNames(method: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(method);
  const open = source.indexOf('(');
  const close = open === -1 ? -1 : source.indexOf(')', open + 1);
  const parameters = open === -1 || close === -1 ? '' : source.slice(open + 1, close);
  return parameters
    .split(',')
    .map((part) => part.trim().replace(/^\.\.\./, ''))
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((part) => part.length > 0);
}

describe('bridge typert service', () => {
  it('refuses reviewed or keyed Channel writes when the durable owner is unavailable', () => {
    const { service, channels } = setup();
    service.create('Ada');
    const group = service.channelCreate('Legacy', []).channel;
    const before = channels.list();
    expect(() => service.channelCreate('Keyed', [], 'keyed-create-1')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada', 'keyed-invite-1')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada', undefined, 'observed')).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(() => service.channelGet(group.id)).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    expect(channels.list()).toEqual(before);
  });

  it('refuses admitting protected Tob through legacy group creation, invitation or join acceptance', () => {
    const { service, channels } = setup(
      undefined,
      {
        tob: {
          ensure: async () => {
            throw new Error('unused');
          },
          isTob: (slug) => slug === 'ada',
          readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
          writeSetting: async () => {
            throw new Error('unused');
          },
        },
      },
      true,
    );
    const bot = service.create('Ada').bot;
    const group = service.channelCreate('Group', []).channel;
    expect(() => service.channelCreate('Protected', ['ada'])).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(() => service.channelGroupInvite(group.id, 'ada')).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    const request = channels.requestGroupJoin({
      channelId: group.id,
      requesterBotSlug: 'ada',
      requesterBotCreatedAt: bot.createdAt,
    });
    expect(() => service.channelGroupJoinDecide(group.id, request.id, true)).toThrow(
      expect.objectContaining({ code: 'protected-bot' }),
    );
    expect(channels.get(group.id)?.members).toEqual([]);
    expect(
      channels.get(group.id)?.joinRequests?.find((entry) => entry.id === request.id)?.status,
    ).toBe('pending');
    service.channelGroupJoinDecide(group.id, request.id, false);
    expect(
      channels.get(group.id)?.joinRequests?.find((entry) => entry.id === request.id)?.status,
    ).toBe('declined');
  });

  it('forwards optional reviewed fingerprints for Group name, avatar, wake and member edits', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const response = { ok: true as const, value: { channel } };
    const rename = vi.spyOn(methods, 'channelRename').mockReturnValue(response);
    const avatar = vi.spyOn(methods, 'channelGroupAvatarSet').mockReturnValue(response);
    const wake = vi.spyOn(methods, 'channelGroupWakeSet').mockReturnValue(response);
    const remove = vi.spyOn(methods, 'channelGroupMemberRemove').mockReturnValue(response);
    service.channelRename(channel.id, 'New name', 'reviewed');
    expect(rename).toHaveBeenCalledWith({
      channelId: channel.id,
      name: 'New name',
      expectedChannel: 'reviewed',
    });
    service.channelGroupAvatarSet(channel.id, null, 'reviewed');
    expect(avatar).toHaveBeenCalledWith({
      channelId: channel.id,
      avatar: null,
      expectedChannel: 'reviewed',
    });
    service.channelGroupWakeSet(channel.id, 'ada', 'silent', 5, 30, true, 'reviewed');
    expect(wake).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
      inherit: true,
      expectedChannel: 'reviewed',
    });
    service.channelGroupMemberRemove(channel.id, 'ada', 'reviewed');
    expect(remove).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      expectedChannel: 'reviewed',
    });
  });

  it('forwards optional fingerprints for invitation cancellation and join decisions', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const cancel = vi
      .spyOn(methods, 'channelGroupInviteCancel')
      .mockReturnValue({ ok: true, value: { channel } });
    const decide = vi
      .spyOn(methods, 'channelGroupJoinDecide')
      .mockReturnValue({ ok: true, value: { channel } });
    service.channelGroupInviteCancel(channel.id, 'invitation', 'observed');
    expect(cancel).toHaveBeenCalledWith({
      channelId: channel.id,
      invitationId: 'invitation',
      expectedChannel: 'observed',
    });
    service.channelGroupJoinDecide(channel.id, 'request', false, 'observed');
    expect(decide).toHaveBeenCalledWith({
      channelId: channel.id,
      requestId: 'request',
      accept: false,
      expectedChannel: 'observed',
    });
    service.channelGroupJoinDecide(channel.id, 'request', true);
    expect(decide).toHaveBeenLastCalledWith({
      channelId: channel.id,
      requestId: 'request',
      accept: true,
    });
    service.channelGroupInviteCancel(channel.id, 'invitation');
    expect(cancel).toHaveBeenLastCalledWith({ channelId: channel.id, invitationId: 'invitation' });
  });

  it('forwards Channel fingerprints and stable operation keys through the named RPC facade', () => {
    const { service, methods } = setup();
    const channel = service.channelCreate('Team', []).channel;
    const snapshot = {
      channel,
      channelFingerprint: 'observed',
      invitationPolicy: { autoAccept: false },
      wakePolicies: [],
    };
    const get = vi.spyOn(methods, 'channelGet').mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelGet(channel.id)).toEqual(snapshot);
    expect(get).toHaveBeenCalledWith({ channelId: channel.id });
    const create = vi
      .spyOn(methods, 'channelCreate')
      .mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelCreate('Team', [], 'create-team-1')).toEqual(snapshot);
    expect(create).toHaveBeenCalledWith({
      name: 'Team',
      members: [],
      operationKey: 'create-team-1',
    });
    const invite = vi
      .spyOn(methods, 'channelGroupInvite')
      .mockReturnValue({ ok: true, value: snapshot });
    expect(service.channelGroupInvite(channel.id, 'ada', 'invite-team-1', 'observed')).toEqual(
      snapshot,
    );
    expect(invite).toHaveBeenCalledWith({
      channelId: channel.id,
      botSlug: 'ada',
      operationKey: 'invite-team-1',
      expectedChannel: 'observed',
    });
    invite.mockReturnValue({
      ok: false,
      error: { code: 'stale-channel', message: 'Channel changed' },
    });
    expect(() => service.channelGroupInvite(channel.id, 'ada', 'invite-team-1', 'old')).toThrow(
      expect.objectContaining({ code: 'stale-channel' }),
    );
  });

  it('forwards Bot creation identity and Core Memory through the named RPC facade', () => {
    const { service, methods } = setup();
    const bot = service.create('Ada').bot;
    const receipt = {
      operationKey: 'create-ada-1',
      botSlug: bot.slug,
      status: 'created' as const,
      channelId: 'dm-ada',
    };
    const create = vi
      .spyOn(methods, 'create')
      .mockReturnValue({ ok: true, value: { bot, receipt, channelId: 'dm-ada' } });
    const result = service.create(
      'Ada',
      ['research'],
      'Soul',
      'Bio',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Remember this',
      'create-ada-1',
    );
    expect(create).toHaveBeenCalledWith({
      displayName: 'Ada',
      roles: ['research'],
      persona: 'Soul',
      description: 'Bio',
      model: undefined,
      preset: undefined,
      workspaces: undefined,
      avatar: undefined,
      memoryLocation: undefined,
      coreMemory: 'Remember this',
      operationKey: 'create-ada-1',
    });
    expect(result.receipt).toEqual(receipt);
    expect(result.channelId).toBe('dm-ada');
  });

  it('round-trips profile fingerprint and preserves stale profile refusal through the RPC facade', () => {
    const { service } = setup();
    service.create('Ada');
    const fingerprint = service.get('ada').profileFingerprint;
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    service.update('ada', { displayName: 'Updated' }, fingerprint);
    expect(() => service.update('ada', { displayName: 'Stale' }, fingerprint)).toThrow(
      expect.objectContaining({ code: 'stale-profile' }),
    );
    expect(service.get('ada').bot.displayName).toBe('Updated');
    expect(service.get('ada').profileFingerprint).not.toBe(fingerprint);
    expect(service.update('ada', { description: 'Existing UI' }).bot.description).toBe(
      'Existing UI',
    );
  });

  it('exposes and forwards complete Assignment choices through preset creation and updates', async () => {
    const { service, methods } = setup();
    const route = { provider: 'test', model: 'model' };
    const assignmentModels = [
      { ...route, allowedEfforts: ['', 'high'], defaultEffort: '', note: 'Preserve this note' },
    ];
    const preset = {
      id: 'p',
      name: 'Daily',
      revision: 1,
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
      createdAt: '2026-10-18T00:00:00Z',
    };
    const create = vi
      .spyOn(methods, 'modelPresetCreate')
      .mockResolvedValue({ ok: true, value: { preset } });
    const update = vi
      .spyOn(methods, 'modelPresetUpdate')
      .mockResolvedValue({ ok: true, value: { preset } });
    expect(parameterNames(service.modelPresetCreate)).toEqual([
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
    ]);
    expect(parameterNames(service.modelPresetUpdate)).toEqual([
      'id',
      'expectedRevision',
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
    ]);
    await service.modelPresetCreate('Daily', route, route, assignmentModels);
    expect(create).toHaveBeenCalledWith({
      name: 'Daily',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
    await service.modelPresetUpdate('p', 1, 'Daily', route, route, assignmentModels);
    expect(update).toHaveBeenCalledWith({
      id: 'p',
      expectedRevision: 1,
      name: 'Daily',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
  });
  it('exposes Activity query arguments through the gateway service and refuses an unavailable owner', () => {
    const { service } = setup();
    expect(parameterNames(service.humanAttention)).toEqual([
      'category',
      'botSlug',
      'channelId',
      'limit',
      'cursor',
      'sort',
      'snoozed',
      'kind',
      'search',
      'unreadOnly',
      'queryVersion',
    ]);
    expect(() =>
      service.humanAttention(
        'replies',
        undefined,
        undefined,
        30,
        undefined,
        'mentions-first',
        undefined,
        undefined,
        'budget',
        true,
        1,
      ),
    ).toThrow('Activity queries are unavailable');
  });

  it('exposes and forwards model revision and advanced preset arguments through the gateway façade', async () => {
    const { service, methods } = setup();
    expect(parameterNames(service.onboardingModel)).toEqual([
      'slug',
      'expectedRevision',
      'route',
      'globalDefault',
      'expectedDefaultRevision',
    ]);
    expect(parameterNames(service.modelPresetApply)).toEqual([
      'slug',
      'presetId',
      'expectedRevision',
      'expectedPresetRevision',
    ]);
    expect(parameterNames(service.modelPresetCreate)).toEqual([
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
    ]);
    expect(parameterNames(service.modelPresetUpdate)).toEqual([
      'id',
      'expectedRevision',
      'name',
      'orchestrator',
      'assignmentDefault',
      'assignmentModels',
    ]);
    const route = { provider: 'official', model: 'fast', reasoningEffort: 'high' };
    const assignmentModels = [
      { provider: 'official', model: 'fast', allowedEfforts: ['high'], defaultEffort: 'high' },
    ];
    const refusal = { ok: false as const, error: { code: 'stale-setting', message: 'stale test' } };
    const defaultCall = vi.spyOn(methods, 'onboardingModel').mockResolvedValue(refusal);
    const applyCall = vi.spyOn(methods, 'modelPresetApply').mockResolvedValue(refusal);
    const createCall = vi.spyOn(methods, 'modelPresetCreate').mockResolvedValue(refusal);
    const updateCall = vi.spyOn(methods, 'modelPresetUpdate').mockResolvedValue(refusal);
    await expect(service.onboardingModel(undefined, 0, route, true, 7)).rejects.toThrow(
      'stale test',
    );
    expect(defaultCall).toHaveBeenCalledWith({
      slug: undefined,
      expectedRevision: 0,
      route,
      globalDefault: true,
      expectedDefaultRevision: 7,
    });
    await expect(service.modelPresetApply('one', 'preset', 2, 3)).rejects.toThrow('stale test');
    expect(applyCall).toHaveBeenCalledWith({
      slug: 'one',
      presetId: 'preset',
      expectedRevision: 2,
      expectedPresetRevision: 3,
    });
    await expect(service.modelPresetCreate('New', route, route, assignmentModels)).rejects.toThrow(
      'stale test',
    );
    expect(createCall).toHaveBeenCalledWith({
      name: 'New',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
    await expect(
      service.modelPresetUpdate('preset', 3, 'New', route, route, assignmentModels),
    ).rejects.toThrow('stale test');
    expect(updateCall).toHaveBeenCalledWith({
      id: 'preset',
      expectedRevision: 3,
      name: 'New',
      orchestrator: route,
      assignmentDefault: route,
      assignmentModels,
    });
  });

  it('registers under the gateway service key with the botharness namespace', () => {
    const { service } = setup();

    expect(service.name).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.service).toBe(service);
    expect(service.typertRemote.serviceKey).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.namespace).toBe(BRIDGE_NAMESPACE);
  });

  it('marks every bridge endpoint for typert claims', () => {
    const { service } = setup();

    expect(remoteMethods(service).map((marker) => marker.exportName ?? marker.method)).toEqual([
      'privateInputStatus',
      'privateInputSubmit',
      'privateInputCancel',
      'privateAccountStatus',
      'privateInputReplace',
      'privateAccountRevoke',
      'privateAccounts',
      'privateMcpServerRemove',
      'privateMcpServerEnable',
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
      'failureAlertsSet',
      'failureAlertsTest',
      'failureAlertsRetry',
      'pairingReview',
      'senderAccess',
      'cloudConnections',
      'cloudWork',
      'messagingApps',
      'messagingSnapshot',
      'messagingTargets',
      'messagingReachable',
      'messagingPostConversation',
      'messagingPostRequest',
      'messagingPostLimit',
      'messagingAuthorize',
      'messagingRevoke',
      'messagingConversation',
      'messagingSend',
      'tobHome',
      'onboarding',
      'onboardingModel',
      'modelPlanInherit',
      'channelRetry',
      'botNewSession',
      'botCompact',
      'channelBotStop',
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
      'composerIdentity',
      'composerValidate',
      'humanNameSet',
      'channelHumanNameSet',
      'channelDm',
      'channelGet',
      'channelCreate',
      'channelRename',
      'channelGroupAvatarSet',
      'channelGroupInvite',
      'channelGroupInviteCancel',
      'channelGroupMemberRemove',
      'channelGroupJoinDecide',
      'channelGroupSendReview',
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
      'channelReact',
      'channelSearch',
      'channelUnreadCounts',
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
      'humanAttentionSnooze',
      'assignments',
      'channelAssignments',
      'assignment',
      'workspaceOptions',
      'messageAttachmentTarget',
      'channelMediaTarget',
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
      'toolAutoRejectionOverride',
      'userQuestionStatus',
      'userQuestionAnswer',
      'sessions',
      'botToolTrace',
      'botTools',
      'botToolRun',
      'sessionArchiveSet',
      'memoryMove',
      'sessionOwner',
      'botSessionIds',
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
      'memoryRestoreCommit',
      'memoryNameVersion',
      'memoryRemoveVersionName',
      'memoryVersions',
      'memoryRepair',
      'profileActivity',
      'profileSessionUsage',
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
      'channelMuteSet',
      'rosterBatch',
      'developerModeSet',
      'computerAccessSet',
      'browserAccessSet',
      'browserProfileSet',
      'approvalTemplates',
      'approvalTemplateCreate',
      'approvalTemplateUpdate',
      'approvalTemplateDelete',
      'botApprovalTemplateSet',
      'approvalReviewerModel',
      'approvalReviewerModelSet',
      'idleCompaction',
      'idleCompactionSet',
      'idleCompactionCacheLifetimeSet',
      'standingLimitsSet',
      'botAvatarSet',
      'botAppearanceSet',
      'botPrimaryColorSet',
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
      'channelJournalPage',
      'followRoster',
      'followActivity',
      'followChannel',
      'followCompanion',
    ]);
  });

  it('marks the live stream methods whose final parameter is the injected signal', () => {
    const { service } = setup();

    expect(remoteMethods(service).filter((marker) => marker.mode === 'stream')).toEqual([
      { method: 'followRoster', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followActivity', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followChannel', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followCompanion', mode: 'stream', invocation: { kind: 'direct' } },
    ]);
    expect(parameterNames(service.followRoster)).toEqual(['signal']);
    expect(parameterNames(service.followActivity)).toEqual(['signal']);
    expect(parameterNames(service.followChannel)).toEqual([
      'channelId',
      'limit',
      'drafts',
      'signal',
    ]);
    expect(parameterNames(service.channelJournalPage)).toEqual([
      'channelId',
      'through',
      'before',
      'limit',
    ]);
    expect(parameterNames(service.followCompanion)).toEqual(['resume', 'lastEventId', 'signal']);
    expect(parameterNames(service.botToolRun)).toEqual(['slug', 'tool', 'args']);
    expect(parameterNames(service.memoryMove)).toEqual(['slug', 'location']);
  });

  it('reads parameter names from every form the SRC resolver accepts', () => {
    expect(parameterNames(function (alpha: string, beta: number) {})).toEqual(['alpha', 'beta']);
    expect(parameterNames((alpha: string, ...rest: string[]) => alpha)).toEqual(['alpha', 'rest']);
    expect(parameterNames(function (alpha = 1, beta = 2) {})).toEqual(['alpha', 'beta']);
  });

  it('keeps every method signature parseable by the gateway SRC resolver', () => {
    const { service } = setup();

    expect(parameterNames(service.list)).toEqual(['query']);
    expect(parameterNames(service.get)).toEqual(['slug']);
    expect(parameterNames(service.create)).toEqual([
      'displayName',
      'roles',
      'persona',
      'description',
      'model',
      'preset',
      'workspaces',
      'avatar',
      'memoryLocation',
      'coreMemory',
      'operationKey',
    ]);
    expect(parameterNames(service.update)).toEqual(['slug', 'patch', 'expectedProfile']);
    expect(parameterNames(service.pause)).toEqual(['slug']);
    expect(parameterNames(service.resume)).toEqual(['slug']);
    expect(parameterNames(service.createFromGit)).toEqual([
      'displayName',
      'gitUrl',
      'roles',
      'description',
    ]);
    expect(parameterNames(service.marketplaceList)).toEqual(['query']);
    expect(parameterNames(service.marketplaceTopics)).toEqual([]);
    expect(parameterNames(service.marketplaceDetail)).toEqual(['id']);
    expect(parameterNames(service.marketplaceSubmit)).toEqual(['url', 'altcha']);
    expect(parameterNames(service.marketplaceChallenge)).toEqual([]);
    expect(parameterNames(service.marketplaceReport)).toEqual(['id', 'altcha', 'reason']);
    expect(parameterNames(service.releaseInfo)).toEqual(['since']);
    expect(parameterNames(service.releaseUpdate)).toEqual(['force']);
    expect(parameterNames(service.channelReact)).toEqual([
      'channelId',
      'messageId',
      'emoji',
      'active',
    ]);
    expect(parameterNames(service.channelSearch)).toEqual(['channelId', 'text', 'cursor', 'limit']);
    expect(parameterNames(service.releaseInstall)).toEqual(['version']);
    expect(parameterNames(service.releaseRestart)).toEqual([]);
    expect(parameterNames(service.telemetryStatus)).toEqual([]);
    expect(parameterNames(service.telemetrySet)).toEqual(['enabled']);
    expect(parameterNames(service.gitStatus)).toEqual([]);
    expect(parameterNames(service.scheduleList)).toEqual(['slug']);
    expect(parameterNames(service.scheduleCreate)).toEqual(['slug', 'input']);
    expect(parameterNames(service.scheduleUpdate)).toEqual(['slug', 'id', 'change']);
    expect(parameterNames(service.scheduleDelete)).toEqual(['slug', 'id']);
    expect(parameterNames(service.scheduleHistory)).toEqual(['slug', 'id']);
    expect(parameterNames(service.scheduleRunNow)).toEqual(['slug', 'id']);
    expect(parameterNames(service.schedulePreview)).toEqual(['trigger']);
    expect(parameterNames(service.messagingDefaults)).toEqual(['platform']);
    expect(parameterNames(service.channels)).toEqual([]);
    expect(parameterNames(service.channelDm)).toEqual(['slug', 'displayName']);
    expect(parameterNames(service.channelGet)).toEqual(['channelId']);
    expect(parameterNames(service.channelCreate)).toEqual(['name', 'members', 'operationKey']);
    expect(parameterNames(service.channelGroupInvite)).toEqual([
      'channelId',
      'botSlug',
      'operationKey',
      'expectedChannel',
    ]);
    expect(parameterNames(service.channelRename)).toEqual(['channelId', 'name', 'expectedChannel']);
    expect(parameterNames(service.channelMessages)).toEqual(['channelId', 'before', 'limit']);
    expect(parameterNames(service.channelTimeline)).toEqual([
      'channelId',
      'direction',
      'cursor',
      'around',
      'limit',
      'olderLimit',
      'newerLimit',
    ]);
    expect(parameterNames(service.channelSend)).toEqual([
      'channelId',
      'body',
      'replyTo',
      'attachments',
      'messageId',
      'memorySwitchTarget',
      'mentions',
      'channelRefs',
      'grantRequestResolution',
      'assignmentReply',
      'allBotMention',
    ]);
    expect(parameterNames(service.botAttention)).toEqual(['slug', 'limit', 'cursor', 'state']);
    expect(parameterNames(service.humanAssignmentContext)).toEqual([
      'slug',
      'sessionId',
      'sourceEventId',
    ]);
    expect(parameterNames(service.assignments)).toEqual(['slug']);
    expect(parameterNames(service.assignment)).toEqual(['slug', 'sessionId']);
    expect(parameterNames(service.sessions)).toEqual(['slug']);
    expect(parameterNames(service.sessionOwner)).toEqual(['sessionId']);
    expect(parameterNames(service.rosterGet)).toEqual([]);
    expect(parameterNames(service.sectionCreate)).toEqual(['name']);
    expect(parameterNames(service.sectionRename)).toEqual(['sectionId', 'name']);
    expect(parameterNames(service.sectionRemove)).toEqual(['sectionId']);
    expect(parameterNames(service.channelAssign)).toEqual(['channelId', 'sectionId', 'index']);
    expect(parameterNames(service.sectionReorder)).toEqual(['order']);
    expect(parameterNames(service.topReorder)).toEqual(['order']);
    expect(parameterNames(service.pinsSet)).toEqual(['pins']);
    expect(parameterNames(service.hiddenSet)).toEqual(['hidden']);
    expect(parameterNames(service.channelMuteSet)).toEqual(['channelId', 'muted']);
    expect(parameterNames(service.rosterBatch)).toEqual(['action', 'channelIds', 'sectionId']);
  });

  it.each(['human-dm', 'bot-dm', 'group-mention'] as const)(
    'sets and restores %s delivery through the public bridge',
    (sourceClass) => {
      const home = mkdtempSync(join(tmpdir(), 'botharness-delivery-rpc-'));
      roots.push(home);
      const database = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      });
      try {
        const policy = createBotSourcePolicyStore(
          attachOperationalModule(database, 'delivery-rpc'),
        );
        const { service } = setup(policy);
        service.create('Ada');
        expect(parameterNames(service.botSourcePolicySet)).toEqual([
          'slug',
          'wake',
          'sourceClass',
          'digestCount',
          'digestIntervalSeconds',
          'delivery',
        ]);
        expect(
          service.botSourcePolicySet('ada', 'immediate', sourceClass, undefined, undefined, 'turn')
            .policy,
        ).toMatchObject({
          sourceClass,
          delivery: 'turn',
          revision: 2,
          lastActor: { kind: 'human' },
          overrideActive: true,
        });
        expect(policy.list('ada').find((row) => row.sourceClass === sourceClass)?.delivery).toBe(
          'turn',
        );
        expect(service.botSourcePolicyReset('ada', sourceClass).policy).toMatchObject({
          sourceClass,
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'human' },
          overrideActive: false,
        });
      } finally {
        database.close();
      }
    },
  );

  it('dispatches named arguments into the read model', async () => {
    const { service, registry } = setup();

    const created = service.create('Ada', ['研究'], '# Ada\n');
    expect(created.bot).toMatchObject({ slug: 'ada', displayName: 'Ada', roles: ['研究'] });
    expect(registry.get('ada')).toBeDefined();
    expect(service.get('ada').bot.slug).toBe('ada');
    expect(service.list('ada').bots.map((bot) => bot.slug)).toEqual(['ada']);
    expect(service.pause('ada').bot.paused).toBe(true);
    expect(service.resume('ada').bot.paused).toBeUndefined();

    const dm = service.channelDm('ada', 'Ada');
    expect(dm.channel.id).toBe('dm-ada');
    const renamed = service.channelRename('dm-ada', 'Ada Lovelace');
    expect(renamed.channel.name).toBe('Ada Lovelace');
    expect(renamed.bot?.displayName).toBe('Ada Lovelace');
    expect(service.channels().channels.map((channel) => channel.id)).toEqual(['dm-ada']);
    const sent = await service.channelSend('dm-ada', 'hello');
    expect(sent.message.body).toBe('hello');
    expect(service.channels().channels[0]?.latestMessage?.body).toBe('hello');
    expect(service.channelMessages('dm-ada').messages[0]?.body).toBe('hello');
    expect(service.assignments('ada').assignments).toEqual([]);
    expect(service.sessions('ada').sessions).toEqual([]);
    expect(service.sessionOwner('unknown').owner).toBeNull();
  });

  it('throws RemoteError failures so the gateway keeps code and message on the wire', () => {
    const { service } = setup();

    try {
      service.get('missing');
      expect.unreachable('service.get should throw');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'RemoteError',
        isDSHRemoteError: true,
        code: 'not-found',
        message: 'unknown PersonaBot: missing',
        details: {},
      });
    }
  });
});

it('exports the named Overview period and cursor through the existing Typert service', async () => {
  const { service } = setup();
  expect(parameterNames(service.overviewMemory)).toEqual(['after']);
  await expect(service.overviewMemory()).rejects.toThrow('Memory statistics unavailable');
  expect(parameterNames(service.overviewUsage)).toEqual(['period', 'after']);
  expect(() => service.overviewUsage('week')).toThrow('Usage statistics unavailable');
});
