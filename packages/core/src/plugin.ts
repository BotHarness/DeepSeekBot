import { followCompanion } from './companions/live.js';
import { onboardingNewsAvailable } from './onboarding/search.js';
import { nativeTimedQuestions } from './channels/native-timed-questions.js';
import { credentialStoreDenial } from './credentials/store-guard.js';
import { secretCommandDenial } from './credentials/secret-command.js';
import { createBotOnboarding, type BotOnboarding } from './onboarding/service.js';
import { createPartLibrary, type PartLibrary } from './bots/part-library.js';
import {
  PART_SLOTS,
  isAvatarAppearance,
  wornAvatarPart,
  type PartSlot,
} from './bots/avatar-appearance.js';
import { createOutboundMessaging, type OutboundMessaging } from './messaging/outbound.js';
import { createProfileRecovery, type ProfileRecovery } from './portability/recovery.js';
import { createProfileBackupHttp, PROFILE_BACKUP_PATH } from './portability/http.js';
import {
  createDiagnosticBundleHttp,
  DIAGNOSTIC_BUNDLE_PATH,
  DIAGNOSTIC_BUNDLE_PREVIEW_PATH,
} from './diagnostics/bundle-http.js';
import { mountContentPurge } from './purge/owner.js';
import type { ContentPurge } from './purge/contracts.js';
import { createDshImProvider } from './messaging/dsh-im.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createCompanionFeed, COMPANION_PATH, type CompanionFeed } from './companions/feed.js';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import { setApprovalPolicy, type ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { randomUUID } from 'node:crypto';
import Schema from '@deepseek-ai/schemastery';

import { installOrchestratorFileTools } from './workspaces/orchestrator-file-tools.js';
import { ProtectedExecution } from './credentials/protected-execution.js';
import { nativeExecutionRoot } from './workspaces/grant-native-tools.js';
import { createAttachmentStore, type AttachmentStore } from './attachments/store.js';
import { createMemoryFileHttp, MEMORY_FILE_DOWNLOAD_PATH } from './memory/file-http.js';
import {
  BOT_ZIP_EXPORT_PATH,
  BOT_ZIP_FILES_PATH,
  BOT_ZIP_IMPORT_PATH,
  createBotZipHttp,
} from './bots/bot-zip-http.js';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from './attachments/http.js';
import { createBridgeMethods } from './bridge/methods.js';
import { composerRecoveryIdentity } from './bridge/composer-recovery.js';
import { homedir } from 'node:os';
import type { BotAgentSetupInfo } from './runtime/dsh-bot-agent-adapter.js';
import { registerBridge } from './bridge/rpc.js';
import { mountClientDiagnostics } from './diagnostics/client-diagnostics.js';
import { createMarketplaceClient } from './marketplace/client.js';
import {
  createReleaseService,
  installedRelease,
  type ReleaseInstaller,
} from './release/service.js';
import { createGitService } from './memory/managed-git.js';
import { createProcessRestarter, type ReleaseRestarter } from './release/restart.js';
import {
  createTelemetryService,
  installedDshVersion,
  pluginStartedProperties,
  telemetryDecision,
  type TelemetryCapture,
} from './telemetry/service.js';
import { readDailyUsageCounts, startDailyUsage } from './telemetry/daily-usage.js';
import { deliverPendingExceptions, installExceptionCapture } from './telemetry/exceptions.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { createPersonaBotDeletions, type PersonaBotDeletions } from './bots/deletion.js';
import {
  backfillBotBanners,
  backfillBotDescriptors,
  syncBotDescriptor,
} from './bots/bot-descriptor-sync.js';
import { createModelPresetStore, type ModelPresetStore } from './models/presets.js';
import { createModelCatalog } from './models/catalog.js';
import { createCredentialReadiness } from './models/credential-readiness.js';
import { createProviderCredentialHealth } from './models/credential-health.js';
import { createModelRouteReadiness } from './models/readiness.js';
import { createBotAvatarHttp, botAvatarUrl, BOT_AVATAR_PATH } from './bots/avatar-http.js';
import { BOT_BANNER_PATH, createBotBannerHttp } from './bots/banner-http.js';
import { createChannelLiveHub, CHANNEL_STREAM_PATH, type ChannelLiveHub } from './channels/live.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import { DeveloperModeSkillGate } from './logs/skill.js';
import type { ChannelStore } from './channels/store.js';
import {
  personaBotOutputCommitted,
  emitPersonaBotOutputCommitted,
  type PersonaBotOutputCommitted,
} from './channels/output.js';
import { createSqliteChannelStore } from './channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { ensureMemoryRepository } from './memory/repository.js';
import { cloneMemoryRepository } from './memory/clone.js';
import { migrateLegacySouls } from './memory/soul.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import {
  createBotRuntime,
  DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
  type AssignmentEventTail,
  type BotAgentAdapter,
  type BotRuntime,
  type NativeSessionArchive,
} from './runtime/bot-runtime.js';
import { createBotAttentionQuery, type BotAttentionQuery } from './runtime/attention.js';
import { createInboxHistoryQuery, type InboxHistoryQuery } from './runtime/inbox-history.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from './runtime/source-policy.js';
import { createBotScheduleStore, type BotScheduleStore } from './schedules/bot-schedules.js';
import {
  createHumanAttentionQuery,
  createHumanAttentionDecisions,
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from './runtime/human-attention.js';
import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  orchestratorPermission,
  isSafeMemoryDirectoryListing,
  requiresHumanToolApproval,
} from './workspaces/grant-execution.js';
import { ChannelToolApproval } from './workspaces/tool-approval.js';
import { ChannelUserQuestions } from './channels/user-questions.js';
import { mountPrivateInputs } from './credentials/mount.js';
import type { PrivateInputs } from './credentials/private-inputs.js';
import {
  createAssignmentAccessStore,
  type AssignmentAccessStore,
} from './workspaces/assignment-access.js';
import {
  createToolApprovalRuleStore,
  type ToolApprovalRuleStore,
} from './workspaces/tool-approval-rules.js';
import {
  createWorkspaceGrantStore,
  type DshWorkspaceLookup,
  type WorkspaceGrantStore,
} from './workspaces/grants.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
  type AssignmentSessionQuery,
  type AssignmentReportPage,
} from './runtime/assignment-tail.js';
import type { DshSessionEvent, DshSessionStore } from './sessions/source.js';
import {
  createBotStateTracker,
  personaBotActivitySnapshot,
  type BotStateTracker,
  type PersonaBotActivityEvent,
} from './state/bot-state.js';
import { ActivityToolDetails, createToolDetailIndex } from './state/tool-details.js';
import { createDshActivityProjection } from './state/dsh-activity.js';
import { readPublicToolDetail } from './state/tool-activity.js';
import { createUsageProjection, type UsageProjection } from './usage/usage.js';
import { installBotSubagentModelTools } from './runtime/subagent-model-tools.js';

export const name = 'botharness-core';

const installedPackage = installedRelease(import.meta.url);
const runningRelease = {
  version: installedPackage.version(),
  ledgers: installedPackage.ledgers(),
};

export const inject = ['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel', 'llm'];

export const PERSONA_SECTION_ORDER = 10400;

const COMPACTION_END_EVENT: string = 'compaction/end';

export interface CompactionRefreshSink {
  ownership: { resolve(sessionId: string): { botSlug: string } | undefined };
  memory: {
    refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };
  };
  warn(message: string): void;
}

export function handleCompactionEvent(
  sink: CompactionRefreshSink,
  sessionId: string,
  eventType: string,
): void {
  if (eventType !== COMPACTION_END_EVENT) return;
  const owner = sink.ownership.resolve(sessionId);
  if (owner === undefined) return;
  try {
    sink.memory.refreshPersonaAfterCompaction(owner.botSlug, sessionId);
  } catch (error) {
    sink.warn(`botharness: persona refresh after compaction failed: ${String(error)}`);
  }
}

export interface BotHarnessConfig {
  enabled: boolean;
  privateInputExecution?: boolean;
  privateInputWebUrl?: string;

  agentPreset?: string;
  activityDetailConsumers?: string[];
  marketplaceUrl?: string;
  telemetry?: boolean;
}

export const DEFAULT_AGENT_PRESET = 'standard';
export const DEFAULT_MARKETPLACE_URL = 'https://market.botharness.ai';

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
  agentPreset: DEFAULT_AGENT_PRESET,
  telemetry: true,
};

export const Config: Schema<BotHarnessConfig> = Schema.object({
  privateInputWebUrl: Schema.string().description(
    'Explicit credential-free Web origin for IM private input links; never use a login token URL.',
  ),
  privateInputExecution: Schema.boolean()
    .default(false)
    .description(
      'Removed. The Docker-protected Profile no longer exists; a Profile that sets this starts as an ordinary Profile and logs a warning.',
    ),
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
  activityDetailConsumers: Schema.array(Schema.string())
    .default([])
    .description('Explicitly trusted Host Plugin names allowed to read Activity Tool details'),
  agentPreset: Schema.string()
    .default(DEFAULT_AGENT_PRESET)
    .description('PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）'),
  marketplaceUrl: Schema.string()
    .default(DEFAULT_MARKETPLACE_URL)
    .description('Bot Marketplace 服务地址'),
  telemetry: Schema.boolean()
    .default(true)
    .description(
      '发送匿名使用统计（Anonymous usage telemetry）；DO_NOT_TRACK=1 或 BOTHARNESS_TELEMETRY=0 也会关闭',
    ),
});

export interface BotHarnessCore {
  profileRecovery: ProfileRecovery;
  rootDir: string;
  onboarding: BotOnboarding;
  partLibrary: PartLibrary;
  operationalDatabase: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  deletions: PersonaBotDeletions;
  contentPurge: ContentPurge;
  modelPresets: ModelPresetStore;

  contributeBotAgentSetup(contribute: BotAgentSetup): () => void;

  configureGroupInvitations(autoAccept: () => boolean): () => void;
  configureAssignmentConcurrencyLimit(read: () => number): () => void;

  hostTools: Set<string>;

  runBotAgentSetups(
    agentCtx: Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void;
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;

  usage?: UsageProjection;
  channels: ChannelStore;
  attachments: AttachmentStore;
  live: ChannelLiveHub;
  companions: CompanionFeed;
  roster: RosterStore;
  runtime: BotRuntime;
  attention: BotAttentionQuery;
  inboxHistory: InboxHistoryQuery;
  sourcePolicy: BotSourcePolicyStore;
  schedules: BotScheduleStore;
  humanAttention: HumanAttentionQuery;
  humanAttentionDecisions: HumanAttentionDecisions;
  grants: WorkspaceGrantStore;
  externalMessaging: OutboundMessaging;
  toolRules: ToolApprovalRuleStore;
  assignmentAccess: AssignmentAccessStore;
}

function unavailableAgentAdapter(): BotAgentAdapter {
  const unavailable = () =>
    Promise.reject(new Error('BotHarness Agent runtime is unavailable outside a DSH Host'));
  return {
    runOrchestrator: unavailable,
    runAssignment: unavailable,
    requestAssignment: () => {
      throw new Error('BotHarness Agent runtime is unavailable outside a DSH Host');
    },
    close: async () => undefined,
  };
}

type BotAgentSetup = (
  agentCtx: import('@deepseek-ai/cordis').Context,
  agent: import('@deepseek-ai/dsh-agent').Agent,
  info: BotAgentSetupInfo,
) => void;

export function createCore(
  options: {
    dshHome?: string;
    companionProfileDir?: string | undefined;
    warn?: (message: string) => void;
    agents?: BotAgentAdapter;
    saveReportSpill?: (input: {
      sessionId: string;
      content: string;
    }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;
    readAssignmentTail?: (sessionId: string) => Promise<AssignmentEventTail>;
    readAssignmentReportPage?: (
      sessionId: string,
      acceptedSummary: string,
      offset: number,
    ) => Promise<AssignmentReportPage>;
    workspaces?: () => DshWorkspaceLookup | undefined;
    sessionArchive?: () => NativeSessionArchive | undefined;
    autoAcceptGroupInvitations?: () => boolean;
    triageContinuation?: boolean;
    onOutputCommitted?: (event: PersonaBotOutputCommitted) => void;
    activeQuestionMessageIds?: () => readonly string[];
    activeToolApprovalMessageIds?: () => readonly string[];
    activePrivateInputMessageIds?: () => readonly string[];
    erasePrivateAccounts?: (slug: string) => Promise<unknown>;
    capture?: TelemetryCapture;
  } = {},
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  let usage: UsageProjection | undefined;
  const partLibrary = createPartLibrary({
    database: attachOperationalModule(operationalDatabase, 'avatar-part-library'),
  });
  let registry: PersonaBotRegistry;
  let modelPresets: ModelPresetStore;
  let roster: RosterStore;
  let live: ChannelLiveHub | undefined;
  try {
    registry = createPersonaBotRegistry({
      rootDir,
      database: operationalDatabase,
      onImport: (event) =>
        options.warn?.(
          `bot-registry-import initiator=host-startup phase=${event.phase} count=${event.count ?? 0} durationMs=${Math.round(event.durationMs)}`,
        ),
      onAppearanceImported: (record) => {
        const recipe = isAvatarAppearance(record.appearance) ? record.appearance.recipe : undefined;
        if (recipe?.family !== 'illustrated') return;
        for (const slot of Object.keys(PART_SLOTS) as PartSlot[]) {
          const part = wornAvatarPart(recipe, slot);
          if (part)
            partLibrary.add({ part, name: '', origin: 'imported-bot', author: record.displayName });
        }
      },
      onDisplayNameChanged: () => {
        try {
          live?.publishRosterCommitted();
        } catch {
          options.warn?.('bot-name-publication-failed');
        }
      },
      cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      syncDescriptor: (memoryDir, record, sync) => {
        try {
          syncBotDescriptor(memoryDir, record, sync);
        } catch (error) {
          options.warn?.(
            `bot-descriptor-sync-failed slug=${record.slug} reason=${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      },
      initializeMemory: (memoryDir) => {
        const repository = ensureMemoryRepository({ memoryDir });
        return repository.ok
          ? { ok: true }
          : {
              ok: false,
              ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
              message: `${repository.code}: ${repository.message}`,
            };
      },
    });
    roster = createRosterStore({
      database: operationalDatabase,
      warn: options.warn,
      onCommitted: () => live?.publishRosterCommitted(),
    });
    modelPresets = createModelPresetStore({
      rootDir: join(dshHome, 'botharness'),
      database: operationalDatabase,
      onImport: (event) =>
        options.warn?.(
          `model-presets-import initiator=host-startup phase=${event.phase} count=${event.count ?? 0} durationMs=${Math.round(event.durationMs)}`,
        ),
    });
  } catch (error) {
    operationalDatabase.close();
    throw error;
  }
  if (operationalDatabase.mode === 'ready') {
    backfillBotBanners(registry, options.warn);
    backfillBotDescriptors(registry, options.warn);
    migrateLegacySouls(registry, options.warn);
  }
  const states = createBotStateTracker();
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  const contentPurge = mountContentPurge({
    dshHome,
    database: operationalDatabase,
    attachments,
    derivatives: (ids, botSlugs) => {
      const references = memory.sourceReferences(ids);
      const slugs = [...new Set([...botSlugs, ...references.map((ref) => ref.botSlug)])].sort();
      return [
        ...references.map((ref) => ({
          kind: 'memory' as const,
          botSlug: ref.botSlug,
          location: ref.memoryDir ?? '',
          reference: ref.sha,
          tracking: ref.available ? ('recorded' as const) : ('unavailable' as const),
        })),
        ...slugs.flatMap((slug) =>
          grants.list(slug).map((grant) => ({
            kind: 'workspace' as const,
            botSlug: slug,
            location: grant.workspacePath,
            reference: grant.id,
            tracking: 'possible' as const,
          })),
        ),
      ];
    },
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  let runtime: BotRuntime | undefined;
  let companions: CompanionFeed | undefined;
  let reconcileToolRuleCreators: ((botSlug: string) => void) | undefined;
  const sourcePolicy = createBotSourcePolicyStore(
    attachOperationalModule(operationalDatabase, 'bot-inbox'),
  );
  const externalMessaging = createOutboundMessaging({
    ownsFailure: (slug, sessionId, role) => {
      const owner = ownership.resolve(sessionId);
      return owner?.botSlug === slug && owner.rootRole === role;
    },
    onAuthorizationChanged: (slug) => reconcileToolRuleCreators?.(slug),
    onDefaultsChanged: () => live?.publishRosterCommitted(),
    onReceptionChanged: () => live?.publishRosterCommitted(),
    ...(options.capture === undefined ? {} : { capture: options.capture }),
    attachments,
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    onAdmitted: (slug, sourceEventId) => runtime?.admitExternalSource?.(slug, sourceEventId),
    onPlaced: (commit) => live?.publishCommitted(commit),
    onShared: (slugs) => {
      for (const slug of slugs) runtime?.resumePendingDigests?.(slug);
    },
    onIngested: (channelId, messageId) => runtime?.admitGroupMessage(channelId, messageId),
    recover: operationalDatabase.mode === 'ready',
    isBotActive: (slug) => {
      const bot = registry.get(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const initialGroupInvitationPolicy = options.autoAcceptGroupInvitations ?? (() => true);
  const assignmentLimits: { read: () => number }[] = [];
  const groupInvitationPolicies: { policy: () => boolean }[] = [];
  const channels = createSqliteChannelStore({
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    databaseOwnerReady: operationalDatabase.mode === 'ready',
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    attachments,
    botDisplayName: (botSlug) => registry.getHistorical(botSlug)?.displayName,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => {
      try {
        externalMessaging.failureAlerts.committed(commit);
      } catch {
        options.warn?.('failure-alert-notification-enqueue-failed');
      }
      try {
        const output = personaBotOutputCommitted(commit, ownership);
        if (output !== undefined) companions?.publish(output);
      } catch {
        options.warn?.('companion-output-publication-failed');
      }
      if (options.onOutputCommitted !== undefined) {
        try {
          const event = personaBotOutputCommitted(commit, ownership);
          if (event !== undefined) options.onOutputCommitted(event);
        } catch {
          options.warn?.('personabot-output-publication-failed');
        }
      }
      let publicationFailed = false;
      try {
        live?.publishCommitted(commit);
      } catch {
        publicationFailed = true;
      }
      if (commit.message.memberDeparture !== undefined) {
        try {
          runtime?.admitGroupMessage(commit.channelId, commit.message.id);
        } catch {
          runtime?.retryGroupMessageAdmission?.(commit.channelId, commit.message.id);
          options.warn?.('group-admission-wake-failed-retrying');
        }
      }
      if (publicationFailed) options.warn?.('channel-live-publication-failed');
    },
    onRecordChanged: () => live?.publishRosterCommitted(),
    onAdmissionChanged: (channelId, messageId, message) =>
      live?.publishAdmission(channelId, messageId, message),
    onHumanReadChanged: (channelId, humanId, revision) =>
      live?.publishHumanRead(channelId, humanId, revision),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const attention = createBotAttentionQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const inboxHistory = createInboxHistoryQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const humanAttentionDatabase = attachOperationalModule(operationalDatabase, 'human-attention');
  const humanAttention = createHumanAttentionQuery(
    humanAttentionDatabase,
    options.activeQuestionMessageIds,
    options.activeToolApprovalMessageIds,
    options.activePrivateInputMessageIds,
  );
  const humanAttentionDecisions = createHumanAttentionDecisions(humanAttentionDatabase);
  if (operationalDatabase.mode === 'ready') {
    const refreshDurableAttention = () =>
      states.replaceDurableAttention(
        humanAttention.durableAttention().filter((row) => registry.get(row.botSlug) !== undefined),
      );
    refreshDurableAttention();
    operationalDatabase.subscribe(({ topics }) => {
      if (topics.includes('content-purge')) live?.publishContentPurged();
      if (
        topics.some((topic) =>
          ['bindings', 'grants', 'bot-schedules', 'content-purge'].includes(topic),
        )
      )
        live?.publishRosterCommitted();
      if (
        topics.some((topic) =>
          [
            'assignments',
            'source-event',
            'bot-inbox',
            'channel',
            'human-attention',
            'usage',
          ].includes(topic),
        )
      )
        refreshDurableAttention();
    });
  }
  live = createChannelLiveHub(
    channels,
    {
      snapshot: () =>
        personaBotActivitySnapshot(
          registry.list().map((bot) => bot.slug),
          states,
        ),
      onChange: (changed) => states.onActivity(() => changed()),
    },
    () => contentPurge.redactions(),
  );
  if (operationalDatabase.mode === 'ready')
    for (const bot of registry.list())
      if (bot.paused === true) channels.cancelInvitationsForBot(bot.slug);
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  companions = createCompanionFeed({
    profileId: createHash('sha256')
      .update(options.companionProfileDir ?? dshHome)
      .digest('hex'),
    bot: (slug) => {
      const bot = registry.get(slug);
      return bot === undefined
        ? undefined
        : {
            slug,
            name: bot.displayName,
            paused: bot.paused === true,
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(slug, bot.avatar)
                    : bot.avatar,
                }),
          };
    },
    activity: () =>
      personaBotActivitySnapshot(
        registry.list().map((bot) => bot.slug),
        states,
      ),
    onActivity: (changed) => states.onActivity(() => changed()),
    onIdentity: (changed) =>
      operationalDatabase.subscribe(({ topics }) => {
        if (topics.includes('bot-registry')) changed();
      }),
    observeOutput: (id, messageId) => channels.observeOutput(id, messageId),
    checkpoint: () => channels.outputCheckpoint(),
  });
  const memory = createMemoryService({
    registry,
    ownership,
    database: operationalDatabase,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  usage =
    operationalDatabase.mode === 'ready'
      ? createUsageProjection({
          ownership,
          database: operationalDatabase,
          botCreatedAt: (slug) => registry.getHistorical(slug)?.createdAt,
        })
      : undefined;
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(operationalDatabase, 'workspace-grants'),
    workspaces: options.workspaces ?? (() => undefined),
  });
  const toolRules = createToolApprovalRuleStore(
    attachOperationalModule(operationalDatabase, 'tool-approval-rules'),
    (botSlug, creator) => externalMessaging.toolRuleCreatorAuthorized(botSlug, creator),
  );
  reconcileToolRuleCreators = (slug) => {
    toolRules.reconcileExternal(slug);
    externalMessaging.approvals.refreshRules(slug);
  };
  const assignmentAccess = createAssignmentAccessStore(
    attachOperationalModule(operationalDatabase, 'assignment-access'),
  );
  const profileRecovery = createProfileRecovery(operationalDatabase, registry, ownership);
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  const hostTools = new Set<string>();
  const botAgentSetups = new Set<BotAgentSetup>();
  const contributeBotAgentSetup = (contribute: BotAgentSetup): (() => void) => {
    botAgentSetups.add(contribute);
    return () => {
      botAgentSetups.delete(contribute);
    };
  };
  const runBotAgentSetups = (
    agentCtx: import('@deepseek-ai/cordis').Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void => {
    for (const contribute of [...botAgentSetups]) contribute(agentCtx, agent, info);
  };

  const schedules = createBotScheduleStore({
    database: attachOperationalModule(operationalDatabase, 'bot-schedules'),
    isBotActive: (slug) => {
      const bot = registry.get(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
    onAdmitted: (slug) => runtime?.admitScheduleFiring?.(slug),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  runtime = createBotRuntime({
    triageContinuation: options.triageContinuation === true,
    inboxHistory,
    requireExecution: (slug) => profileRecovery.requireExecution(slug),
    schedules,
    assignmentConcurrencyLimit: () =>
      assignmentLimits.at(-1)?.read() ?? DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT,
    ...(options.sessionArchive === undefined ? {} : { sessionArchive: options.sessionArchive }),
    beginAssignmentWait: (slug, sessionId) => states.beginAssignmentWait(slug, sessionId),
    database: operationalDatabase,
    externalMessaging,
    sourcePolicy,
    registry,
    channels,
    attachments,
    agents: options.agents ?? unavailableAgentAdapter(),
    ...(options.saveReportSpill === undefined ? {} : { saveReportSpill: options.saveReportSpill }),
    ...(options.readAssignmentTail === undefined
      ? {}
      : { readAssignmentTail: options.readAssignmentTail }),
    ...(options.readAssignmentReportPage === undefined
      ? {}
      : { readAssignmentReportPage: options.readAssignmentReportPage }),
    memory,
    ownership,
    grants,
    assignmentAccess,
    workspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
    orchestratorCwd,
    sessionArchived: (sessionId) =>
      options.workspaces?.()?.archivedSessionIds?.includes(sessionId) === true,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  if (operationalDatabase.mode === 'ready') runtime.reconcileMemoryChangesOnStartup?.();
  const deletions = createPersonaBotDeletions({
    ...(options.capture === undefined ? {} : { capture: options.capture }),
    protectedPaths: [dshHome],
    database: operationalDatabase,
    registry,
    dependencies: (slug) => ({
      sessions: ownership
        .rootsFor(slug)
        .flatMap((root) => [
          root.sessionId,
          ...ownership.descendantsOf(root.sessionId).map((child) => child.sessionId),
        ])
        .sort(),
      workspaces: grants
        .list(slug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => grant.workspacePath)
        .sort(),
      grants: [
        ...grants
          .list(slug)
          .filter((grant) => grant.revokedAt === undefined)
          .map((grant) => grant.id),
        ...toolRules.list(slug).map((rule) => rule.id),
        ...externalMessaging.deletionDependencies(slug).grants,
      ].sort(),
      identities: externalMessaging.deletionDependencies(slug).identities,
      channels: channels
        .list()
        .filter((channel) => channel.members.includes(slug) || channel.botSlug === slug)
        .map((channel) => channel.id)
        .sort(),
    }),
    allWorkspacePaths: () => [
      ...(options.workspaces?.()?.list() ?? []).map((workspace) => workspace.path),
      ...registry
        .listHistorical()
        .flatMap((bot) => [
          ...bot.workspaces,
          ...grants.list(bot.slug).map((grant) => grant.workspacePath),
          ...ownership
            .rootsFor(bot.slug, 'assignment')
            .flatMap((root) => (root.cwdReference === undefined ? [] : [root.cwdReference])),
        ]),
    ],
    stop: async (slug) => {
      channels.cancelInvitationsForBot(slug);
      for (const grant of grants.list(slug))
        if (grant.revokedAt === undefined) grants.revoke(slug, grant.id);
      for (const rule of toolRules.list(slug)) toolRules.revoke(slug, rule.id);
      await runtime?.stopBot?.(slug);
      await externalMessaging.disableBot(slug);
      await options.erasePrivateAccounts?.(slug);
    },
    changed: () => live?.publishRosterCommitted(),
    log: (event) => options.warn?.(JSON.stringify(event)),
  });
  const onboarding = createBotOnboarding({
    database: attachOperationalModule(operationalDatabase, 'bot-onboarding'),
    registry,
    channels,
  });
  if (operationalDatabase.mode === 'ready') schedules.start();
  return {
    deletions,
    profileRecovery,
    contentPurge,
    onboarding,
    partLibrary,
    rootDir,
    operationalDatabase,
    externalMessaging,
    registry,
    modelPresets,
    configureAssignmentConcurrencyLimit: (read) => {
      const registration = { read };
      assignmentLimits.push(registration);
      return () => {
        const index = assignmentLimits.indexOf(registration);
        if (index !== -1) assignmentLimits.splice(index, 1);
      };
    },
    configureGroupInvitations: (autoAccept) => {
      const registration = { policy: autoAccept };
      groupInvitationPolicies.push(registration);
      return () => {
        const index = groupInvitationPolicies.indexOf(registration);
        if (index !== -1) groupInvitationPolicies.splice(index, 1);
      };
    },
    contributeBotAgentSetup,
    runBotAgentSetups,
    hostTools,
    states,
    ownership,
    memory,
    ...(usage === undefined ? {} : { usage }),
    grants,
    toolRules,
    assignmentAccess,
    channels,
    attention,
    inboxHistory,
    sourcePolicy,
    schedules,
    humanAttention,
    humanAttentionDecisions,
    attachments,
    live,
    companions,
    roster,
    runtime,
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const dshHome = resolveDshHome();
  mountClientDiagnostics(ctx, dshHome);
  const release = installedRelease(import.meta.url);
  const telemetryChoice = telemetryDecision(config.telemetry);
  const telemetryDir = join(dshHome, 'botharness');
  const telemetry = createTelemetryService({
    decision: telemetryChoice,
    dataDir: telemetryDir,
    log: (message) => ctx.logger.info(message),
  });
  const telemetryState = telemetry.status();
  ctx.logger.info(
    telemetryState.enabled
      ? 'telemetry phase=enabled'
      : `telemetry phase=disabled reason=${telemetryState.lockedBy ?? 'preference'}`,
  );
  ctx.effect(() => () => void telemetry.close(), 'botharness: telemetry');
  telemetry.capture(
    'plugin_started',
    pluginStartedProperties({
      pluginVersion: release.version(),
      dshVersion: installedDshVersion(),
      os: process.platform,
      arch: process.arch,
    }),
  );
  deliverPendingExceptions(telemetry, telemetryDir);
  if (telemetryState.lockedBy === undefined)
    ctx.effect(
      () => installExceptionCapture({ dataDir: telemetryDir, enabled: () => telemetry.enabled }),
      'botharness: telemetry exceptions',
    );
  const git = createGitService({ dshHome, log: (message) => ctx.logger.info(message) });
  const resolvedGit = git.resolve();
  ctx.logger.info(
    resolvedGit.available
      ? `git phase=resolved source=${resolvedGit.source} version=${resolvedGit.version}`
      : `git phase=resolved unavailable=${resolvedGit.reason}`,
  );
  let publishDraft: (event: ChannelDraftEvent) => void = () => undefined;
  const defaultModel = (ctx as unknown as { agentDefaultModel: DshDefaultModelHost })
    .agentDefaultModel;
  const providerCredentials = createProviderCredentialHealth();
  const forgetCredentialFailures = (): void => providerCredentials.reset();
  const events = ctx as unknown as {
    on(event: string, listener: () => void): () => void;
  };
  for (const event of [
    'credentials/reference-updated',
    'credentials/record-updated',
    'settings/document-updated',
    'llm/adapters-updated',
  ])
    events.on(event, forgetCredentialFailures);
  const modelCatalog = createModelCatalog(ctx.llm, {
    credentials: providerCredentials,
    credentialFailure: createCredentialReadiness({
      providers: () => ctx.llm.listConfigurableProviders(),
      settings: () =>
        (
          ctx.get('settings') as unknown as
            | { describe(options: { redactSecrets: boolean }): { ns: string; value: unknown }[] }
            | undefined
        )?.describe({ redactSecrets: true }) ?? [],
      describe: async (ref) => {
        const credentials = ctx.get('credentials') as unknown as
          | { describe(ref: string): Promise<{ configured: boolean }> }
          | undefined;
        if (!credentials) throw new Error('Native credentials service is unavailable');
        return credentials.describe(ref);
      },
    }),
    defaultRoute: () => {
      const selection = defaultModel.currentSelection();
      return {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selection.reasoningEffort }),
      };
    },
  });
  const modelReadiness = createModelRouteReadiness(
    {
      get: (slug) => core.registry.get(slug),
      migrateLegacyModel: (slug, expectedModel, route) =>
        core.registry.migrateLegacyModel(slug, expectedModel, route),
    },
    modelCatalog,
  );
  const privateExecution = new ProtectedExecution((phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details }),
  );
  const agentAdapter = createDshBotAgentAdapter({
    agents: ctx.agents,
    defaultModel,
    observeTurnFailure: (provider, code) => providerCredentials.observe(provider, code),
    resolveModelPlan: (slug) => core.registry.get(slug)?.modelPlan,
    hasSession: async (sessionId) => {
      const persistence = ctx.get('sessionPersistence') as unknown as
        | { stat(id: string): Promise<unknown> }
        | undefined;
      if (persistence === undefined) throw new Error('DSH Session Persistence is unavailable');
      return (await persistence.stat(sessionId)) !== undefined;
    },
    prepareModelRoute: (slug, role, retainedRoute) => {
      core.profileRecovery.requireExecution(slug);
      return modelReadiness.prepare(slug, role, retainedRoute);
    },
    orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    defaultAgentPreset: config.agentPreset ?? DEFAULT_AGENT_PRESET,
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => publishDraft(event),
    onAgentSetup: (agentCtx, agent, info) => core.runBotAgentSetups(agentCtx, agent, info),
    onOrchestratorFileSetup: (agentCtx, agent) =>
      installOrchestratorFileTools(
        agentCtx,
        agent,
        ctx.get('agentPresets') as DshAgentPresetHost | undefined,
        (name, args) => nativeExecutionRoot(core, agent.session, name, args),
      ),
    authorizeBorrow: (agent, role) => {
      const owner = core.ownership.resolve(agent.session.id);
      if (owner?.rootRole !== role) throw new Error('BotHarness Agent role mismatch');
      const denial = grantExecutionDenial(
        core,
        agent.session,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
      );
      if (denial !== undefined) throw new Error(denial);
    },
  });
  let userQuestions: ChannelUserQuestions | undefined;
  let toolApproval: ChannelToolApproval | undefined;
  let privateInputs: PrivateInputs | undefined;
  const core = createCore({
    dshHome,
    triageContinuation: true,
    companionProfileDir: (ctx.get('profileContext') as { dir: string } | undefined)?.dir,
    onOutputCommitted: (event) =>
      emitPersonaBotOutputCommitted(ctx, event, (message) => ctx.logger.warn(message)),
    activeQuestionMessageIds: () => userQuestions?.activeMessageIds() ?? [],
    activeToolApprovalMessageIds: () => toolApproval?.activeMessageIds() ?? [],
    activePrivateInputMessageIds: () => privateInputs?.activeMessageIds() ?? [],
    erasePrivateAccounts: async (slug) => privateInputs?.eraseBot(slug),
    capture: (event, properties) => telemetry.capture(event, properties),
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
    saveReportSpill: async ({ sessionId, content }) => {
      const spillStore = ctx.get('spillStore') as unknown as
        | {
            saveText(input: {
              owner: { sessionId: string };
              source: { kind: 'session-reference'; sessionId: string; label: string };
              suggestedName: string;
              content: string;
            }): Promise<{ locator: string; bytes: number; retrievalHint: string }>;
          }
        | undefined;
      if (spillStore === undefined) throw new Error('DSH Spill service is unavailable');
      return spillStore.saveText({
        owner: { sessionId },
        source: { kind: 'session-reference', sessionId, label: 'Assignment report' },
        suggestedName: 'assignment-report.txt',
        content,
      });
    },
    readAssignmentTail: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readBoundedAssignmentTail(query, sessionId);
    },
    readAssignmentReportPage: async (sessionId, acceptedSummary, offset) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readAssignmentReportPage(query, sessionId, acceptedSummary, offset);
    },
    workspaces: () => ctx.get('workspaceRegistry') as unknown as DshWorkspaceLookup | undefined,
    sessionArchive: () =>
      ctx.get('workspaceRegistry') as unknown as NativeSessionArchive | undefined,
  });
  publishDraft = (event) => core.live.publishDraft(event);
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => () => core.contentPurge.close(), 'botharness: purge ledger');
  if (core.operationalDatabase.mode === 'ready' && telemetryState.lockedBy === undefined) {
    const usageDatabase = attachOperationalModule(core.operationalDatabase, 'telemetry');
    ctx.effect(
      () =>
        startDailyUsage({
          telemetry,
          dataDir: telemetryDir,
          counts: (since, until) => readDailyUsageCounts(usageDatabase, since, until),
          log: (message) => ctx.logger.info(message),
        }),
      'botharness: telemetry daily usage',
    );
  }
  ctx.effect(() => () => core.roster.detach(), 'botharness: roster');
  ctx.effect(() => {
    const controller = new AbortController();
    if (core.operationalDatabase.mode === 'ready')
      void core.channels.migrateAttachments?.(controller.signal).catch(() => {
        if (!controller.signal.aborted)
          ctx.logger.warn('attachment-migration phase=failed action=inspect-database-and-restart');
      });
    return () => controller.abort();
  }, 'botharness: retained attachment migration');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.effect(() => () => core.schedules.close(), 'botharness: bot schedules');
  ctx.effect(() => () => core.live.close(), 'botharness: Channel live hub');
  ctx.effect(() => () => core.companions.close(), 'botharness: Window Companion feed');
  ctx.provide('botharness', core);
  if (config.privateInputExecution === true)
    ctx.logger.warn(
      'botharness: privateInputExecution is set, but the Docker-protected Profile was removed. This Profile runs as an ordinary Profile: secret input stays available, and Agent tools are no longer fenced by a container.',
    );
  privateInputs = mountPrivateInputs(ctx, core, privateExecution, config.privateInputWebUrl);
  ctx.effect(() => () => core.externalMessaging.close(), 'botharness: external messaging');
  ctx.inject(['dshIm'], (child) => {
    for (const platform of ['feishu', 'slack', 'discord', 'weixin', 'qq'] as const) {
      const provider = createDshImProvider(child.get('dshIm'), platform);
      if (provider !== undefined) child.effect(() => core.externalMessaging.register(provider));
    }
  });

  const permissionDenial = (session: import('@deepseek-ai/dsh-session').Session) =>
    grantExecutionDenial(core, session, ctx.get('sandboxPolicy'), ctx.get('approval'));

  const appliedPermission = new Map<string, string>();
  ctx.effect(() => () => appliedPermission.clear(), 'botharness: Orchestrator permission record');
  const alignOrchestratorPermission = (agent: import('@deepseek-ai/dsh-agent').Agent): void => {
    const session = agent.session;
    const owner = core.ownership.resolve(session.id);
    const policy = ctx.get('sandboxPolicy') as
      | import('@deepseek-ai/dsh-sandbox-policy').SandboxPolicyService
      | undefined;
    const approval = ctx.get('approval') as ApprovalService | undefined;
    if (
      owner?.rootRole !== 'orchestrator' ||
      owner.provenance === 'subagent' ||
      owner.parentSessionId !== undefined ||
      policy === undefined ||
      approval === undefined
    )
      return;
    const expected = orchestratorPermission(core, owner.botSlug);
    const key = expected.mode + '+' + expected.approval;
    if (
      policy.resolve({ session }).mode === expected.mode &&
      approval.overrideOf(session) === expected.approval
    ) {
      appliedPermission.set(session.id, key);
      return;
    }
    const changedOutside = appliedPermission.get(session.id) === key;
    setSandboxMode(session, expected.mode);
    setApprovalPolicy(session, expected.approval);
    appliedPermission.set(session.id, key);
    if (!changedOutside) return;
    ctx.logger.warn(
      'botharness: restored the permission mode of an Orchestrator Session that was changed outside the PersonaBot access setting',
    );
    const channel = core.channels.getOrCreateDm(owner.botSlug);
    if (channel !== undefined)
      void core.channels
        .appendMessage(channel.id, {
          id: randomUUID(),
          at: new Date().toISOString(),
          author: { kind: 'bot', slug: owner.botSlug },
          body: '这个会话的权限模式被单独改动过，Host 已把它恢复。聊天会话的权限由此 Bot 工作区设置里的“完全访问”开关决定，不能在会话里单独修改。',
        })
        .catch(() => undefined);
  };
  ctx.on(
    'agent/pre-step',
    async ({ agent, signal }, next) => {
      try {
        await core.runtime.ensureAssignmentCapacity?.(agent.session.id, signal);
      } catch {
        return { kind: 'reject' };
      }
      alignOrchestratorPermission(agent);
      return permissionDenial(agent.session) === undefined ? next() : { kind: 'reject' };
    },
    { global: true },
  );
  toolApproval = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    (agent, owner) => {
      const cwd = agent.session.header.cwd ?? '';
      if (owner.rootRole === 'assignment') {
        const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
        const grantId = assignment?.permission?.grantId;
        if (grantId === undefined) return undefined;
        try {
          core.grants.requireActive(owner.botSlug, grantId);
        } catch {
          return undefined;
        }
        return JSON.stringify(['assignment', cwd, grantId]);
      }
      const activeIds = core.grants
        .list(owner.botSlug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => `${grant.id}:${grant.writeRevision ?? 0}`)
        .sort();
      return JSON.stringify(['orchestrator', cwd, activeIds]);
    },
    {
      changed: (slug, count) => core.states.setApprovalCount(slug, count),
      warn: (message) => ctx.logger.warn(message),
    },
    (sessionId, callId, signal) =>
      core.runtime.beginAssignmentApprovalWait?.(sessionId, callId, signal),
    (sessionId) => core.runtime.askChannel?.(sessionId),
  );
  ctx.effect(
    () => core.externalMessaging.approvals.attach(toolApproval, core.channels),
    'botharness: approved IM tool controls',
  );
  ctx.effect(
    () => core.companions.attachApprovals(toolApproval),
    'botharness: companion approval observation',
  );
  userQuestions = new ChannelUserQuestions(
    core.channels,
    core.ownership,
    (agent) => ctx.agents.get(agent.id) === agent,
    (message) => ctx.logger.warn(message),
    (slug, count) => core.states.setQuestionCount(slug, count),
    nativeTimedQuestions(ctx, core.runtime),
    (sessionId) => core.runtime.askChannel?.(sessionId),
  );
  ctx.effect(() => () => userQuestions.close(), 'botharness: Channel user questions');
  ctx.effect(
    () => core.companions.attachQuestions(userQuestions),
    'botharness: companion question observation',
  );
  ctx.on(
    'user-questions/request',
    async (request, next) => (await userQuestions.ask(request)) ?? next(),
    { global: true },
  );
  const approvedCalls = new Map<symbol, (name: string, args: unknown) => boolean>();
  ctx.effect(() => () => approvedCalls.clear(), 'botharness: one-call approval execution fences');
  ctx.effect(() => () => toolApproval.close(), 'botharness: Channel tool approvals');
  ctx.on('approval/request', async (request, next) => (await toolApproval.ask(request)) ?? next(), {
    global: true,
  });
  ctx.on(
    'tools/pre-execute',
    async (execution, next) => {
      const agent = execution.agent;
      if (agent === undefined || core.ownership.resolve(agent.session.id) === undefined)
        return next();
      if (!requiresHumanToolApproval(execution.name, execution.arguments)) return next();
      const storeDenial = credentialStoreDenial(
        execution.name,
        execution.arguments,
        resolveDshHome(),
        agent.session.header.cwd,
      );
      if (storeDenial !== undefined) return { kind: 'deny', reason: storeDenial };
      if (execution.name === 'secret_cli') {
        const commandDenial = secretCommandDenial(execution.arguments);
        if (commandDenial !== undefined) return { kind: 'deny', reason: commandDenial };
      }
      if (isSafeMemoryDirectoryListing(core, agent.session, execution.name, execution.arguments))
        return next();

      const computerTools = ctx.get('botharnessComputerTools') as
        | {
            ownsTool?(name: string): boolean;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(): string;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (computerTools?.ownsTool?.(execution.name) === true) {
        if (computerTools.needsAuthorization?.(agent.session.id) !== true) return next();
        const authorizationScope = computerTools.authorizationScope?.();
        const computerApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackComputer = toolApproval.track(execution, 'web-only');
        if (computerApproval === undefined || untrackComputer === undefined) {
          return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
        }
        try {
          const outcome = await computerApproval.request({
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason: "This PersonaBot wants to act on the profile's shared Computer.",
            signal: execution.signal,
          });
          if (outcome !== 'allowed-once') {
            return { kind: 'deny', reason: 'Human approval was ' + outcome };
          }
          if (computerTools.markAuthorized?.(agent.session.id, authorizationScope) === false)
            return {
              kind: 'deny',
              reason:
                'Computer Target changed while awaiting Human approval; request a new action.',
            };
          const guard = toolApproval.executionGuard(agent, execution.callId);
          if (!guard || !guard(execution.name, execution.arguments))
            return { kind: 'deny', reason: 'Approval authority changed before execution' };
          approvedCalls.set(execution.token, guard);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackComputer();
        }
      }
      const browserTools = ctx.get('botharnessBrowserTools') as
        | {
            ownsTool?(name: string): boolean;
            executionSignal?(sessionId: string): AbortSignal | undefined;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(sessionId?: string): string;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (browserTools?.ownsTool?.(execution.name) === true) {
        const browserSignal = browserTools.executionSignal?.(agent.session.id);
        if (browserTools.executionSignal !== undefined && browserSignal === undefined)
          return { kind: 'deny', reason: 'Browser Access is off for this PersonaBot' };
        if (browserTools.needsAuthorization?.(agent.session.id) !== true) return next();
        const browserAuthorizationScope = browserTools.authorizationScope?.(agent.session.id);
        const browserApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackBrowser = toolApproval.track(execution, 'web-only');
        if (browserApproval === undefined || untrackBrowser === undefined) {
          return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
        }
        try {
          const outcome = await browserApproval.request({
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason: 'This PersonaBot wants to use the Browser authorized by the Human.',
            signal: AbortSignal.any([execution.signal, browserSignal ?? execution.signal]),
          });
          if (outcome !== 'allowed-once') {
            return { kind: 'deny', reason: 'Human approval was ' + outcome };
          }
          if (browserTools.markAuthorized?.(agent.session.id, browserAuthorizationScope) === false)
            return {
              kind: 'deny',
              reason:
                'Browser authority changed while awaiting Human approval; request a new action.',
            };
          const guard = toolApproval.executionGuard(agent, execution.callId);
          if (!guard || !guard(execution.name, execution.arguments))
            return { kind: 'deny', reason: 'Approval authority changed before execution' };
          approvedCalls.set(execution.token, guard);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackBrowser();
        }
      }
      const denial = permissionDenial(agent.session);
      if (denial !== undefined) return { kind: 'deny', reason: denial };
      if (
        typeof execution.arguments === 'object' &&
        execution.arguments !== null &&
        'sandbox_permissions' in execution.arguments
      ) {
        return {
          kind: 'deny',
          reason: 'BotHarness Session cannot request sandbox permission escalation',
        };
      }
      const owner = core.ownership.resolve(agent.session.id);
      const snapshot =
        owner?.rootRole === 'assignment'
          ? core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission
          : undefined;
      const eachUse = execution.name === 'secret_cli';
      const fullAccess =
        snapshot?.mode === 'danger-full-access' ||
        (owner?.rootRole === 'orchestrator' &&
          owner.provenance !== 'subagent' &&
          orchestratorPermission(core, owner.botSlug).mode === 'danger-full-access');
      if (fullAccess && !eachUse) return next();
      const approval = ctx.get('approval') as ApprovalService | undefined;
      const untrack = toolApproval.track(execution, eachUse ? 'each-use' : 'operation');
      if (approval === undefined || untrack === undefined) {
        return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
      }
      try {
        const notice = toolApproval.willPrompt(agent, execution.callId)
          ? core.runtime.askNotice?.(agent.session.id, execution.name)
          : undefined;
        if (notice !== undefined) return { kind: 'deny', reason: notice };
        const outcome = eachUse
          ? ((await toolApproval.ask({
              agent,
              toolName: execution.name,
              callId: execution.callId,
              signal: execution.signal,
            })) ?? 'unavailable')
          : await approval.request({
              agent,
              toolName: execution.name,
              callId: execution.callId,
              reason:
                execution.name === 'channel_attachment_open'
                  ? 'This PersonaBot wants to edit the selected original attachment. All references to this file will show its current contents.'
                  : eachUse
                    ? 'This PersonaBot wants to run a command-line tool with a secret you entered. The program receives the secret and could reveal it. Check the program and every argument.'
                    : 'This tool call may access files outside the authorized folder.',
              signal: execution.signal,
            });
        if (outcome !== 'allowed-once') {
          return { kind: 'deny', reason: 'Human approval was ' + outcome };
        }
        if (!toolApproval.validAfterDecision(agent, execution.callId))
          return { kind: 'deny', reason: 'Approval rule scope changed' };
        const guard = toolApproval.executionGuard(agent, execution.callId);
        if (!guard || !guard(execution.name, execution.arguments))
          return { kind: 'deny', reason: 'Approval authority changed before execution' };
        approvedCalls.set(execution.token, guard);
        return await next();
      } catch {
        return { kind: 'deny', reason: 'Human approval is unavailable' };
      } finally {
        untrack();
      }
    },
    { global: true },
  );

  ctx.tools.guard(({ agent, name, arguments: args, token }) => {
    const approvalGuard = approvedCalls.get(token);
    if (approvalGuard && !approvalGuard(name, args))
      return 'Approval authority or operation changed before execution';
    const allowedOnce = approvalGuard !== undefined;
    return agent === undefined
      ? undefined
      : grantToolExecutionDenial(
          core,
          agent.session,
          ctx.get('sandboxPolicy'),
          ctx.get('approval'),
          name,
          args,
          allowedOnce,
        );
  });
  ctx.on(
    'tools/execute',
    async (execution, next) => {
      if (
        execution.agent === undefined ||
        core.ownership.resolve(execution.agent.session.id)?.rootRole !== 'assignment' ||
        core.runtime.runAssignmentTool === undefined
      )
        return next();
      return core.runtime.runAssignmentTool(
        execution.agent.session.id,
        execution.callId,
        execution.token,
        execution.signal,
        () => {
          const approvalGuard = approvedCalls.get(execution.token);
          if (approvalGuard && !approvalGuard(execution.name, execution.arguments))
            throw new Error('Approval authority or operation changed before execution');
          const denial = grantToolExecutionDenial(
            core,
            execution.agent!.session,
            ctx.get('sandboxPolicy'),
            ctx.get('approval'),
            execution.name,
            execution.arguments,
            approvalGuard !== undefined,
          );
          if (denial !== undefined) throw new Error(denial);
          return next();
        },
      );
    },
    { global: true },
  );
  ctx.on(
    'tools/result',
    (execution) => {
      approvedCalls.delete(execution.token);
      if (execution.agent !== undefined)
        core.runtime.settleAssignmentTool?.(execution.agent.session.id, execution.callId);
    },
    { global: true },
  );

  ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => agentAdapter.acceptAssistantStream(agent.session.id, frame),
    { global: true },
  );

  const dshSessions = (ctx as unknown as { sessions: DshSessionStore }).sessions;

  const developerModeTarget: { gate?: DeveloperModeSkillGate } = {};
  const releaseInstaller: { current: ReleaseInstaller | undefined } = { current: undefined };
  ctx.inject(['pluginManager'], (managerCtx) => {
    managerCtx.effect(() => {
      releaseInstaller.current = (
        managerCtx as unknown as { pluginManager: ReleaseInstaller }
      ).pluginManager;
      return () => {
        releaseInstaller.current = undefined;
      };
    }, 'botharness: release installer');
  });
  const releaseRestarter: { current: ReleaseRestarter | undefined } = { current: undefined };
  ctx.inject(['appExit'], (exitCtx) => {
    exitCtx.effect(() => {
      releaseRestarter.current = createProcessRestarter({
        exit: (exitCtx as unknown as { appExit: (code: number) => void }).appExit,
      });
      return () => {
        releaseRestarter.current = undefined;
      };
    }, 'botharness: release restarter');
  });
  const bridgeMethods = createBridgeMethods({
    composerIdentity: () =>
      composerRecoveryIdentity(
        join(homedir(), '.config', 'botharness', 'composer-host-id'),
        join(core.rootDir, '..', 'composer-profile-id'),
        core.channels.humanIdentity().humanId,
      ),
    warn: (message) => ctx.logger.warn(message),
    registry: core.registry,
    deletions: core.deletions,
    contentPurge: core.contentPurge,
    modelPresets: core.modelPresets,
    modelCatalog,
    modelReadiness,
    onboarding: core.onboarding,
    partLibrary: core.partLibrary,
    onboardingNews: (slug) =>
      onboardingNewsAvailable(
        ctx,
        (slug === undefined ? undefined : core.registry.get(slug)?.preset) ??
          config.agentPreset ??
          DEFAULT_AGENT_PRESET,
      ),
    defaultModel: defaultModel as DshDefaultModelHost & {
      saveSelection(route: import('./models/presets.js').ModelRoute): Promise<void>;
    },
    states: core.states,
    runningSessionIds: () =>
      new Set(
        ctx.agents
          .list()
          .filter((agent) => agent.status === 'running')
          .map((agent) => agent.id),
      ),
    channels: core.channels,
    attachments: core.attachments,
    ownership: core.ownership,
    memory: core.memory,
    ...(core.usage === undefined ? {} : { usage: core.usage }),
    readUsageSessionLog: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as
        | {
            readSession(
              id: string,
            ): Promise<{ events: readonly DshSessionEvent[]; inheritedEventCount?: number }>;
          }
        | undefined;
      if (query === undefined) return undefined;
      const snapshot = await query.readSession(sessionId);
      return { events: snapshot.events, inheritedEventCount: snapshot.inheritedEventCount ?? 0 };
    },
    roster: core.roster,
    runtime: core.runtime,
    attention: core.attention,
    sourcePolicy: core.sourcePolicy,
    schedules: core.schedules,
    humanAttention: core.humanAttention,
    humanAttentionDecisions: core.humanAttentionDecisions,
    grants: core.grants,
    externalMessaging: core.externalMessaging,
    toolApproval,
    userQuestions,
    toolRules: core.toolRules,
    assignmentAccess: core.assignmentAccess,
    marketplace: createMarketplaceClient({
      baseUrl: config.marketplaceUrl ?? DEFAULT_MARKETPLACE_URL,
    }),
    release: createReleaseService({
      version: () => runningRelease.version,
      ledgers: () => runningRelease.ledgers,
      installer: () => releaseInstaller.current,
      restarter: () => releaseRestarter.current,
    }),
    telemetry,
    git,
    developerMode: {
      set: (enabled: boolean) => developerModeTarget.gate?.set(enabled),
    },
    computerAccess: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessComputerTools') as unknown as
          | { reconcileBot?: (slug: string) => Promise<void> }
          | undefined;
        const pending = provider?.reconcileBot?.(slug);
        void pending?.catch((error: unknown) => {
          ctx.logger.warn(
            `botharness: Computer tool reconcile failed for ${slug}: ${String(error)}`,
          );
        });
      },
    },
    browserAccess: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessBrowserTools') as unknown as
          | { reconcileBot?: (slug: string) => Promise<void> }
          | undefined;
        const pending = provider?.reconcileBot?.(slug);
        void pending?.catch((error: unknown) => {
          ctx.logger.warn(
            `botharness: Browser tool reconcile failed for ${slug}: ${String(error)}`,
          );
        });
      },
    },
    browserProfile: {
      changed: (slug: string) => {
        const provider = ctx.get('botharnessBrowserTools') as unknown as
          | { resetBot?: (slug: string) => void }
          | undefined;
        provider?.resetBot?.(slug);
      },
    },
  });
  registerBridge(ctx, bridgeMethods, privateInputs, {
    followRoster: (signal) => core.live.followRoster(signal),
    followActivity: (signal) => core.live.followActivity(signal),
    followChannel: (channelId, limit, signal) => core.live.followChannel(channelId, limit, signal),
    journalPage: (channelId, request) => core.channels.readHumanJournalPage(channelId, request),
    followCompanion: (resume, lastEventId, signal) =>
      followCompanion((request) => core.companions.open(request), resume, lastEventId, signal),
  });

  ctx.inject(['skills'], (skillsCtx) => {
    const skills = (
      skillsCtx as unknown as {
        skills: {
          register(skill: {
            readonly name: string;
            readonly description: string;
            readonly whenToUse: string;
            readonly content: string;
            readonly invocation: {
              readonly modelInvocable: boolean;
              readonly userInvocable: boolean;
            };
            readonly source: string;
            readonly provider: string;
          }): () => void;
        };
      }
    ).skills;
    developerModeTarget.gate = new DeveloperModeSkillGate({
      register: (definition) => {
        let dispose: (() => void) | undefined;
        skillsCtx.effect(() => {
          dispose = skills.register(definition);
          return () => dispose?.();
        }, 'botharness: operational logs skill');
        return () => dispose?.();
      },
    });
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (
      connectionCtx as unknown as {
        connection: {
          fetch: {
            register(route: {
              path: string;
              methods: readonly ('GET' | 'POST')[];
              requestBody: 'buffered' | 'streaming';
              fetch(request: Request): Promise<Response>;
            }): () => Promise<void>;
          };
        };
      }
    ).connection;
    connectionCtx.effect(() => {
      return connection.fetch.register({
        path: CHANNEL_STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          return core.live.open(request);
        },
      });
    }, 'botharness: Channel live stream');
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: COMPANION_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async (request) =>
            request.method === 'POST'
              ? core.companions.update(request)
              : core.companions.open(request),
        }),
      'botharness: authenticated Window Companion consumption',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: MEMORY_FILE_DOWNLOAD_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: createMemoryFileHttp(core.memory),
        }),
      'botharness: current Memory file download',
    );
    const attachmentHttp = createAttachmentHttp(
      core.attachments,
      core.channels,
      async (input) => {
        const ref = await (
          input.representation === 'playback'
            ? core.externalMessaging.prepareAudio
            : core.externalMessaging.acquireFile
        )(input.slug, input.sourceEventId, input.attachmentId, input.signal);
        const signal = AbortSignal.any([
          input.signal,
          core.externalMessaging.inbound.sourceSignal(input.slug, input.sourceEventId),
        ]);
        const downloaded = await core.attachments.download(ref.fileId!, ref.name, signal);
        return downloaded;
      },
      (input) => core.externalMessaging.readChannelMedia(input),
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_UPLOAD_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment upload',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment download',
    );
    const botBannerHttp = createBotBannerHttp(core.registry);
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_BANNER_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: botBannerHttp,
        }),
      'botharness: Bot banner',
    );
    const botAvatarHttp = createBotAvatarHttp(core.registry);
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_AVATAR_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: botAvatarHttp,
        }),
      'botharness: PersonaBot avatar',
    );
    const botZipHttp = createBotZipHttp({
      registry: core.registry,
      detail: (slug) => bridgeMethods.get({ slug }),
      log: (message) => ctx.logger.info(message),
    });
    const profileBackupHttp = createProfileBackupHttp(
      {
        database: core.operationalDatabase,
        registry: core.registry,
        deletions: core.deletions,
        attachments: core.attachments,
        purge: core.contentPurge,
        version: runningRelease.version,
        sessionCount: () => core.ownership.list().length,
        dshVersion: installedDshVersion(),
        log: (message) => ctx.logger.info(message),
      },
      join(dshHome, 'botharness', 'backup-staging'),
      core.profileRecovery,
      modelCatalog,
    );
    for (const suffix of ['', '/inspect', '/recovery', '/authorize', '/activate'])
      connectionCtx.effect(
        () =>
          connection.fetch.register({
            path: PROFILE_BACKUP_PATH + suffix,
            methods: ['GET', 'POST'],
            requestBody: suffix === '/inspect' ? 'streaming' : 'buffered',
            fetch: profileBackupHttp,
          }),
        'botharness: complete environment backup ' + suffix,
      );
    const dshVersion = installedDshVersion();
    const diagnosticBundleHttp = createDiagnosticBundleHttp({
      source: {
        channels: core.channels,
        inboxHistory: core.inboxHistory,
        ownership: core.ownership,
        botName: (slug) => core.registry.get(slug)?.displayName,
        readSession: async (sessionId) => {
          const query = ctx.get('sessionQuery') as unknown as
            | { readSession(id: string): Promise<{ events: readonly DshSessionEvent[] }> }
            | undefined;
          if (query !== undefined) return (await query.readSession(sessionId)).events;
          return dshSessions.get(sessionId)?.snapshotEvents();
        },
        environment: {
          version: runningRelease.version,
          ...(dshVersion === undefined ? {} : { dshVersion }),
          platform: process.platform,
          arch: process.arch,
          node: process.version,
        },
      },
      homes: [
        { path: dshHome, label: '$DSH_HOME' },
        { path: homedir(), label: '~' },
      ],
      log: (message) => ctx.logger.info(message),
    });
    for (const path of [DIAGNOSTIC_BUNDLE_PATH, DIAGNOSTIC_BUNDLE_PREVIEW_PATH])
      connectionCtx.effect(
        () =>
          connection.fetch.register({
            path,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: diagnosticBundleHttp,
          }),
        'botharness: diagnostic bundle ' + path,
      );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_ZIP_EXPORT_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: botZipHttp,
        }),
      'botharness: Bot Zip export',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_ZIP_FILES_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: botZipHttp,
        }),
      'botharness: Bot Zip file list',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_ZIP_IMPORT_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch: botZipHttp,
        }),
      'botharness: Bot Zip import',
    );
  });
  const toolDetails = createToolDetailIndex({
    owner: (sessionId) => core.ownership.resolve(sessionId),
    repairRevision: (sessionId) => core.ownership.repairRevision(sessionId),
    events: (sessionId) => dshSessions.get(sessionId)?.snapshotEvents(),
  });
  new ActivityToolDetails(
    ctx,
    toolDetails,
    [...(config.activityDetailConsumers ?? [])],
    (event) => {
      ctx.logger.info(
        `activity-tool-detail consumer=${event.consumer} outcome=${event.outcome} bytes=${event.bytes}`,
      );
    },
  );
  ctx.effect(() => () => toolDetails.clear(), 'botharness: Activity Tool detail references');
  const activity = createDshActivityProjection({
    details: toolDetails,
    ownership: core.ownership,
    states: core.states,
    describeCall: (sessionId, name, args) => {
      const agent = ctx.agents.list().find((candidate) => candidate.session.id === sessionId);
      if (agent === undefined) return undefined;
      const definition = ctx.tools.get(name, agent);
      if (definition === undefined) return undefined;
      const view = definition.presentCall?.(args);
      const publicDetail = readPublicToolDetail(definition, args);
      return {
        name: definition.name,
        ...(view === undefined ? {} : { view }),
        ...(publicDetail === undefined ? {} : { publicDetail }),
      };
    },
  });
  ctx.effect(() =>
    core.states.onActivity((event) => ctx.emit('botharness/personabot/activity', event)),
  );

  ctx.on(
    'session/event',
    (session, event) => {
      queueMicrotask(() => {
        void userQuestions
          .reconcileSession(session.id)
          .catch(() => ctx.logger.warn('user-question-reconciliation-failed'));
      });
      activity.handleSessionEvent(session.id, event);
      try {
        core.externalMessaging.approvals.result(session.id, event);
      } catch {
        ctx.logger.warn('approval-result-publication-failed');
      }
      core.usage?.handleSessionEvent(session.id, event);
      handleCompactionEvent(
        {
          ownership: core.ownership,
          memory: core.memory,
          warn: (message) => ctx.logger.warn(message),
        },
        session.id,
        event.type,
      );
    },
    { global: true },
  );
  ctx.on(
    'agent/created',
    ({ agent }) => {
      activity.handleAgentCreated(agent.session);
      core.usage?.primeSession(agent.session.id, agent.session.snapshotEvents());
      const owner = core.ownership.resolve(agent.session.id);
      if (owner !== undefined) {
        installBotSubagentModelTools(
          agent.ctx,
          agent,
          () => core.registry.get(owner.botSlug)?.modelPlan,
        );
      }
    },
    { global: true },
  );
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      userQuestions.cancelSession(agent.session.id);
      activity.handleSessionDisposed(agent.session.id);
    },
    { global: true },
  );
  activity.rebuild(dshSessions.list());
  ctx.on(
    'agent/inbox/discarded',
    ({ agent, message }) => {
      const source: unknown = message.source;
      if (
        typeof source === 'object' &&
        source !== null &&
        'kind' in source &&
        source.kind === 'user-question-reply' &&
        'callId' in source &&
        typeof source.callId === 'string'
      )
        userQuestions.discardReply(agent.session.id, source.callId);
    },
    { global: true },
  );
  for (const session of dshSessions.list())
    core.usage?.primeSession(session.id, session.snapshotEvents());
  if (core.usage !== undefined) {
    const usage = core.usage;

    ctx.inject(['sessionQuery'], (sessionCtx) => {
      const query = sessionCtx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return;
      const readUsageLog = async (sessionId: string) => {
        try {
          const snapshot = await query.readSession(sessionId);
          return {
            events: snapshot.events,
            inheritedEventCount: snapshot.inheritedEventCount ?? 0,
          };
        } catch (error) {
          ctx.logger.warn(`botharness: usage log read failed for ${sessionId}: ${String(error)}`);
          return undefined;
        }
      };
      const tracked = core.ownership.list().map((record) => record.sessionId);
      void usage.rebuild(tracked, readUsageLog).then(
        (report) => {
          if (report.legacyBaselineBots !== undefined) {
            ctx.logger.warn(
              `botharness: usage legacy baseline retained; phase=reconcile bots=${report.legacyBaselineBots} historical_backfill=unverifiable`,
            );
          }
          ctx.logger.info(
            `botharness: usage reconciliation completed (${report.folded} attempts, ${report.failed} failed sessions)`,
          );
        },
        (error: unknown) => {
          ctx.logger.warn(`botharness: usage projection rebuild failed: ${String(error)}`);
        },
      );
    });
  }

  ctx.inject(['storageDomain'], (storageCtx) => {
    void core.roster.attach(storageCtx.storageDomain).catch(() => {
      ctx.logger.warn(
        'roster-import initiator=host-startup phase=unavailable arrangement=read-only',
      );
    });
  });

  ctx.systemPrompt.section({
    name: 'botharness:persona',
    order: PERSONA_SECTION_ORDER,
    text: ({ agent }) => core.memory.personaForSession(agent?.session?.id),
  });
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'botharness/personabot/activity'(event: PersonaBotActivityEvent): void;
  }
}
