import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods, type BridgeMethods } from '../src/bridge/methods.js';
import { BRIDGE_NAMESPACE, BRIDGE_SERVICE_KEY, registerBridge } from '../src/bridge/rpc.js';

import { createChannelStore } from '../src/channels/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createBotSourcePolicyStore,
  type BotSourcePolicyStore,
} from '../src/runtime/source-policy.js';
import { createTestOwnership } from './helpers.js';
import { createReleaseService, type ReleaseService } from '../src/release/service.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    registryDatabase(root).close();
    rmSync(root, { recursive: true, force: true });
  }
});

function setup(sourcePolicy?: BotSourcePolicyStore, release?: ReleaseService) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-rpc-'));
  roots.push(root);
  const registry = createTestRegistry({ rootDir: root });
  const channels = createChannelStore({
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
    ...(sourcePolicy === undefined ? {} : { sourcePolicy }),
    ...(release === undefined ? {} : { release }),
  });
  const ctx = new Context();
  const service = registerBridge(ctx, methods);
  return { root, registry, methods, service };
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
  it('exposes only explicit stable/Beta choice through the owning release service', async () => {
    const root = mkdtempSync(join(tmpdir(), 'release-rpc-'));
    try {
      const release = createReleaseService({
        dataDir: root,
        version: () => '1.1.0',
        ledgers: () => undefined,
      });
      const { methods } = setup(undefined, release);
      expect(methods.releaseChannel()).toEqual({
        ok: true,
        value: { channel: 'stable', writable: true },
      });
      expect(await methods.releasePrompt({ version: '1.2.0' })).toEqual({
        ok: true,
        value: { status: 'suppressed', reason: 'not-beta' },
      });
      expect((await methods.releasePrompt({})).ok).toBe(false);
      expect(methods.releaseChannelSet({ channel: 'beta' })).toEqual({
        ok: true,
        value: { status: 'saved', channel: 'beta' },
      });
      expect(methods.releaseChannelSet({ channel: 'nightly' }).ok).toBe(false);
      expect(methods.releaseChannelSet({}).ok).toBe(false);
      expect(methods.releaseChannel()).toEqual({
        ok: true,
        value: { channel: 'beta', writable: true },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
      'onboarding',
      'onboardingModel',
      'modelPlanInherit',
      'channelRetry',
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
      'releasePrompt',
      'releaseChannel',
      'releaseChannelSet',
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
    ]);
    expect(parameterNames(service.update)).toEqual(['slug', 'patch']);
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
    expect(parameterNames(service.releaseUpdate)).toEqual([]);
    expect(parameterNames(service.releasePrompt)).toEqual(['version']);
    expect(parameterNames(service.releaseChannel)).toEqual([]);
    expect(parameterNames(service.releaseChannelSet)).toEqual(['channel']);
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
    expect(parameterNames(service.channelCreate)).toEqual(['name', 'members']);
    expect(parameterNames(service.channelRename)).toEqual(['channelId', 'name']);
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
