import * as profileStorage from './features/profile-storage/plugin.js';
import * as personabotsFeature from './features/personabots/plugin.js';
import * as tobFeature from './features/tob/plugin.js';
import * as approvalsFeature from './features/approvals/plugin.js';
import * as memoryFeature from './features/memory/plugin.js';
import * as workspacesFeature from './features/workspaces/plugin.js';
import * as teamFeature from './features/team/plugin.js';
import { currentRoots } from './workspaces/grant-native-tools.js';
import { createChannelManagement } from './channels/management.js';
import { join } from 'node:path';
import type { CompanionFeed } from './companions/feed.js';
import { createAttachmentStore } from './attachments/store.js';
import { createCoreStartup } from './diagnostics/core-startup.js';
import type { PersonaBotRegistry } from './bots/registry.js';
import type { FallbackOverrideStore } from './models/fallback-overrides.js';
import type { RoutingGroupStore } from './models/routing-groups.js';
import type { ModelPresetStore } from './models/presets.js';
import type { ModelFavoriteStore } from './models/favorites.js';
import { createMediaVersions } from './attachments/media-versions.js';
import { loadImageProcessor } from './attachments/thumbnails.js';
import type { ChannelLiveHub } from './channels/live.js';
import { attachOperationalModule, mountOperationalDatabase } from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import type { RosterStore } from './roster/store.js';
import type { BotRuntime } from './runtime/bot-runtime.js';
import { createInboxHistoryQuery } from './runtime/inbox-history.js';
import { createBotSourcePolicyStore } from './runtime/source-policy.js';
import { createAssignmentAccessStore } from './workspaces/assignment-access.js';
import { createSessionOwnership } from './sessions/ownership.js';
import { DEFAULT_BOT_HOP_LIMIT, isBotHopLimit } from './channels/channel.js';
import { createBotStateTracker } from './state/bot-state.js';
import type { UsageProjection } from './usage/usage.js';
import { createMessagePerfTracker, type MessagePerfTracker } from './usage/message-perf.js';
import * as activityFeature from './features/activity/plugin.js';
import * as avatars from './features/avatars/plugin.js';
import * as models from './features/models/plugin.js';
import * as messaging from './features/messaging/plugin.js';
import * as promptPresets from './features/prompts/plugin.js';
import * as botSchedules from './features/schedules/plugin.js';
import * as voice from './features/voice/plugin.js';
import type { BotHarnessCore, CoreOptions } from './plugin-types.js';
import * as channelsFeature from './features/channels/plugin.js';
import * as appearanceFeature from './features/appearance/plugin.js';
import * as usageFeature from './features/usage/plugin.js';
import type {} from '@deepseek-ai/dsh-agent-loop';
import type {} from '@deepseek-ai/dsh-tools';

export function createCore(options: CoreOptions = {}): BotHarnessCore {
  const startup = createCoreStartup(options.startupDiagnostic);
  try {
    const core = initializeCore(options, startup);
    startup.ready();
    return core;
  } catch (error) {
    try {
      startup.failed(error);
    } catch {}
    throw error;
  }
}

function initializeCore(
  options: NonNullable<Parameters<typeof createCore>[0]>,
  startup: ReturnType<typeof createCoreStartup>,
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    instanceId: startup.mountId,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...(options.databaseDiagnostic === undefined
      ? {}
      : { onDiagnostic: options.databaseDiagnostic }),
  });
  startup.mounted(operationalDatabase.diagnostics());
  if (operationalDatabase.recovery !== undefined)
    options.warn?.(
      `operational-database initiator=host-startup phase=recovery code=${operationalDatabase.recovery.code} path=${JSON.stringify(operationalDatabase.databasePath)} reason=${JSON.stringify(operationalDatabase.recovery.message)}`,
    );
  if (operationalDatabase.foreignKeyOrphans !== undefined)
    options.warn?.(
      `operational-database initiator=host-startup phase=foreign-key-orphans path=${JSON.stringify(operationalDatabase.databasePath)} orphans=${JSON.stringify(operationalDatabase.foreignKeyOrphans)}`,
    );
  let usage: UsageProjection | undefined;
  startup.enter('avatar-part-library', 'initialize');
  const { partLibrary, onAppearanceImported } = avatars.apply(operationalDatabase);
  let registry: PersonaBotRegistry;
  let modelPresets: ModelPresetStore;
  let modelFavorites: ModelFavoriteStore;
  let routingGroups: RoutingGroupStore;
  let fallbackOverrides: FallbackOverrideStore;
  let roster: RosterStore;
  let live: ChannelLiveHub | undefined;
  try {
    workspacesFeature.relocateMemoryOnStartup(startup, operationalDatabase, dshHome);
    startup.enter('bot-registry', 'initialize');
    registry = personabotsFeature.createRegistry({
      rootDir,
      dshHome,
      operationalDatabase,
      options,
      onAppearanceImported,
      get spaces() {
        return spaces;
      },
      get team() {
        return team;
      },
      get grants() {
        return grants;
      },
      get live() {
        return live;
      },
    });
    startup.enter('roster', 'initialize');
    roster = personabotsFeature.createRoster(operationalDatabase, options.warn, () => live);
    ({ modelFavorites, modelPresets, fallbackOverrides, routingGroups } = models.createStores(
      startup,
      operationalDatabase,
      dshHome,
      () => registry,
      options,
    ));
  } catch (error) {
    operationalDatabase.close();
    throw error;
  }
  personabotsFeature.backfillRegistry(startup, operationalDatabase, registry, options);
  startup.enter('bot-state', 'initialize');
  const states = createBotStateTracker();
  startup.enter('attachments', 'initialize');
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  let changedFiles: ((fileId: string) => void) | undefined;
  startup.enter('media-versions', 'initialize');
  const mediaVersions = createMediaVersions(
    attachments,
    () => loadImageProcessor(options.warn),
    (fileId) => changedFiles?.(fileId),
  );
  startup.enter('content-purge', 'initialize');
  const contentPurge = profileStorage.createContentPurge({
    dshHome,
    operationalDatabase,
    attachments,
    options,
    get memory() {
      return memory;
    },
    get grants() {
      return grants;
    },
  });
  let runtime: BotRuntime | undefined;
  let companions: CompanionFeed | undefined;
  let reconcileToolRuleCreators: ((botSlug: string) => void) | undefined;
  startup.enter('bot-inbox', 'initialize');
  const sourcePolicy = createBotSourcePolicyStore(
    attachOperationalModule(operationalDatabase, 'bot-inbox'),
  );
  const externalMessaging = messaging.apply(
    startup,
    operationalDatabase,
    (slug) => registry.get(slug),
    {
      channels: {
        get: (id) => channels.get(id),
        getOrCreateDm: (human, slug) => channels.getOrCreateDm(human, slug),
      },
      ownsFailure: (slug, sessionId, role) => {
        const owner = ownership.resolve(sessionId);
        return owner?.botSlug === slug && owner.rootRole === role;
      },
      onAuthorizationChanged: (slug) => reconcileToolRuleCreators?.(slug),
      onDefaultsChanged: () => live?.publishRosterCommitted(),
      onReceptionChanged: () => live?.publishRosterCommitted(),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      attachments,
      sourcePolicy,
      onAdmitted: (slug, sourceEventId) => runtime?.admitExternalSource?.(slug, sourceEventId),
      onPlaced: (commit) => live?.publishCommitted(commit),
      onShared: (slugs) => {
        for (const slug of slugs) runtime?.resumePendingDigests?.(slug);
      },
      onIngested: (channelId, messageId) => runtime?.admitGroupMessage(channelId, messageId),
      ...(options.imCommands === undefined ? {} : { imCommands: options.imCommands }),
      ...(options.warn === undefined ? {} : { warn: options.warn }),
    },
  );
  const initialGroupInvitationPolicy = options.autoAcceptGroupInvitations ?? (() => true);
  const assignmentLimits: { read: () => number }[] = [];
  const botHopLimits: { read: () => number }[] = [];
  const botHopLimit = (): number => {
    const value = (botHopLimits.at(-1)?.read ?? options.botHopLimit)?.();
    return isBotHopLimit(value) ? value : DEFAULT_BOT_HOP_LIMIT;
  };
  const groupInvitationPolicies: { policy: () => boolean }[] = [];
  startup.enter('messaging', 'channels');
  const channels = channelsFeature.createChannels({
    operationalDatabase,
    sourcePolicy,
    registry,
    attachments,
    mediaVersions,
    externalMessaging,
    dshHome,
    options,
    botHopLimit,
    groupInvitationPolicies,
    initialGroupInvitationPolicy,
    get ownership() {
      return ownership;
    },
    get companions() {
      return companions;
    },
    get live() {
      return live;
    },
    get runtime() {
      return runtime;
    },
  });
  changedFiles = (fileId) => channels.recordAttachmentChange?.(fileId);
  const attention = activityFeature.createBotAttention(startup, operationalDatabase, channels);
  startup.enter('inbox-history', 'initialize');
  const inboxHistory = createInboxHistoryQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const team = teamFeature.apply({
    operationalDatabase,
    channels,
    contentPurge,
    spaces: () => spaces,
    registry,
    getRuntime: () => runtime,
    tob: () => tob,
    options,
  });
  const { humanAttention, humanAttentionDecisions } = activityFeature.createHumanAttention({
    startup,
    operationalDatabase,
    options,
    roster: () => roster,
    team,
    states,
    registry: () => registry,
    live: () => live,
  });
  const spaces = workspacesFeature.apply(operationalDatabase, dshHome, team);
  startup.enter('channel-live', 'initialize');
  live = channelsFeature.createLive({
    channels,
    registry,
    states,
    contentPurge,
    operationalDatabase,
    team,
  });
  team.onAccessChanged(() => live?.refreshAccess());
  startup.enter('messaging', 'reconcile-paused-invitations');
  if (operationalDatabase.mode === 'ready')
    for (const bot of registry.list())
      if (bot.paused === true) channels.cancelInvitationsForBot(bot.slug);
  startup.enter('session-ownership', 'initialize');
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  startup.enter('companion-feed', 'initialize');
  companions = appearanceFeature.createCompanion({
    options,
    dshHome,
    registry,
    states,
    operationalDatabase,
    channels,
  });
  startup.enter('memory', 'initialize');
  const memory = memoryFeature.apply({ registry, ownership, operationalDatabase, team, options });
  startup.enter('usage', 'initialize');
  usage = usageFeature.createUsage({ operationalDatabase, ownership, team, registry });
  startup.enter('workspace-grants', 'initialize');
  const grants = workspacesFeature.createGrants(operationalDatabase, spaces, options);
  startup.enter('tool-rules', 'initialize');
  const { toolRules, reconcileCreators } = approvalsFeature.createRules(
    operationalDatabase,
    externalMessaging,
  );
  reconcileToolRuleCreators = reconcileCreators;
  startup.enter('assignment-access', 'initialize');
  const assignmentAccess = createAssignmentAccessStore(
    attachOperationalModule(operationalDatabase, 'assignment-access'),
  );
  startup.enter('tob', 'initialize');
  const tob = tobFeature.apply({
    operationalDatabase,
    registry,
    channels,
    grants,
    dshHome,
    spaces,
    options,
  });
  startup.enter('bot-creation', 'initialize');
  const creations = personabotsFeature.apply({ operationalDatabase, registry, channels, options });
  startup.enter('bot-import', 'initialize');
  const zipImports = personabotsFeature.createZipImports({ dshHome, registry, creations, options });
  startup.enter('channel-management', 'initialize');
  const channelManagement = createChannelManagement({
    database: attachOperationalModule(operationalDatabase, 'channel-management'),
    channels,
    registry,
    isProtectedBot: (slug) => tob.isTob(slug),
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    onInvitation: (dmId, invitationId) => runtime?.admitGroupInvitation(dmId, invitationId),
    onJoinDecision: (dmId, requestId) => runtime?.admitGroupJoinDecision?.(dmId, requestId),
  });
  startup.enter('profile-recovery', 'initialize');
  const profileRecovery = profileStorage.createProfileRecovery(
    operationalDatabase,
    registry,
    ownership,
  );
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  const {
    hostTools,
    contributeBotAgentSetup,
    contributeEngineTools,
    engineTools,
    runBotAgentSetups,
  } = personabotsFeature.createAgentContributions();

  startup.enter('bot-schedules', 'initialize');
  const schedules = botSchedules.apply({
    operationalDatabase,
    registry,
    onAdmitted: (slug) => runtime?.admitScheduleFiring?.(slug),
    warn: options.warn,
  });
  startup.enter('message-perf', 'initialize');
  const messagePerf: MessagePerfTracker = createMessagePerfTracker();
  startup.enter('prompt-settings', 'initialize');
  const prompts = promptPresets.apply({ dshHome, registry, ownership });
  const { voiceProviders, voiceMessages, voiceSpeech, voiceZoom } = voice.apply(
    startup,
    operationalDatabase,
    registry,
    channels,
    attachments,
    options,
  );
  startup.enter('bot-runtime', 'initialize');
  runtime = personabotsFeature.createRuntime({
    options,
    modelPresets,
    team,
    voiceMessages,
    voiceZoom,
    prompts,
    tob,
    inboxHistory,
    messagePerf,
    registry,
    profileRecovery,
    schedules,
    assignmentLimits,
    botHopLimit,
    states,
    operationalDatabase,
    externalMessaging,
    sourcePolicy,
    channels,
    attachments,
    memory,
    ownership,
    grants,
    assignmentAccess,
    dshHome,
    orchestratorCwd,
    get runtime() {
      return runtime;
    },
  });
  startup.enter('bot-runtime', 'reconcile-memory');
  if (operationalDatabase.mode === 'ready') runtime.reconcileMemoryChangesOnStartup?.();
  startup.enter('bot-deletion', 'initialize');
  const deletions = personabotsFeature.createDeletions({
    channels,
    options,
    dshHome,
    operationalDatabase,
    registry,
    ownership,
    grants,
    toolRules,
    externalMessaging,
    runtime,
    spaces,
    live: () => live,
    contentPurge,
  });
  channelsFeature.reconcileGroupMembers(startup, { operationalDatabase, channels, registry });
  startup.enter('bot-onboarding', 'initialize');
  const { onboarding, acknowledgements } = personabotsFeature.createOnboarding(
    operationalDatabase,
    tob,
    registry,
    channels,
    startup,
  );
  startup.enter('bot-schedules', 'start');
  botSchedules.start(schedules, operationalDatabase);
  return {
    voiceProviders,
    voiceMessages,
    voiceSpeech,
    voiceZoom,
    prompts,
    deletions,
    profileRecovery,
    contentPurge,
    onboarding,
    acknowledgements,
    tob,
    creations,
    zipImports,
    channelManagement,
    partLibrary,
    rootDir,
    operationalDatabase,
    externalMessaging,
    registry,
    modelPresets,
    modelFavorites,
    routingGroups,
    fallbackOverrides,
    configureBotHopLimit: (read) => {
      const registration = { read };
      botHopLimits.push(registration);
      return () => {
        const index = botHopLimits.indexOf(registration);
        if (index !== -1) botHopLimits.splice(index, 1);
      };
    },
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
    contributeEngineTools,
    engineTools,
    runBotAgentSetups,
    hostTools,
    states,
    ownership,
    memory,
    ...(usage === undefined ? {} : { usage }),
    messagePerf,
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
    mediaVersions,
    live,
    team,
    spaces,
    currentRoots: (session, kind) =>
      currentRoots({ ownership, runtime, registry, grants }, session, kind),
    companions,
    roster,
    runtime,
  };
}
