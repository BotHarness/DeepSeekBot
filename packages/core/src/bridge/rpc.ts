import { toRemoteError } from '../kernel/rpc-result.js';
import { markRemoteMethods, markRemoteStreams } from './remote-descriptors.js';
import { TeamError, type TeamService } from '../team/service.js';
import { type HumanContext } from '../humans/context.js';
import type { AllBotPreview } from '../channels/all-bot-mention.js';
import type { Context } from '@deepseek-ai/cordis';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { PrivateInputs } from '../credentials/private-inputs.js';
import type { BridgeMethods } from './methods.js';
import { teamServiceRpc } from '../features/team/rpc.js';
import {
  personabotsRpcMethods,
  personaBotLifecycleRpc,
  personaBotManagementRpc,
  personaBotDeletionRpc,
  rosterSettingsRpc,
} from '../features/personabots/rpc.js';
import {
  activityRpcMethods,
  attentionRpc,
  humanAttentionDismissalRpc,
} from '../features/activity/rpc.js';
import {
  channelsRpcMethods,
  channelChangeRpc,
  channelManagementRpc,
  channelDeletionRpc,
  channelHistoryRpc,
  channelSendRpc,
} from '../features/channels/rpc.js';
import { sessionBotRpc } from '../features/sessions/session-bot-rpc.js';
import { channelFilesRpcMethods } from '../features/channel-files/rpc.js';
import { appearanceRpcMethods, botModeRpc } from '../features/appearance/rpc.js';
import {
  privateInputRpc,
  externalApprovalRpc,
  approvalTemplateReadRpc,
  approvalTemplateWriteRpc,
  approvalReviewerRpc,
  toolApprovalRpc,
} from '../features/approvals/rpc.js';
import {
  messagingRpcMethods,
  channelMessagingRpc,
  messagingPolicyRpc,
  messagingConnectionRpc,
} from '../features/messaging/rpc.js';
import { tobRpcMethods, directBotToolRpc } from '../features/tob/rpc.js';
import { modelsRpcMethods, modelConfigurationRpc } from '../features/models/rpc.js';
import {
  sessionsRpcMethods,
  botSessionRpc,
  sessionControlRpc,
  compactionSettingsRpc,
  sessionDetailsRpc,
  sessionListRpc,
  sessionOwnerRpc,
} from '../features/sessions/rpc.js';
import { zipImportRpc, marketplaceServiceRpc } from '../features/marketplace/rpc.js';
import { marketplaceSkillRpc } from '../features/marketplace/skill-rpc.js';
import { dataResetRpc, profileStorageRpc } from '../features/profile-storage/rpc.js';
import { voiceProviderRpc, voiceSettingsRpc } from '../features/voice/rpc.js';
import { avatarRpc } from '../features/avatars/rpc.js';
import { skillRpc } from '../features/skills/rpc.js';
import {
  assignmentsRpcMethods,
  assignmentRpc,
  assignmentAccessRpc,
} from '../features/assignments/rpc.js';
import { workspacesRpcMethods, workspaceGrantRpc } from '../features/workspaces/rpc.js';
import { memoryRpcMethods, memoryServiceRpc } from '../features/memory/rpc.js';
import { releaseRpc } from '../features/release/rpc.js';
import { takeoverRpc } from '../features/takeover/rpc.js';
import {
  featureContributions,
  mergeFeatureMethods,
  type RegisteredFeatures,
} from '../feature-contributions.js';
import { resolveInvocationHuman } from './invocation-human.js';
import type { BridgeLive } from './rpc-types.js';
export { resolveInvocationHuman } from './invocation-human.js';
export type { BridgeLive } from './rpc-types.js';

export const BRIDGE_NAMESPACE = 'botharness';
export const BRIDGE_SERVICE_KEY = 'botharnessBridge';

declare module '@deepseek-ai/dsh-typert-protocol/types' {
  interface RemoteErrorDetailsMap {
    'all-bot-preview-changed': { preview: AllBotPreview };
    'invalid-input': Record<string, never>;
    'connector-not-configured': Record<string, never>;
    'connector-unavailable': Record<string, never>;
    'session-input-not-pending': Record<string, never>;
    'invalid-slug': Record<string, never>;
    duplicate: Record<string, never>;
    'not-found': Record<string, never>;
    'storage-unavailable': Record<string, never>;
    'unknown-workspace': Record<string, never>;
    'unavailable-workspace': Record<string, never>;
    'invalid-grant': Record<string, never>;
    'invalid-git-url': Record<string, never>;
    'git-clone-failed': Record<string, never>;
    'git-clone-timeout': Record<string, never>;
    'marketplace-unavailable': Record<string, never>;
  }
}

export { SECRET_ROUTE_METHODS, secretRouteRefusal } from './secret-route.js';

export type InvocationBridgeMethods = (human: HumanContext) => BridgeMethods;

export class BotharnessBridgeService extends TypertRemoteService {
  private readonly invocationMethods: InvocationBridgeMethods;

  private invocationHuman(): HumanContext {
    const human = resolveInvocationHuman(
      this.ctx.invocation?.peer,
      this.ctx.get('connection'),
      this.team,
    );
    const invocation = this.ctx.invocation;
    if (invocation && this.team) {
      try {
        this.team.assertCall(invocation.peer.principal, invocation.request?.method ?? '');
      } catch (error) {
        if (error instanceof TeamError)
          throw toRemoteError({
            code: error.code,
            message: error.code,
            ...(error.details ? { details: error.details } : {}),
          });
        throw error;
      }
    }
    if (human === undefined)
      throw new RemoteError('forbidden' as RemoteError['code'], 'Authenticated Human required', {});
    return human;
  }

  private get methods(): BridgeMethods {
    return this.invocationMethods(this.invocationHuman());
  }

  constructor(
    ctx: Context,
    methods: InvocationBridgeMethods,
    private readonly privateInputs?: PrivateInputs,
    private readonly live?: BridgeLive,
    private readonly team?: TeamService,
  ) {
    super(ctx, BRIDGE_SERVICE_KEY, { namespace: BRIDGE_NAMESPACE });
    this.invocationMethods = methods;
  }
}

const legacyRpcMethods = {
  ...teamServiceRpc,
  followRoster: personabotsRpcMethods.followRoster,
  followActivity: activityRpcMethods.followActivity,
  channelJournalPage: channelsRpcMethods.channelJournalPage,
  channelFilesPage: channelFilesRpcMethods.channelFilesPage,
  ...channelChangeRpc,
  followCompanion: appearanceRpcMethods.followCompanion,
  ...privateInputRpc,
  ...channelMessagingRpc,
  ...externalApprovalRpc,
  ...messagingPolicyRpc,
  ...messagingConnectionRpc,
  tobHome: tobRpcMethods.tobHome,
  managementGrants: tobRpcMethods.managementGrants,
  managementGrantSet: tobRpcMethods.managementGrantSet,
  onboarding: personabotsRpcMethods.onboarding,
  onboardingModel: personabotsRpcMethods.onboardingModel,
  modelPlanInherit: modelsRpcMethods.modelPlanInherit,
  modelPlanReset: modelsRpcMethods.modelPlanReset,
  channelRetry: channelsRpcMethods.channelRetry,
  ...botSessionRpc,
  ...sessionControlRpc,
  ...modelConfigurationRpc,
  list: personabotsRpcMethods.list,
  activitySnapshot: activityRpcMethods.activitySnapshot,
  ...personaBotLifecycleRpc,
  ...zipImportRpc,
  ...personaBotManagementRpc,
  ...sessionBotRpc,
  ...dataResetRpc,
  ...personaBotDeletionRpc,
  ...approvalTemplateReadRpc,
  ...approvalTemplateWriteRpc,
  ...voiceProviderRpc,
  ...botModeRpc,
  ...voiceSettingsRpc,
  ...approvalReviewerRpc,
  ...compactionSettingsRpc,
  standingLimitsSet: personabotsRpcMethods.standingLimitsSet,
  ...avatarRpc,
  ...channelManagementRpc,
  composerValidate: channelsRpcMethods.composerValidate,
  ...channelDeletionRpc,
  ...profileStorageRpc,
  ...channelHistoryRpc,
  ...skillRpc,
  channelAllBotPreview: channelsRpcMethods.channelAllBotPreview,
  tobCli: tobRpcMethods.tobCli,
  ...channelSendRpc,
  ...attentionRpc,
  humanAssignmentContext: assignmentsRpcMethods.humanAssignmentContext,
  ...humanAttentionDismissalRpc,
  ...assignmentRpc,
  ...sessionDetailsRpc,
  workspaceOptions: workspacesRpcMethods.workspaceOptions,
  channelMediaTarget: messagingRpcMethods.channelMediaTarget,
  messageAttachmentTarget: channelFilesRpcMethods.messageAttachmentTarget,
  ...workspaceGrantRpc,
  ...assignmentAccessRpc,
  ...toolApprovalRpc,
  ...sessionListRpc,
  ...directBotToolRpc,
  sessionArchiveSet: sessionsRpcMethods.sessionArchiveSet,
  memoryMove: memoryRpcMethods.memoryMove,
  ...sessionOwnerRpc,
  ...memoryServiceRpc,
  profileActivity: activityRpcMethods.profileActivity,
  groupProfileActivity: activityRpcMethods.groupProfileActivity,
  ...rosterSettingsRpc,
  ...marketplaceServiceRpc,
  ...marketplaceSkillRpc,
  ...releaseRpc,
  ...takeoverRpc,
};

function contributedRpcMethods(features: RegisteredFeatures) {
  return mergeFeatureMethods(
    features.flatMap((feature) => ('rpc' in feature ? [feature.rpc] : [])),
  );
}

type PublicRpcMethods = Omit<
  typeof legacyRpcMethods & ReturnType<typeof contributedRpcMethods>,
  'requireApproval' | 'requirePrivateOwner'
>;

export interface BotharnessBridgeService extends PublicRpcMethods {}

const legacyRemoteMethods = [
  'botVisibility',
  'botVisibilitySet',
  'botSwitches',
  'reachableBots',
  'botProactiveOptOut',
  'roleConflicts',
  'memberPermissions',
  'speakerPolicy',
  'privateObjects',
  'privateContentOpen',
  'privateContentPage',
  'auditLog',
  'auditVerify',
  'spaces',
  'spaceAudienceDirectory',
  'spaceCreate',
  'spaceUpdate',
  'spaceDelete',
  'teamMode',
  'modelsAllowed',
  'usageByMember',
  'teamModeSet',
  'ownerPasswordSignIn',
  'ownerPasswordSignInSet',
  'teamOwnerPasswordSet',
  'teamInsecureHttpSet',
  'members',
  'memberCreate',
  'permissionCatalog',
  'roles',
  'roleCreate',
  'roleUpdate',
  'roleDelete',
  'memberRolesSet',
  'memberDevices',
  'memberDeviceRevoke',
  'ownerTransfer',
  'memberPasswordChange',
  'memberPasswordReset',
  'memberInvitation',
  'memberPairingOffer',
  'channelRoleDirectory',
  'channelVisibilitySet',
  'channelAdminsSet',
  'channelPolicySet',
  'channelHumanAdd',
  'channelMemberCandidates',
  'channelDescriptionSet',
  'teamDirectory',
  'humanDm',
  'humanDmByUsername',
  'memberDeactivate',
  'memberReactivate',
  'memberTransferPreview',
  'memberTransfer',
  'memberPurgePreview',
  'memberPurgeConfirm',
  'channelPublicSet',
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
  'questionRetry',
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
  'messagingGroupInteractions',
  'messagingAuthorize',
  'messagingRevoke',
  'messagingConversation',
  'messagingSend',
  'tobHome',
  'managementGrants',
  'managementGrantSet',
  'onboarding',
  'onboardingModel',
  'modelPlanInherit',
  'modelPlanReset',
  'channelRetry',
  'botNewSession',
  'botCompact',
  'botContext',
  'channelBotStop',
  'sessionStop',
  'sessionMessageSend',
  'botStop',
  'modelCatalog',
  'modelProviders',
  'modelProviderAdd',
  'modelProviderEdit',
  'modelProviderRemove',
  'engineAccounts',
  'engineAccountQuotaRefresh',
  'engineSelection',
  'engineAccountAdd',
  'engineAccountRename',
  'engineAccountRemove',
  'engineAccountLogin',
  'engineAccountLoginCancel',
  'engineAccountLoginStatus',
  'engineAccountSubmitCode',
  'modelFavoriteSet',
  'modelPresets',
  'modelPresetCreate',
  'modelPresetUpdate',
  'modelPresetSub',
  'modelPresetSubSet',
  'modelPresetDelete',
  'modelPresetApply',
  'modelGroups',
  'modelGroup',
  'modelGroupCreate',
  'modelGroupUpdate',
  'modelGroupDelete',
  'modelPlan',
  'modelPlanSub',
  'modelPlanSubSet',
  'modelPlanCustomize',
  'modelPlanAssignmentsSet',
  'modelPlanSet',
  'list',
  'activitySnapshot',
  'get',
  'create',
  'createLookup',
  'zipUploadBegin',
  'zipUploadChunk',
  'zipUploadPreview',
  'zipImportLookup',
  'zipImport',
  'botImportPreview',
  'botImportLookup',
  'createFromGit',
  'createFromSessions',
  'externalSessions',
  'update',
  'dataResetPreview',
  'dataResetConfirm',
  'deletionPreview',
  'deletionConfirm',
  'deletionRetry',
  'deletionMemoryFolder',
  'pause',
  'resume',
  'channels',
  'composerValidate',
  'channelDm',
  'channelGet',
  'channelCreate',
  'channelRename',
  'channelGroupAvatarSet',
  'channelGroupInvite',
  'channelGroupMemberPicker',
  'channelGroupMembersAdd',
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
  'storageUsage',
  'storageCleanupPreview',
  'storageCleanupConfirm',
  'storageMessagesCleanupPreview',
  'storageMessagesCleanupConfirm',
  'channelMessages',
  'channelTimeline',
  'channelReadPosition',
  'channelMarkRead',
  'channelMarkAllRead',
  'channelReact',
  'channelSearch',
  'messageSearch',
  'channelUnreadCounts',
  'channelAllBotPreview',
  'tobCli',
  'channelSkillCatalog',
  'sessionSkillCatalog',
  'botSkills',
  'skillShow',
  'botSkillRemove',
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
  'humanAttentionRestore',
  'humanAttentionDismissAll',
  'humanAttentionSnooze',
  'assignments',
  'channelAssignments',
  'assignment',
  'assignmentTimeline',
  'sessionSubagents',
  'sessionProgress',
  'sessionList',
  'sessionListChanges',
  'sessionCreate',
  'sessionAnswerApproval',
  'sessionAnswerQuestion',
  'sessionNativeStop',
  'sessionNativeArchive',
  'workspaceLook',
  'workspaceLookSet',
  'sessionTranscript',
  'sessionModel',
  'sessionLive',
  'sessionToolDetail',
  'workspaceOptions',
  'messageAttachmentTarget',
  'channelMediaTarget',
  'workspaceFileTarget',
  'folderBrowse',
  'folderCreate',
  'grants',
  'grantCreate',
  'grantRevoke',
  'grantWriteSet',
  'grantRequestApprove',
  'assignmentAccessGet',
  'assignmentAccessSet',
  'toolApprovalRules',
  'toolApprovalRuleRevoke',
  'toolApprovalHistory',
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
  'memoryImage',
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
  'overviewMemory',
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
  'approvalTemplates',
  'approvalTemplateCreate',
  'approvalTemplateUpdate',
  'approvalTemplateDeletePreview',
  'approvalTemplateDelete',
  'approvalTemplateGlobalSet',
  'botApprovalTemplateSet',
  'approvalReviewerModel',
  'approvalReviewerModelSet',
  'voiceProviders',
  'voiceCatalog',
  'voiceCatalogImport',
  'voiceProviderAdd',
  'voiceProviderTemplate',
  'voiceTemplateValidate',
  'voiceProviderTemplateSet',
  'voiceProviderRemove',
  'voiceProviderTest',
  'voiceSynthesize',
  'botVoiceSet',
  'voiceTranscribe',
  'botAsrSet',
  'voiceDefaultSet',
  'botModes',
  'botModeDefaultSet',
  'botModeSet',
  'botModeTemplateSave',
  'botModeTemplateDelete',
  'botModeTemplateSet',
  'voiceSpeechThresholdSet',
  'voiceDictation',
  'idleCompaction',
  'idleCompactionSet',
  'idleCompactionCacheLifetimeSet',
  'compactionThresholdSet',
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
  'marketplaceSections',
  'marketplaceDigests',
  'marketplaceDigest',
  'marketplaceAvatarList',
  'marketplaceAvatarTags',
  'marketplaceAvatarDetail',
  'marketplaceAvatarPublish',
  'marketplaceAvatarSource',
  'marketplaceAvatarMine',
  'marketplaceAvatarEdit',
  'marketplaceAvatarDelete',
  'marketplaceAvatarApplyCandidates',
  'marketplaceAvatarApply',
  'marketplaceDetail',
  'marketplaceFileView',
  'marketplaceChallenge',
  'marketplaceReport',
  'marketplaceAvatarReport',
  'marketplaceAccount',
  'marketplaceAuthorSave',
  'marketplaceAuthorAvatarSet',
  'marketplaceUploadPlan',
  'marketplaceUpload',
  'marketplaceInstallReview',
  'marketplaceMine',
  'marketplaceDelete',
  'shareDraftStart',
  'shareDraftGet',
  'shareDraftFile',
  'shareDraftDecide',
  'shareDraftFinish',
  'shareDraftDiscard',
  'shareDraftExport',
  'marketplaceInstall',
  'marketplaceSkillList',
  'marketplaceSkillDetail',
  'marketplaceSkillAddCandidates',
  'marketplaceSkillReview',
  'marketplaceSkillAdd',
  'releaseInfo',
  'releaseUpdate',
  'releaseInstall',
  'releaseRestart',
  'pluginUpdates',
  'pluginInstall',
  'pluginRestart',
  'updateRun',
  'updateCancel',
  'takeoverList',
  'takeoverStatus',
  'takeoverRequest',
  'takeoverComplete',
  'takeoverCancel',
  'channelJournalPage',
  'channelFilesPage',
  'channelChanges',
  'channelChangeCursor',
  'channelListChanges',
  'channelAccessState',
];
function installRemoteMethods(prototype: object, features: RegisteredFeatures): void {
  const contributions = contributedRpcMethods(features);
  const methods = mergeFeatureMethods([legacyRpcMethods, contributions]);
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(prototype, name, { configurable: true, writable: true, value: method });
  }
  markRemoteMethods(prototype, legacyRemoteMethods.concat(Object.keys(contributions)));
  markRemoteStreams(prototype, [
    'followRoster',
    'followActivity',
    'followChannel',
    'followCompanion',
  ]);
}

installRemoteMethods(BotharnessBridgeService.prototype, featureContributions);

export function registerBridge(
  ctx: Context,
  methods: InvocationBridgeMethods,
  privateInputs?: PrivateInputs,
  live?: BridgeLive,
  team?: TeamService,
  features: RegisteredFeatures = featureContributions,
): BotharnessBridgeService {
  if (features === featureContributions)
    return new BotharnessBridgeService(ctx, methods, privateInputs, live, team);
  class HostBridgeService extends BotharnessBridgeService {}
  installRemoteMethods(HostBridgeService.prototype, features);
  return new HostBridgeService(ctx, methods, privateInputs, live, team);
}
