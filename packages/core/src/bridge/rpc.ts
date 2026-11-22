import type { SessionModelState } from '@botharness/host-protocol/session-model';
import * as personabotsRpc from '../features/personabots/rpc.js';
import * as humansRpc from '../features/humans/rpc.js';
import * as teamRpc from '../features/team/rpc.js';
import * as cloudRpc from '../features/cloud/rpc.js';
import * as activityRpc from '../features/activity/rpc.js';
import * as messagingRpc from '../features/messaging/rpc.js';
import * as sessionsRpc from '../features/sessions/rpc.js';
import * as assignmentsRpc from '../features/assignments/rpc.js';
import * as memoryRpc from '../features/memory/rpc.js';
import * as approvalsRpc from '../features/approvals/rpc.js';
import * as workspacesRpc from '../features/workspaces/rpc.js';
import * as voiceRpc from '../features/voice/rpc.js';
import * as browserRpc from '../features/browser/rpc.js';
import * as computerRpc from '../features/computer/rpc.js';
import * as modelsRpc from '../features/models/rpc.js';
import * as marketplaceRpc from '../features/marketplace/rpc.js';
import * as genuiRpc from '../features/genui/rpc.js';
import * as avatarsRpc from '../features/avatars/rpc.js';
import * as skillsRpc from '../features/skills/rpc.js';
import * as schedulesRpc from '../features/schedules/rpc.js';
import * as promptsRpc from '../features/prompts/rpc.js';
import { toRemoteError, unwrapAsync, type AdminResult } from './rpc-result.js';
import type {
  MarketplaceAvatar,
  MarketplaceAvatarEdit,
  MarketplaceAvatarPage,
  MarketplaceAvatarRanking,
  MarketplaceAvatarTag,
  MarketplaceAvatarApplyCandidate,
} from '@botharness/host-protocol/marketplace-avatar';
import { markRemoteMethods, markRemoteStreams } from './remote-descriptors.js';
import type {
  ModelProvidersView,
  ModelProviderSave,
  ModelProviderRemoval,
} from '@botharness/host-client/model-providers';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import type { ApprovalTemplateDeletionPreview } from '../workspaces/approval-template-deletion-contract.js';
import type { TobCliCommand, TobCliStatus } from '../tob/cli-request.js';
import type {
  BotMetadata,
  BotMetadataResult,
  AdminDeletionPreview,
  AdminDeletion,
} from '../team/bot-administration.js';
import type { PrivateKind } from '../team/private-contract.js';
import type { SpaceAudience } from '../workspaces/spaces.js';
import type { ApprovalCard } from '../team/approval-contract.js';
import type { ChannelVisibility, ChannelPolicy } from '../team/channel-contract.js';
import { TeamError, type TeamService } from '../team/service.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { BotImportsService } from '../bots/imports.js';
import type { GenuiMessageReply, GenuiPrivateView, GenuiViewState } from '../channels/genui.js';
import type { GenuiDocumentState } from '../channels/genui-document.js';
import { isAuthenticatedOwner } from './owner-compat.js';
import type {
  VoiceProvidersView,
  VoiceSynthesisView,
  VoiceTranscriptionView,
} from '../voice/bridge.js';
import type { VoiceDictationReadiness, VoiceDictationView } from '../voice/dictation.js';
import type {
  ProviderHealth,
  VoiceDefaults,
  VoiceProviderView,
  VoiceSpeechThreshold,
} from '../voice/providers.js';
import type { PersonaBotAsr, PersonaBotVoice } from '../bots/persona-bot.js';
import type { CloudManagementInput, CloudManagementResult } from '../cloud/management.js';
import type { ChannelManagementResult } from '../channels/management.js';
import type { BotCreationReceipt } from '../bots/creation.js';
import type { BotZipUploadStatus } from '../bots/zip-upload.js';
import type { BotZipPreview } from '../bots/zip-import.js';
import type { TurnTrace } from '../bots/tool-trace.js';
import type { AssignmentTimelineLane } from '../runtime/assignment-timeline.js';
import type { SessionTranscript } from '../runtime/session-transcript.js';
import type { SessionLiveSnapshot } from '../runtime/session-live.js';
import type { SessionToolDetail } from '../runtime/session-tool-detail.js';
import type { SessionRootRole } from '../sessions/ownership.js';
import type { PartLibraryEntry } from '../bots/part-library.js';
import type { OnboardingSnapshot, TutorialAction } from '../onboarding/service.js';
import type { HttpsFallback } from '../memory/clone.js';
import type { PairingRequest, PairingReviewInput } from '../messaging/pairing.js';
import type { SenderAccessInput } from '../messaging/sender-access.js';
import type {
  ChannelHistoryItem,
  GroupDisbandResult,
  PurgeSource,
  PurgePreview,
  TextCleanupPreview,
  TextCleanupResult,
} from '../purge/contracts.js';
import type {
  MediaCleanupPreview,
  MediaCleanupResult,
  StorageMediaKind,
  StorageUsage,
} from '../storage/media-cleanup.js';
import type { GroupMemberWakePolicy } from '../channels/channel.js';
import { LiveRefused } from '../channels/live-frames.js';
import type {
  ChannelFilesPage,
  ChannelFilesRequest,
  ChannelChangeCursor,
  ChannelChanges,
  ChannelChangesRequest,
  ChannelJournalPage,
  ChannelJournalRequest,
} from '../channels/timeline.js';
import type { CompanionLiveFrame } from '../companions/live.js';
import type { CloudWork, CloudWorkInput } from '../cloud/work.js';
import {
  ChannelLiveRefused,
  LiveUnavailable,
  type ActivityLiveFrame,
  type ChannelLiveFrame,
  type DraftDelivery,
  type RosterLiveFrame,
} from '../channels/live.js';
import type { AllBotPreview, AllBotMention } from '../channels/all-bot-mention.js';
import type {
  MessagingDefaults,
  MessagingDefaultsInput,
  MessagingDefaultsPlatform,
} from '../messaging/defaults.js';
import type { MessagingIdentity, MessagingIdentityInput } from '../messaging/identity.js';
import type { MessagingConversationInput } from '../messaging/conversations.js';
import type { ChannelBridgeInput, ChannelBridgeSnapshot } from '../messaging/channel-bridge.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../messaging/conversation-ingest.js';
import type { UsageOverviewPeriod } from '../usage/overview.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceAuthorAccount,
  MarketplaceDetail,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplaceInstallSource,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceSection,
  MarketplaceTopic,
} from '../marketplace/client.js';
import type { AltchaChallenge } from '../marketplace/altcha.js';
import type { MarketplaceAccount, UploadPlan } from '../marketplace/uploaded-bots.js';
import type { InstallReviewResult } from '../marketplace/install-review.js';
import type { ShareDraftView } from '../marketplace/share-draft.js';
import type { MarketplaceLanguage } from '../marketplace/language.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseRestart,
  ReleaseUpdate,
} from '../release/service.js';
import type { PluginInstall, PluginRestart, PluginUpdates } from '../release/plugins.js';
import type { UpdateCancel, UpdateRun } from '../release/update-runs.js';
import type { TelemetryStatus } from '../telemetry/service.js';
import type { OverviewMemory } from '../memory/overview.js';
import type {
  ApprovalReviewerModelView,
  BotPromptView,
  IdleCompactionView,
  OverviewUsage,
  PromptLimitView,
  PromptPartView,
} from './methods.js';
import type { PromptPreset } from '../prompts/prompt-presets.js';
import type { ManualCompactionResult } from '../runtime/idle-compaction.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { HumanAssignmentContext } from '../runtime/assignment-human-context.js';
import type { ThreadReceptionInput } from '../messaging/thread-policy.js';
import type { GroupReceptionInput } from '../messaging/group-policy.js';
import type { ExternalSource } from '../messaging/inbound.js';
import type {
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
  MessagingReadMode,
} from '../messaging/outbound.js';
import type { MessagingTarget } from '../messaging/provider.js';
import type { PersonaBotDeletionPreview, PersonaBotDeletion } from '../bots/deletion.js';
import type { DataResetPreview, DataResetResult } from '../data-reset/reset.js';
import type { MemoryFileTarget } from '../memory/file-actions.js';
import type { Context } from '@deepseek-ai/cordis';
import type { UsageFilter, UsageQueryResult } from '../usage/query.js';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { PrivateInputs } from '../credentials/private-inputs.js';
import type { PrivateAccountSummary, PrivateInputStatus } from '../credentials/contracts.js';
import type { PersonaBotPatch } from '../bots/persona-bot.js';
import type { ModelCatalogEntry } from '../models/catalog.js';
import type { ModelFavorite } from '../models/favorites.js';
import type { ModelPlanState } from '../models/readiness.js';
import type {
  AssignmentGroupOption,
  AssignmentModelOption,
  ModelPreset,
  ModelPresetUsage,
  ModelPresetEngine,
  PresetSub,
  ModelRoute,
  PersonaBotModelPlan,
} from '../models/presets.js';
import type { RoutingGroup, RoutingGroupMember } from '../models/routing-groups.js';
import type {
  BridgeMethods,
  ChannelListItem,
  ChannelListChanges,
  MessagingAppsView,
  PersonaBotDetail,
  ApprovalTemplateEntry,
  PersonaBotSummary,
  SharedBotSummary,
  OwnedSessionSummary,
  OwnedSessionBot,
  ProfileActivity,
  ProfileSessionUsage,
  SkillDetail,
  SessionProgressEntry,
} from './methods.js';
import type { ChannelActivityToday } from '../channels/activity-today.js';
import type { GroupProfileActivity } from '../channels/profile-activity.js';
import type {
  ChannelMessage,
  ChannelReaction,
  ChannelRecord,
  ChannelSkillInvocationToken,
} from '../channels/channel.js';
import type { SkillCatalogEntry } from '../skills/catalog.js';
import type { BotSkill } from '../skills/bot-skills.js';
import type { ChannelSendStatus, HumanMessageSearchPage } from '../channels/store.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelReadPosition } from '../channels/store.js';
import type { RosterSection, RosterSnapshot } from '../roster/store.js';
import type { TopOrderEntry } from '../roster/spec.js';
import type { ChannelTimelinePage, TimelineDirection } from '../channels/timeline.js';
import type {
  AssignmentDetail,
  AssignmentActivity,
  AssignmentSummary,
  ChannelAssignmentSummary,
  DirectBotToolSpec,
} from '../runtime/bot-runtime.js';
import type { BotAttentionPage, BotAttentionState } from '../runtime/attention.js';
import type { TakeoverHandoff } from '../takeover/contracts.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../schedules/bot-schedules.js';
import type { BotSourcePolicy } from '../runtime/source-policy.js';
import type {
  HumanAttentionCategory,
  HumanAttentionPage,
  HumanAttentionStatus,
} from '../runtime/human-attention.js';
import type {
  MemoryAcceptedCommit,
  MemoryAcceptedSnapshot,
  MemoryGitGraph,
  MemoryVersion,
  MemoryVersionName,
  MemoryGitCommitDiff,
  MemoryWorkingChange,
  MemoryWorkingDiff,
  MemoryWorkingKind,
  MemoryRepairEvent,
} from '../memory/accepted.js';
import type { GitStatus } from '../memory/managed-git.js';
import type { MemoryRecoveryCheckpoint } from '../memory/recovery.js';
import type { WorkspaceGrant } from '../workspaces/grants.js';
import type { FolderListing } from '../workspaces/folder-browse.js';
import type { ToolApprovalRule } from '../workspaces/tool-approval-rules.js';
import type { ToolApprovalHistoryEntry } from '../channels/approval-history.js';
import type {
  AssignmentAccessPreset,
  AssignmentAccessMode,
} from '../workspaces/assignment-access.js';
import * as tobAdaptersRpc from '../features/tob/rpc.js';
import * as usageAdaptersRpc from '../features/usage/rpc.js';
import * as takeoverAdaptersRpc from '../features/takeover/rpc.js';
import * as appearanceAdaptersRpc from '../features/appearance/rpc.js';
import * as releaseAdaptersRpc from '../features/release/rpc.js';
import * as diagnosticsAdaptersRpc from '../features/diagnostics/rpc.js';
import * as profileStorageAdaptersRpc from '../features/profile-storage/rpc.js';
import * as channelFilesAdaptersRpc from '../features/channel-files/rpc.js';
import * as channelsAdaptersRpc from '../features/channels/rpc.js';
import type { BotModesView } from '../features/appearance/methods.js';

export const BRIDGE_NAMESPACE = 'botharness';
export const BRIDGE_SERVICE_KEY = 'botharnessBridge';

declare module '@deepseek-ai/dsh-typert-protocol/types' {
  interface RemoteErrorDetailsMap {
    'all-bot-preview-changed': { preview: AllBotPreview };
    'invalid-input': Record<string, never>;
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

export interface BridgeLive {
  followRoster(human: HumanContext, signal: AbortSignal): AsyncIterable<RosterLiveFrame>;
  followActivity(human: HumanContext, signal: AbortSignal): AsyncIterable<ActivityLiveFrame>;
  followChannel(
    human: HumanContext,
    channelId: string,
    limit: number,
    signal: AbortSignal,
    drafts?: DraftDelivery,
  ): AsyncIterable<ChannelLiveFrame>;
  journalPage(
    human: HumanContext,
    channelId: string,
    request: ChannelJournalRequest,
  ): ChannelJournalPage | undefined;
  filesPage(
    human: HumanContext,
    channelId: string,
    request: ChannelFilesRequest,
  ): ChannelFilesPage | undefined;
  changes(
    human: HumanContext,
    channelId: string,
    request: ChannelChangesRequest,
  ): ChannelChanges | undefined;
  changeCursor(human: HumanContext): ChannelChangeCursor | undefined;
  followCompanion(
    human: HumanContext,
    resume: string,
    lastEventId: string,
    signal: AbortSignal,
  ): AsyncIterable<CompanionLiveFrame>;
}

export function resolveInvocationHuman(
  peer: unknown,
  connection: unknown,
  team?: TeamService,
): HumanContext | undefined {
  if (isAuthenticatedOwner(peer, connection)) return team?.ownerContext() ?? OWNER_HUMAN_CONTEXT;
  if (peer !== null && typeof peer === 'object' && 'principal' in peer) {
    const principal = peer.principal;
    if (
      principal !== null &&
      typeof principal === 'object' &&
      'kind' in principal &&
      principal.kind === 'botharness-member' &&
      'humanId' in principal &&
      typeof principal.humanId === 'string' &&
      'grantId' in principal &&
      typeof principal.grantId === 'string'
    )
      return team?.resolve({
        kind: 'botharness-member',
        humanId: principal.humanId,
        grantId: principal.grantId,
      });
  }
  return undefined;
}

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

  spaceAudienceDirectory() {
    return teamRpc.spaceAudienceDirectory(this.methods);
  }
  spaces() {
    return teamRpc.spaces(this.methods);
  }
  botVisibility(slug: string) {
    return teamRpc.botVisibility(this.methods, slug);
  }
  botVisibilitySet(
    slug: string,
    visibility: import('../team/bot-contract.js').BotVisibility,
    confirm?: boolean,
  ) {
    return teamRpc.botVisibilitySet(this.methods, slug, visibility, confirm);
  }
  botSwitches(
    slug: string,
    proactiveDms?: boolean,
    joinPrincipalChannels?: boolean,
    speakerContext?: boolean,
  ) {
    return teamRpc.botSwitches(
      this.methods,
      slug,
      proactiveDms,
      joinPrincipalChannels,
      speakerContext,
    );
  }
  reachableBots() {
    return teamRpc.reachableBots(this.methods);
  }
  botProactiveOptOut(slug: string, optOut: boolean) {
    return teamRpc.botProactiveOptOut(this.methods, slug, optOut);
  }
  roleConflicts(humanId?: string, username?: string) {
    return teamRpc.roleConflicts(this.methods, humanId, username);
  }
  speakerPolicy(humanId?: string, topic?: string) {
    return teamRpc.speakerPolicy(this.methods, humanId, topic);
  }
  spaceCreate(name: string, audience: SpaceAudience) {
    return teamRpc.spaceCreate(this.methods, name, audience);
  }
  spaceUpdate(spaceId: string, name?: string, audience?: SpaceAudience) {
    return teamRpc.spaceUpdate(this.methods, spaceId, name, audience);
  }
  spaceDelete(spaceId: string, confirm: boolean) {
    return teamRpc.spaceDelete(this.methods, spaceId, confirm);
  }
  modelsAllowed() {
    return teamRpc.modelsAllowed(this.methods);
  }
  usageByMember(period: UsageOverviewPeriod) {
    return teamRpc.usageByMember(this.methods, period);
  }
  privateObjects(humanId?: string, kind?: PrivateKind, username?: string) {
    return teamRpc.privateObjects(this.methods, humanId, kind, username);
  }
  privateContentOpen(kind: PrivateKind, objectId: string, reason?: string) {
    return teamRpc.privateContentOpen(this.methods, kind, objectId, reason);
  }
  privateContentPage(viewId: string, before: string) {
    return teamRpc.privateContentPage(this.methods, viewId, before);
  }
  auditLog(after?: string, limit?: number) {
    return teamRpc.auditLog(this.methods, after, limit);
  }
  auditVerify() {
    return teamRpc.auditVerify(this.methods);
  }
  teamMode() {
    return teamRpc.teamMode(this.methods);
  }
  teamModeSet(enabled: boolean) {
    return teamRpc.teamModeSet(this.methods, enabled);
  }
  teamOwnerPasswordSet(password: string, current?: string) {
    return teamRpc.teamOwnerPasswordSet(this.methods, password, current);
  }
  teamInsecureHttpSet(allowed: boolean) {
    return teamRpc.teamInsecureHttpSet(this.methods, allowed);
  }
  members() {
    return teamRpc.members(this.methods);
  }
  memberCreate(username: string, displayName: string, roleIds?: string[]) {
    return teamRpc.memberCreate(this.methods, username, displayName, roleIds);
  }
  permissionCatalog() {
    return teamRpc.permissionCatalog(this.methods);
  }
  roles() {
    return teamRpc.roles(this.methods);
  }
  roleCreate(
    name: string,
    permissions: string[],
    models?: import('../team/permissions.js').RoleModels,
    policy?: import('../team/bot-contract.js').RolePolicy,
  ) {
    return teamRpc.roleCreate(this.methods, name, permissions, models, policy);
  }
  roleUpdate(
    roleId: string,
    name?: string,
    permissions?: string[],
    models?: import('../team/permissions.js').RoleModels,
    policy?: import('../team/bot-contract.js').RolePolicy,
  ) {
    return teamRpc.roleUpdate(this.methods, roleId, name, permissions, models, policy);
  }
  roleDelete(roleId: string) {
    return teamRpc.roleDelete(this.methods, roleId);
  }
  memberRolesSet(humanId: string, roleIds: string[]) {
    return teamRpc.memberRolesSet(this.methods, humanId, roleIds);
  }
  memberDevices(humanId: string) {
    return teamRpc.memberDevices(() => this.methods, this.ctx, humanId);
  }
  memberDeviceRevoke(humanId: string, grantId: string) {
    return teamRpc.memberDeviceRevoke(this.methods, humanId, grantId);
  }
  ownerTransfer(humanId: string, password: string) {
    return teamRpc.ownerTransfer(this.methods, humanId, password);
  }
  memberPasswordChange(current: string, next: string, signOutOthers?: boolean) {
    return teamRpc.memberPasswordChange(
      () => this.methods,
      this.ctx,
      this.team,
      current,
      next,
      signOutOthers,
    );
  }
  memberInvitation(humanId: string) {
    return teamRpc.memberInvitation(this.methods, humanId);
  }
  memberPairingOffer() {
    return teamRpc.memberPairingOffer(this.methods);
  }
  memberPasswordReset(humanId: string) {
    return teamRpc.memberPasswordReset(this.methods, humanId);
  }
  channelRoleDirectory(channelId: string) {
    return teamRpc.channelRoleDirectory(this.methods, channelId);
  }
  channelVisibilitySet(channelId: string, visibility: ChannelVisibility) {
    return teamRpc.channelVisibilitySet(this.methods, channelId, visibility);
  }
  channelAdminsSet(channelId: string, humanIds: string[]) {
    return teamRpc.channelAdminsSet(this.methods, channelId, humanIds);
  }
  channelPolicySet(channelId: string, policy: ChannelPolicy, expectedRevision?: string) {
    return teamRpc.channelPolicySet(this.methods, channelId, policy, expectedRevision);
  }
  channelMemberCandidates(channelId: string, query?: string) {
    return teamRpc.channelMemberCandidates(this.methods, channelId, query);
  }
  channelHumanAdd(channelId: string, humanId: string) {
    return teamRpc.channelHumanAdd(this.methods, channelId, humanId);
  }
  channelDescriptionSet(channelId: string, description: string) {
    return teamRpc.channelDescriptionSet(this.methods, channelId, description);
  }
  teamDirectory() {
    return teamRpc.teamDirectory(this.methods);
  }
  humanDm(humanId: string) {
    return teamRpc.humanDm(this.methods, humanId);
  }
  humanDmByUsername(username: string) {
    return teamRpc.humanDmByUsername(this.methods, username);
  }
  memberDeactivate(humanId: string) {
    return teamRpc.memberDeactivate(this.methods, humanId);
  }
  memberReactivate(humanId: string) {
    return teamRpc.memberReactivate(this.methods, humanId);
  }
  memberTransferPreview(humanId: string) {
    return teamRpc.memberTransferPreview(this.methods, humanId);
  }
  memberTransfer(humanId: string, toHumanId: string) {
    return teamRpc.memberTransfer(this.methods, humanId, toHumanId);
  }
  memberPurgePreview(humanId: string) {
    return teamRpc.memberPurgePreview(this.methods, humanId);
  }
  memberPurgeConfirm(humanId: string, token: string, username: string) {
    return teamRpc.memberPurgeConfirm(this.methods, humanId, token, username);
  }
  channelPublicSet(channelId: string, publicValue: boolean) {
    return teamRpc.channelPublicSet(this.methods, channelId, publicValue);
  }

  followRoster(signal: AbortSignal): AsyncIterable<RosterLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    return this.live.followRoster(this.invocationHuman(), signal);
  }

  async *followActivity(signal: AbortSignal): AsyncGenerator<ActivityLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    try {
      const human = this.invocationHuman();
      for await (const frame of this.live.followActivity(human, signal))
        yield this.team?.approvals.project(human, frame) ?? frame;
    } catch (error) {
      if (error instanceof LiveUnavailable)
        throw toRemoteError({ code: 'unavailable', message: error.message });
      throw error;
    }
  }

  channelJournalPage(
    channelId: string,
    through: number,
    before?: number,
    limit?: number,
  ): ChannelJournalPage {
    return channelsAdaptersRpc.channelJournalPage(
      this.live,
      () => this.invocationHuman(),
      this.team,
      channelId,
      through,
      before,
      limit,
    );
  }

  channelFilesPage(channelId: string, before?: number, limit?: number): ChannelFilesPage {
    return channelFilesAdaptersRpc.channelFilesPage(
      this.live,
      () => this.invocationHuman(),
      this.team,
      channelId,
      before,
      limit,
    );
  }

  channelChanges(
    channelId: string,
    sinceSeq: number,
    epoch?: string,
    limit?: number,
  ): ChannelChanges {
    return channelsAdaptersRpc.channelChanges(
      this.live,
      () => this.invocationHuman(),
      this.team,
      channelId,
      sinceSeq,
      epoch,
      limit,
    );
  }

  channelChangeCursor(): ChannelChangeCursor {
    return channelsAdaptersRpc.channelChangeCursor(this.live, () => this.invocationHuman());
  }

  async *followChannel(
    channelId: string,
    limit: number,
    drafts: DraftDelivery | undefined,
    signal: AbortSignal,
  ): AsyncGenerator<ChannelLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    try {
      const human = this.invocationHuman();
      for await (const frame of this.live.followChannel(
        human,
        channelId,
        limit,
        signal,
        drafts ?? 'full',
      ))
        yield this.team?.approvals.project(human, frame, channelId) ?? frame;
    } catch (error) {
      if (error instanceof ChannelLiveRefused)
        throw toRemoteError({ code: error.code, message: error.message });
      throw error;
    }
  }

  async *followCompanion(
    resume: string,
    lastEventId: string,
    signal: AbortSignal,
  ): AsyncGenerator<CompanionLiveFrame> {
    if (this.live === undefined)
      throw toRemoteError({
        code: 'unavailable',
        message: 'Live stream is unavailable',
      });
    try {
      yield* this.live.followCompanion(this.invocationHuman(), resume, lastEventId, signal);
    } catch (error) {
      if (error instanceof LiveRefused)
        throw toRemoteError({ code: error.code, message: error.message });
      throw error;
    }
  }

  private requireApproval(channelId: string, messageId: string): HumanContext {
    if (!this.team) this.requirePrivateOwner();
    const human = this.invocationHuman();
    try {
      this.team?.approvals.requireRequest(human, channelId, messageId);
    } catch (error) {
      if (error instanceof TeamError)
        throw toRemoteError({
          code: error.code,
          message: error.code,
          ...(error.details ? { details: error.details } : {}),
        });
      throw error;
    }
    return human;
  }

  privateInputStatus(
    channelId: string,
    messageId: string,
  ): { status: PrivateInputStatus; approval?: ApprovalCard } {
    if (!this.team) this.requirePrivateOwner();
    const human = this.invocationHuman();
    if (
      this.team &&
      !this.team.belongs(human, channelId) &&
      !this.team.approvals.ownsRequest(human, channelId, messageId)
    )
      throw toRemoteError({ code: 'channel-not-found', message: 'channel-not-found' });
    const message = this.team?.approvals.request(channelId, messageId);
    const approval = message && this.team?.approvals.card(human, channelId, message);
    return {
      status: this.privateInputs?.status(channelId, messageId) ?? 'expired',
      ...(approval ? { approval } : {}),
    };
  }

  async privateInputSubmit(
    channelId: string,
    messageId: string,
    values: Record<string, string>,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const human = this.requireApproval(channelId, messageId);
    if (this.privateInputs === undefined) return { accepted: false, reason: 'store-unavailable' };
    return await this.privateInputs.submission(true, { channelId, messageId, values }, human);
  }

  async privateInputCancel(channelId: string, messageId: string): Promise<{ accepted: boolean }> {
    const human = this.requireApproval(channelId, messageId);
    return {
      accepted: (await this.privateInputs?.cancel(true, channelId, messageId, human)) ?? false,
    };
  }

  async privateAccountStatus(channelId: string, messageId: string) {
    this.requirePrivateOwner();
    return (
      this.privateInputs?.accountStatus(true, channelId, messageId) ?? {
        status: 'unavailable',
        references: {},
      }
    );
  }

  async privateInputReplace(channelId: string, messageId: string): Promise<{ messageId?: string }> {
    this.requirePrivateOwner();
    const replacement = await this.privateInputs?.replace(true, channelId, messageId);
    return replacement === undefined ? {} : { messageId: replacement };
  }

  async privateAccounts(slug: string): Promise<{
    status: 'ready' | 'unavailable';
    accounts: PrivateAccountSummary[];
    replaceable: boolean;
    mcpServers: ReturnType<NonNullable<PrivateInputs['mcpServers']>['list']>;
  }> {
    this.requirePrivateOwner();
    const accounts =
      typeof slug === 'string' ? await this.privateInputs?.accounts(true, slug) : undefined;
    const replaceable = (await this.privateInputs?.replaceable().catch(() => false)) ?? false;
    const mcpServers =
      typeof slug === 'string' ? (this.privateInputs?.mcpServers?.list(slug) ?? []) : [];
    return accounts === undefined
      ? { status: 'unavailable', accounts: [], replaceable: false, mcpServers }
      : { status: 'ready', accounts, replaceable, mcpServers };
  }

  async privateMcpServerEnable(
    slug: string,
    serverName: string,
    enabled: boolean,
  ): Promise<{ accepted: boolean }> {
    this.requirePrivateOwner();
    return {
      accepted:
        typeof slug === 'string' && typeof serverName === 'string' && typeof enabled === 'boolean'
          ? ((await this.privateInputs?.mcpServers?.setEnabled(slug, serverName, enabled)) ?? false)
          : false,
    };
  }

  async privateMcpServerRemove(slug: string, serverName: string): Promise<{ removed: boolean }> {
    this.requirePrivateOwner();
    return {
      removed:
        typeof slug === 'string' && typeof serverName === 'string'
          ? ((await this.privateInputs?.mcpServers?.remove(slug, serverName)) ?? false)
          : false,
    };
  }

  async privateAccountRevoke(channelId: string, messageId: string) {
    this.requirePrivateOwner();
    return (
      this.privateInputs?.revoke(true, channelId, messageId, this.invocationHuman()) ?? {
        accepted: false,
        stopped: 0,
        completed: 0,
        uncertain: 0,
      }
    );
  }

  private requirePrivateOwner(message = 'Private input requires the authenticated Owner'): void {
    if (resolveInvocationHuman(this.ctx.invocation?.peer, this.ctx.get('connection')) === undefined)
      throw new RemoteError('forbidden' as RemoteError['code'], message, {});
  }

  messagingChannelTarget(
    slug: string,
    grantId: string,
    channelId: string | null,
  ): Promise<{ updated: true }> {
    return messagingRpc.messagingChannelTarget(this.methods, slug, grantId, channelId);
  }
  messagingThreadPolicy(
    slug: string,
    sourceEventId: string,
    policy: ThreadReceptionInput,
  ): Promise<{ updated: true }> {
    return messagingRpc.messagingThreadPolicy(this.methods, slug, sourceEventId, policy);
  }
  messagingGroupPolicy(
    slug: string,
    grantId: string,
    policy: GroupReceptionInput,
  ): Promise<{ updated: true }> {
    return messagingRpc.messagingGroupPolicy(this.methods, slug, grantId, policy);
  }
  messagingDefaults(platform?: MessagingDefaultsPlatform): Promise<MessagingDefaults> {
    return messagingRpc.messagingDefaults(this.methods, platform);
  }
  messagingDefaultsSet(input: MessagingDefaultsInput): Promise<MessagingDefaults> {
    return messagingRpc.messagingDefaultsSet(this.methods, input);
  }
  channelBridges(channelId: string, mode?: MessagingReadMode): Promise<ChannelBridgeSnapshot> {
    return messagingRpc.channelBridges(this.methods, channelId, mode);
  }
  channelIngests(channelId: string): Promise<ConversationIngestSnapshot> {
    return messagingRpc.channelIngests(this.methods, channelId);
  }
  channelIngest(channelId: string, input: ConversationIngestInput): Promise<{ updated: true }> {
    return messagingRpc.channelIngest(this.methods, channelId, input);
  }
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<{ updated: true }> {
    return messagingRpc.channelBridge(this.methods, channelId, input);
  }
  messagingReceive(slug: string, grantId: string, enabled: boolean): Promise<{ updated: true }> {
    return messagingRpc.messagingReceive(this.methods, slug, grantId, enabled);
  }
  messagingSource(slug: string, sourceEventId: string): Promise<{ source: ExternalSource }> {
    return messagingRpc.messagingSource(this.methods, slug, sourceEventId);
  }
  approvalRoute(
    slug: string,
    pairingId: string | null,
    expectedRevision: number,
  ): Promise<{ updated: true }> {
    return approvalsRpc.approvalRoute(this.methods, slug, pairingId, expectedRevision);
  }
  approvalTest(slug: string): Promise<{
    delivery: import('../messaging/approval-messaging.js').ApprovalDelivery;
  }> {
    return approvalsRpc.approvalTest(this.methods, slug);
  }
  questionRetry(slug: string, id: string): Promise<{ updated: true }> {
    return approvalsRpc.questionRetry(this.methods, slug, id);
  }
  approvalRetry(
    slug: string,
    id: string,
  ): Promise<{
    delivery: import('../messaging/approval-messaging.js').ApprovalDelivery;
  }> {
    return approvalsRpc.approvalRetry(this.methods, slug, id);
  }
  failureAlertsSet(
    slug: string,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<{ updated: true }> {
    return messagingRpc.failureAlertsSet(this.methods, slug, enabled, expectedRevision);
  }
  failureAlertsTest(slug: string): Promise<{
    delivery: import('../messaging/failure-alerts.js').FailureAlertDelivery;
  }> {
    return messagingRpc.failureAlertsTest(this.methods, slug);
  }
  failureAlertsRetry(
    slug: string,
    id: string,
  ): Promise<{
    delivery: import('../messaging/failure-alerts.js').FailureAlertDelivery;
  }> {
    return messagingRpc.failureAlertsRetry(this.methods, slug, id);
  }
  pairingReview(slug: string, input: PairingReviewInput): Promise<{ pairing: PairingRequest }> {
    return messagingRpc.pairingReview(this.methods, slug, input);
  }
  senderAccess(slug: string, input: SenderAccessInput): Promise<void> {
    return messagingRpc.senderAccess(this.methods, slug, input);
  }
  messagingIdentity(
    slug: string,
    input: MessagingIdentityInput,
  ): Promise<{ identity: MessagingIdentity }> {
    return messagingRpc.messagingIdentity(this.methods, slug, input);
  }
  cloudConnections(input: CloudManagementInput): Promise<CloudManagementResult> {
    return cloudRpc.cloudConnections(this.methods, input);
  }
  cloudWork(slug: string, input: CloudWorkInput): Promise<Awaited<ReturnType<CloudWork['run']>>> {
    return cloudRpc.cloudWork(this.methods, slug, input);
  }
  messagingApps(): Promise<MessagingAppsView> {
    return messagingRpc.messagingApps(this.methods);
  }
  messagingSnapshot(slug: string, mode?: MessagingReadMode): Promise<MessagingSnapshot> {
    return messagingRpc.messagingSnapshot(this.methods, slug, mode);
  }
  messagingReachable(
    slug: string,
    bindingId: string,
    cursor?: string,
  ): Promise<import('../messaging/provider.js').MessagingReachablePage> {
    return messagingRpc.messagingReachable(this.methods, slug, bindingId, cursor);
  }
  messagingPostRequest(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent | null }> {
    return messagingRpc.messagingPostRequest(
      this.methods,
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    );
  }
  messagingPostConversation(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent }> {
    return messagingRpc.messagingPostConversation(
      this.methods,
      slug,
      bindingId,
      conversationId,
      requestId,
      text,
    );
  }
  messagingPostLimit(
    slug: string,
    bindingId: string,
    expectedRevision: number,
    limit: number | null,
  ): Promise<{ identity: MessagingIdentity }> {
    return messagingRpc.messagingPostLimit(this.methods, slug, bindingId, expectedRevision, limit);
  }
  messagingTargets(
    providerId: string,
    accountRef: string,
  ): Promise<{ targets: MessagingTarget[] }> {
    return messagingRpc.messagingTargets(this.methods, providerId, accountRef);
  }
  messagingAuthorize(
    botSlug: string,
    providerId: string,
    accountRef: string,
    targetRef: string,
    fingerprint: string,
    targetDigest: string,
  ): Promise<{ grant: MessagingGrant }> {
    return messagingRpc.messagingAuthorize(
      this.methods,
      botSlug,
      providerId,
      accountRef,
      targetRef,
      fingerprint,
      targetDigest,
    );
  }
  messagingRevoke(slug: string, grantId: string): Promise<{ revoked: true }> {
    return messagingRpc.messagingRevoke(this.methods, slug, grantId);
  }
  messagingConversation(
    slug: string,
    input: MessagingConversationInput,
  ): Promise<{ updated: true }> {
    return messagingRpc.messagingConversation(this.methods, slug, input);
  }
  messagingSend(
    slug: string,
    grantId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent }> {
    return messagingRpc.messagingSend(this.methods, slug, grantId, requestId, text);
  }

  tobHome() {
    return tobAdaptersRpc.tobHome(this.methods);
  }
  onboarding(slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot> {
    return personabotsRpc.onboarding(this.methods, slug, action);
  }
  acknowledgements(): { items: Record<string, string> } {
    return humansRpc.acknowledgements(this.methods);
  }
  acknowledge(key: string, value?: string): { key: string; value: string } {
    return humansRpc.acknowledge(this.methods, key, value);
  }
  onboardingModel(
    slug: string | undefined,
    expectedRevision: number,
    route: ModelRoute | undefined,
    globalDefault: boolean,
    expectedDefaultRevision?: number,
    groupId?: string,
    groupEffort?: string,
    expectedDefaultGroupRevision?: number,
  ): Promise<{ revision: number; groupRevision?: number }> {
    return personabotsRpc.onboardingModel(
      this.methods,
      slug,
      expectedRevision,
      route,
      globalDefault,
      expectedDefaultRevision,
      groupId,
      groupEffort,
      expectedDefaultGroupRevision,
    );
  }
  telemetryEvent(event: string, properties?: Record<string, string | boolean>): null {
    return diagnosticsAdaptersRpc.telemetryEvent(this.methods, event, properties);
  }
  modelPlanInherit(slug: string, expectedRevision: number): AdminResult<{ revision: number }> {
    return modelsRpc.modelPlanInherit(this.methods, slug, expectedRevision);
  }
  channelRetry(
    channelId: string,
    messageId: string,
    recovery?: 'continue' | 'compact' | 'new-session',
    failureMessageId?: string,
  ): Promise<{ accepted: true }> {
    return channelsAdaptersRpc.channelRetry(
      this.methods,
      channelId,
      messageId,
      recovery,
      failureMessageId,
    );
  }
  botNewSession(slug: string): Promise<{ started: true }> {
    return sessionsRpc.botNewSession(this.methods, slug);
  }

  botCompact(slug: string): Promise<ManualCompactionResult> {
    return sessionsRpc.botCompact(this.methods, slug);
  }
  botContext(slug: string): Promise<import('../runtime/context-window.js').BotContextWindow> {
    return sessionsRpc.botContext(this.methods, slug);
  }
  botSystemPrompt(
    slug: string,
  ): Promise<import('../runtime/prompt-inspection.js').BotSystemPromptView> {
    return promptsRpc.botSystemPrompt(this.methods, slug);
  }
  botTurnInput(
    slug: string,
    sessionId?: string,
    turns?: number,
  ): Promise<{
    slug: string;
    sessionId: string;
    turns: import('../runtime/prompt-inspection.js').TurnInputView[];
  }> {
    return promptsRpc.botTurnInput(this.methods, slug, sessionId, turns);
  }
  channelBotStop(
    channelId: string,
    botSlug: string,
    autoContinueFor?: string,
  ): Promise<{
    stopped: { botSlug: string; sessionId: string; messageId: string };
  }> {
    return sessionsRpc.channelBotStop(this.methods, channelId, botSlug, autoContinueFor);
  }
  sessionMessageSend(
    botSlug: string,
    sessionId: string,
    text: string,
  ): Promise<{ sourceEventId: string }> {
    return sessionsRpc.sessionMessageSend(this.methods, botSlug, sessionId, text);
  }
  sessionStop(
    botSlug: string,
    sessionId?: string,
    channelId?: string,
    activityId?: string,
  ): Promise<{
    stopped: import('../runtime/bot-runtime.js').StoppedSessionRef[];
    alreadyIdle: import('../runtime/bot-runtime.js').StoppedSessionRef[];
    messageId?: string;
  }> {
    return sessionsRpc.sessionStop(this.methods, botSlug, sessionId, channelId, activityId);
  }
  botStop(
    botSlug: string,
    channelId?: string,
    autoContinueFor?: string,
  ): Promise<{
    stopped: import('../runtime/bot-runtime.js').StoppedSessionRef[];
    alreadyIdle: import('../runtime/bot-runtime.js').StoppedSessionRef[];
    messageId?: string;
  }> {
    return sessionsRpc.botStop(this.methods, botSlug, channelId, autoContinueFor);
  }
  modelProviders(): Promise<ModelProvidersView> {
    return modelsRpc.modelProviders(this.methods);
  }

  modelProviderAdd(
    template: string,
    name: string,
    key: string,
    expectedRevision: number,
    endpoint?: string,
    model?: string,
  ): Promise<ModelProviderSave> {
    return modelsRpc.modelProviderAdd(
      this.methods,
      template,
      name,
      key,
      expectedRevision,
      endpoint,
      model,
    );
  }

  modelProviderEdit(
    id: string,
    expectedRevision: number,
    name?: string,
    key?: string,
  ): Promise<ModelProviderSave> {
    return modelsRpc.modelProviderEdit(this.methods, id, expectedRevision, name, key);
  }

  modelProviderRemove(id: string, expectedRevision: number): Promise<ModelProviderRemoval> {
    return modelsRpc.modelProviderRemove(this.methods, id, expectedRevision);
  }

  engineAccounts(grantable?: boolean) {
    return modelsRpc.engineAccounts(this.methods, grantable);
  }

  engineAccountQuotaRefresh(id: string) {
    return modelsRpc.engineAccountQuotaRefresh(this.methods, id);
  }

  engineSelection(request: import('../engines/engine-selection-bridge.js').EngineSelectionRequest) {
    return modelsRpc.engineSelection(this.methods, request);
  }

  engineAccountAdd(engine: string, name: string, expectedRevision: number) {
    return modelsRpc.engineAccountAdd(this.methods, engine, name, expectedRevision);
  }

  engineAccountRename(id: string, name: string, expectedRevision: number) {
    return modelsRpc.engineAccountRename(this.methods, id, name, expectedRevision);
  }

  engineAccountRemove(id: string, expectedRevision: number, confirm: boolean) {
    return modelsRpc.engineAccountRemove(this.methods, id, expectedRevision, confirm);
  }

  engineAccountLogin(id: string, engine?: string, mode?: 'device-auth') {
    return modelsRpc.engineAccountLogin(this.methods, id, engine, mode);
  }

  engineAccountLoginStatus(id: string, attemptId: string) {
    return modelsRpc.engineAccountLoginStatus(this.methods, id, attemptId);
  }

  engineAccountLoginCancel(id: string, attemptId?: string) {
    return modelsRpc.engineAccountLoginCancel(this.methods, id, attemptId);
  }

  engineAccountSubmitCode(id: string, code: string) {
    return modelsRpc.engineAccountSubmitCode(this.methods, id, code);
  }

  modelCatalog(includeRoutingGroupEngines?: boolean): Promise<{
    models: ModelCatalogEntry[];
    default?: ModelRoute;
    defaultRevision?: number;
    favorites?: ModelFavorite[];
    routingGroupEngines?: RoutingGroupEngineOptions[];
  }> {
    return modelsRpc.modelCatalog(this.methods, includeRoutingGroupEngines);
  }

  modelFavoriteSet(choice: ModelFavorite, favorite: boolean): { favorites: ModelFavorite[] } {
    return modelsRpc.modelFavoriteSet(this.methods, choice, favorite);
  }

  modelPresets(includeUsage?: boolean): {
    presets: ModelPreset[];
    defaultPresetId?: string;
    usage?: ModelPresetUsage[];
  } {
    return modelsRpc.modelPresets(this.methods, includeUsage);
  }

  modelPresetDelete(id: string, expectedRevision: number, confirmed: boolean): { id: string } {
    return modelsRpc.modelPresetDelete(this.methods, id, expectedRevision, confirmed);
  }

  modelPlanSub(slug: string) {
    return modelsRpc.modelPlanSub(this.methods, slug);
  }

  modelPlanSubSet(slug: string, expectedRevision: number, sub: PresetSub) {
    return modelsRpc.modelPlanSubSet(this.methods, slug, expectedRevision, sub);
  }

  modelPresetSub(id: string) {
    return modelsRpc.modelPresetSub(this.methods, id);
  }

  modelPresetSubSet(id: string, expectedRevision: number, sub: PresetSub) {
    return modelsRpc.modelPresetSubSet(this.methods, id, expectedRevision, sub);
  }

  modelPresetCreate(
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
    sub?: PresetSub,
  ): Promise<{ preset: ModelPreset }> {
    return modelsRpc.modelPresetCreate(
      this.methods,
      name,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      orchestratorEngine,
      assignmentEngine,
      sub,
    );
  }

  modelPresetUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
    assignmentFollowsMain?: boolean,
    sub?: PresetSub,
  ): Promise<{ preset: ModelPreset }> {
    return modelsRpc.modelPresetUpdate(
      this.methods,
      id,
      expectedRevision,
      name,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      orchestratorEngine,
      assignmentEngine,
      assignmentFollowsMain,
      sub,
    );
  }

  modelPresetApply(
    slug: string,
    presetId: string,
    expectedRevision?: number,
    expectedPresetRevision?: number,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelsRpc.modelPresetApply(
      this.methods,
      slug,
      presetId,
      expectedRevision,
      expectedPresetRevision,
    );
  }

  modelGroups(): { groups: RoutingGroup[] } {
    return modelsRpc.modelGroups(this.methods);
  }

  modelGroup(id: string): { group: RoutingGroup; routes: ModelRoute[] } {
    return modelsRpc.modelGroup(this.methods, id);
  }

  modelGroupCreate(name: string, members: RoutingGroupMember[]): Promise<{ group: RoutingGroup }> {
    return modelsRpc.modelGroupCreate(this.methods, name, members);
  }

  modelGroupUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    members: RoutingGroupMember[],
  ): Promise<{ group: RoutingGroup }> {
    return modelsRpc.modelGroupUpdate(this.methods, id, expectedRevision, name, members);
  }

  modelGroupDelete(id: string, expectedRevision: number): { group: RoutingGroup } {
    return modelsRpc.modelGroupDelete(this.methods, id, expectedRevision);
  }

  modelPlan(slug: string): Promise<AdminResult<ModelPlanState>> {
    return modelsRpc.modelPlan(this.methods, slug);
  }

  modelPlanCustomize(
    slug: string,
    orchestrator?: ModelRoute,
    expectedRevision?: number,
    orchestratorGroupId?: string,
    orchestratorGroupEffort?: string,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelsRpc.modelPlanCustomize(
      this.methods,
      slug,
      orchestrator,
      expectedRevision,
      orchestratorGroupId,
      orchestratorGroupEffort,
    );
  }

  modelPlanAssignmentsSet(
    slug: string,
    expectedRevision: number,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelsRpc.modelPlanAssignmentsSet(
      this.methods,
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
    );
  }

  modelPlanSet(
    slug: string,
    expectedRevision: number,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels: AssignmentModelOption[] | undefined,
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    sub?: PresetSub,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelsRpc.modelPlanSet(
      this.methods,
      slug,
      expectedRevision,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      sub,
    );
  }

  list(
    query?: string,
    administration?: boolean,
  ): { bots: Array<PersonaBotSummary | SharedBotSummary | BotMetadata> } {
    return personabotsRpc.list(this.methods, query, administration);
  }

  activitySnapshot(): PersonaBotActivitySnapshot {
    return activityRpc.activitySnapshot(this.methods);
  }

  get(slug: string): AdminResult<{ bot: PersonaBotDetail; profileFingerprint: string }> {
    return personabotsRpc.get(this.methods, slug);
  }

  create(
    displayName: string,
    roles?: string[],
    persona?: string,
    description?: string,
    model?: string,
    preset?: string,
    workspaces?: string[],
    avatar?: string,
    memoryLocation?: string,
    coreMemory?: string,
    operationKey?: string,
  ): {
    bot: PersonaBotDetail;
    channelId?: string;
    receipt?: BotCreationReceipt;
  } {
    return personabotsRpc.create(
      this.methods,
      displayName,
      roles,
      persona,
      description,
      model,
      preset,
      workspaces,
      avatar,
      memoryLocation,
      coreMemory,
      operationKey,
    );
  }

  createLookup(
    operationKey: string,
    displayName: string,
    roles?: string[],
    persona?: string,
    description?: string,
    model?: string,
    preset?: string,
    workspaces?: string[],
    avatar?: string,
    memoryLocation?: string,
    coreMemory?: string,
  ): { receipt: BotCreationReceipt | null } {
    return personabotsRpc.createLookup(
      this.methods,
      operationKey,
      displayName,
      roles,
      persona,
      description,
      model,
      preset,
      workspaces,
      avatar,
      memoryLocation,
      coreMemory,
    );
  }

  async botImportPreview(
    gitUrl: string,
  ): Promise<Awaited<ReturnType<BotImportsService['previewGit']>>> {
    return personabotsRpc.botImportPreview(this.methods, gitUrl);
  }
  botImportLookup(
    operationKey: string,
    gitUrl: string,
    expectedCommit: string,
    displayName: string,
    roles?: string[],
    description?: string,
  ): { receipt: BotCreationReceipt | null } {
    return personabotsRpc.botImportLookup(
      this.methods,
      operationKey,
      gitUrl,
      expectedCommit,
      displayName,
      roles,
      description,
    );
  }
  zipUploadBegin(uploadKey: string, sha256: string, sizeBytes: number): BotZipUploadStatus {
    return marketplaceRpc.zipUploadBegin(this.methods, uploadKey, sha256, sizeBytes);
  }

  zipUploadChunk(
    uploadKey: string,
    sha256: string,
    sizeBytes: number,
    offset: number,
    dataBase64: string,
  ): BotZipUploadStatus {
    return marketplaceRpc.zipUploadChunk(
      this.methods,
      uploadKey,
      sha256,
      sizeBytes,
      offset,
      dataBase64,
    );
  }

  zipUploadPreview(uploadKey: string, sha256: string, sizeBytes: number): BotZipPreview {
    return marketplaceRpc.zipUploadPreview(this.methods, uploadKey, sha256, sizeBytes);
  }

  zipImportLookup(
    operationKey: string,
    sha256: string,
    displayName: string,
    roles?: string[],
    description?: string,
  ): { receipt: BotCreationReceipt | null } {
    return marketplaceRpc.zipImportLookup(
      this.methods,
      operationKey,
      sha256,
      displayName,
      roles,
      description,
    );
  }

  async zipImport(
    operationKey: string,
    uploadKey: string,
    sha256: string,
    sizeBytes: number,
    displayName: string,
    roles?: string[],
    description?: string,
  ): Promise<{
    bot: PersonaBotDetail;
    channelId: string;
    receipt?: BotCreationReceipt;
  }> {
    return marketplaceRpc.zipImport(
      this.methods,
      operationKey,
      uploadKey,
      sha256,
      sizeBytes,
      displayName,
      roles,
      description,
    );
  }

  async createFromGit(
    displayName: string,
    gitUrl: string,
    roles?: string[],
    description?: string,
    origin?: 'marketplace',
    operationKey?: string,
    expectedCommit?: string,
    listingId?: string,
  ): Promise<{
    bot: PersonaBotDetail;
    httpsFallback?: HttpsFallback;
    receipt?: BotCreationReceipt;
    channelId?: string;
  }> {
    return personabotsRpc.createFromGit(
      this.methods,
      displayName,
      gitUrl,
      roles,
      description,
      origin,
      operationKey,
      expectedCommit,
      listingId,
    );
  }

  update(
    slug: string,
    patch: PersonaBotPatch,
    expectedProfile?: string,
  ): AdminResult<{ bot: PersonaBotDetail }> {
    return personabotsRpc.update(this.methods, slug, patch, expectedProfile);
  }

  dataResetPreview(): { preview: DataResetPreview } {
    return profileStorageAdaptersRpc.dataResetPreview(this.methods);
  }
  dataResetConfirm(token: string): { reset: DataResetResult } {
    return profileStorageAdaptersRpc.dataResetConfirm(this.methods, token);
  }
  deletionPreview(
    slug: string,
  ): AdminResult<
    { preview: PersonaBotDeletionPreview },
    BotMetadataResult & { preview: AdminDeletionPreview }
  > {
    return personabotsRpc.deletionPreview(this.methods, slug);
  }
  async deletionConfirm(
    slug: string,
    token: string,
    eraseMemory: boolean,
  ): Promise<
    AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
  > {
    return personabotsRpc.deletionConfirm(this.methods, slug, token, eraseMemory);
  }
  async deletionRetry(
    slug: string,
  ): Promise<
    AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
  > {
    return personabotsRpc.deletionRetry(this.methods, slug);
  }
  deletionMemoryFolder(slug: string): AdminResult<{
    target: { path: string; relativePath: string; kind: 'directory' };
  }> {
    return personabotsRpc.deletionMemoryFolder(this.methods, slug);
  }
  pause(slug: string): AdminResult<{ bot: PersonaBotDetail }> {
    return personabotsRpc.pause(this.methods, slug);
  }

  resume(slug: string): AdminResult<{ bot: PersonaBotDetail }> {
    return personabotsRpc.resume(this.methods, slug);
  }
  computerAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return computerRpc.computerAccessSet(this.methods, slug, enabled);
  }

  browserAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return browserRpc.browserAccessSet(this.methods, slug, enabled);
  }

  browserProfileSet(slug: string, profile: string): { bot: PersonaBotDetail } {
    return browserRpc.browserProfileSet(this.methods, slug, profile);
  }

  approvalTemplates(slug?: string): {
    templates: ApprovalTemplateEntry[];
    selected?: string | null;
    globalDefault?: string | null;
    effective?: string | null;
    source?: 'global' | 'specific' | 'off';
  } {
    return approvalsRpc.approvalTemplates(this.methods, slug);
  }

  approvalTemplateCreate(
    name: string,
    text?: string,
    from?: string,
  ): { template: ApprovalTemplateEntry } {
    return approvalsRpc.approvalTemplateCreate(this.methods, name, text, from);
  }

  approvalTemplateUpdate(name: string, text: string): { template: ApprovalTemplateEntry } {
    return approvalsRpc.approvalTemplateUpdate(this.methods, name, text);
  }

  promptParts(): { parts: PromptPartView[]; limits: PromptLimitView[] } {
    return promptsRpc.promptParts(this.methods);
  }

  promptPresets(): { presets: PromptPreset[]; globalPresetId: string | null } {
    return promptsRpc.promptPresets(this.methods);
  }

  promptPresetCreate(
    name: string,
    parts?: Record<string, unknown>,
    limits?: Record<string, unknown>,
  ): { preset: PromptPreset } {
    return promptsRpc.promptPresetCreate(this.methods, name, parts, limits);
  }

  promptPresetUpdate(
    id: string,
    name?: string,
    parts?: Record<string, unknown>,
    expectedRevision?: number,
    limits?: Record<string, unknown>,
  ): { preset: PromptPreset } {
    return promptsRpc.promptPresetUpdate(this.methods, id, name, parts, expectedRevision, limits);
  }

  promptPresetDelete(id: string): { id: string; clearedBots: string[] } {
    return promptsRpc.promptPresetDelete(this.methods, id);
  }

  promptGlobalSet(presetId: string | null): { presetId: string | null } {
    return promptsRpc.promptGlobalSet(this.methods, presetId);
  }

  botPrompt(slug: string): BotPromptView {
    return promptsRpc.botPrompt(this.methods, slug);
  }

  botPromptSet(
    slug: string,
    presetId?: string | null,
    parts?: Record<string, unknown>,
    limits?: Record<string, unknown>,
  ): BotPromptView {
    return promptsRpc.botPromptSet(this.methods, slug, presetId, parts, limits);
  }

  approvalTemplateDeletePreview(name: string): { preview: ApprovalTemplateDeletionPreview } {
    return approvalsRpc.approvalTemplateDeletePreview(this.methods, name);
  }

  approvalTemplateDelete(
    name: string,
    confirmed: boolean,
    revision: string,
  ): {
    template: { name: string };
    clearedBots: string[];
    inheritedBots: string[];
    globalDefault: string | null;
  } {
    return approvalsRpc.approvalTemplateDelete(this.methods, name, confirmed, revision);
  }

  approvalTemplateGlobalSet(template: string | null): { template: string | null } {
    return approvalsRpc.approvalTemplateGlobalSet(this.methods, template);
  }

  botApprovalTemplateSet(slug: string, template: string | null): { bot: PersonaBotDetail } {
    return approvalsRpc.botApprovalTemplateSet(this.methods, slug, template);
  }

  voiceProviders(slug?: string): VoiceProvidersView {
    return voiceRpc.voiceProviders(this.methods, slug);
  }

  voiceProviderAdd(
    preset: string,
    name?: string,
    baseUrl?: string,
    model?: string,
    defaultVoice?: string,
    key?: string,
    kind?: string,
    language?: string,
  ): Promise<{ provider: VoiceProviderView }> {
    return voiceRpc.voiceProviderAdd(
      this.methods,
      preset,
      name,
      baseUrl,
      model,
      defaultVoice,
      key,
      kind,
      language,
    );
  }

  voiceProviderRemove(id: string): Promise<{ provider: VoiceProviderView; clearedBots: string[] }> {
    return voiceRpc.voiceProviderRemove(this.methods, id);
  }

  voiceProviderTest(id: string, voiceId?: string): Promise<ProviderHealth> {
    return voiceRpc.voiceProviderTest(this.methods, id, voiceId);
  }

  voiceSynthesize(
    text: string,
    slug?: string,
    providerId?: string,
    voiceId?: string,
    markdown?: boolean,
  ): Promise<VoiceSynthesisView> {
    return voiceRpc.voiceSynthesize(this.methods, text, slug, providerId, voiceId, markdown);
  }

  botVoiceSet(
    slug: string,
    providerId: string | null,
    voiceId?: string,
  ): { slug: string; voice: PersonaBotVoice | null } {
    return voiceRpc.botVoiceSet(this.methods, slug, providerId, voiceId);
  }

  voiceTranscribe(
    audio: string,
    slug?: string,
    providerId?: string,
    language?: string,
  ): Promise<VoiceTranscriptionView> {
    return voiceRpc.voiceTranscribe(this.methods, audio, slug, providerId, language);
  }

  botAsrSet(
    slug: string,
    providerId: string | null,
    language?: string,
  ): { slug: string; asr: PersonaBotAsr | null } {
    return voiceRpc.botAsrSet(this.methods, slug, providerId, language);
  }

  voiceDefaultSet(
    kind: string,
    providerId: string | null,
    voiceId?: string,
    language?: string,
  ): { defaults: VoiceDefaults } {
    return voiceRpc.voiceDefaultSet(this.methods, kind, providerId, voiceId, language);
  }

  botModes(slug?: string): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModes(this.methods, slug);
  }

  botModeDefaultSet(mode: string | null): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModeDefaultSet(this.methods, mode);
  }

  botModeSet(slug: string, mode: string | null): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModeSet(this.methods, slug, mode);
  }

  botModeTemplateSave(name: string, modes: string[], id?: string): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModeTemplateSave(this.methods, name, modes, id);
  }

  botModeTemplateDelete(id: string): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModeTemplateDelete(this.methods, id);
  }

  botModeTemplateSet(slug: string, template: string | null): Promise<BotModesView> {
    return appearanceAdaptersRpc.botModeTemplateSet(this.methods, slug, template);
  }

  voiceSpeechThresholdSet(dbfs: number | null): { speechThreshold: VoiceSpeechThreshold } {
    return voiceRpc.voiceSpeechThresholdSet(this.methods, dbfs);
  }

  voiceDictation(
    kind: string,
    id?: string,
    pcm?: string,
    slug?: string,
    providerId?: string,
    language?: string,
  ): Promise<{ readiness: VoiceDictationReadiness } | { dictation: VoiceDictationView }> {
    return voiceRpc.voiceDictation(this.methods, kind, id, pcm, slug, providerId, language);
  }

  approvalReviewerModel(): Promise<ApprovalReviewerModelView> {
    return approvalsRpc.approvalReviewerModel(this.methods);
  }

  approvalReviewerModelSet(model: ModelRoute | null): Promise<ApprovalReviewerModelView> {
    return approvalsRpc.approvalReviewerModelSet(this.methods, model);
  }

  idleCompaction(): IdleCompactionView {
    return sessionsRpc.idleCompaction(this.methods);
  }

  idleCompactionSet(enabled: boolean): IdleCompactionView {
    return sessionsRpc.idleCompactionSet(this.methods, enabled);
  }

  compactionThresholdSet(
    thresholdRatio?: number | null,
    headroomTokens?: number | null,
  ): IdleCompactionView {
    return sessionsRpc.compactionThresholdSet(this.methods, thresholdRatio, headroomTokens);
  }

  idleCompactionCacheLifetimeSet(
    provider: string,
    model: string,
    seconds: number | null,
  ): IdleCompactionView {
    return sessionsRpc.idleCompactionCacheLifetimeSet(this.methods, provider, model, seconds);
  }

  standingLimitsSet(
    slug: string,
    soul: number,
    coreMemory: number,
  ): AdminResult<{ bot: PersonaBotDetail }> {
    return personabotsRpc.standingLimitsSet(this.methods, slug, soul, coreMemory);
  }

  botAvatarSet(channelId: string, avatar: string | null): AdminResult<{ bot: PersonaBotDetail }> {
    return avatarsRpc.botAvatarSet(this.methods, channelId, avatar);
  }

  partLibraryList(): { parts: PartLibraryEntry[] } {
    return avatarsRpc.partLibraryList(this.methods);
  }

  partLibraryExport(id?: string, part?: unknown): { fileName: string; data: string } {
    return avatarsRpc.partLibraryExport(this.methods, id, part);
  }

  partLibraryImport(data: string): {
    added: PartLibraryEntry[];
    refused: { name: string; reason: string }[];
  } {
    return avatarsRpc.partLibraryImport(this.methods, data);
  }

  partLibraryImportImage(
    data: string,
    slot: string,
    colors: number,
    name: string,
  ): { entry: PartLibraryEntry } {
    return avatarsRpc.partLibraryImportImage(this.methods, data, slot, colors, name);
  }

  partLibraryAdd(part: unknown, name: string, parent?: string): { entry: PartLibraryEntry } {
    return avatarsRpc.partLibraryAdd(this.methods, part, name, parent);
  }

  botBannerSet(channelId: string, banner: unknown): AdminResult<{ bot: PersonaBotDetail }> {
    return avatarsRpc.botBannerSet(this.methods, channelId, banner);
  }

  botAppearanceSet(channelId: string, recipe: unknown): AdminResult<{ bot: PersonaBotDetail }> {
    return avatarsRpc.botAppearanceSet(this.methods, channelId, recipe);
  }

  botPrimaryColorSet(
    channelId: string,
    primaryColor: unknown,
  ): AdminResult<{ bot: PersonaBotDetail }> {
    return avatarsRpc.botPrimaryColorSet(this.methods, channelId, primaryColor);
  }

  async channels(): Promise<{ channels: ChannelListItem[] }> {
    return channelsAdaptersRpc.channels(this.methods);
  }

  async channelListChanges(sinceSeq: number, epoch?: string): Promise<ChannelListChanges> {
    return channelsAdaptersRpc.channelListChanges(this.methods, sinceSeq, epoch);
  }

  channelDm(
    slug: string,
    displayName?: string,
  ): { channel: ChannelRecord & { readOnly?: boolean } } {
    return channelsAdaptersRpc.channelDm(this.methods, slug, displayName);
  }

  channelGet(channelId: string) {
    return channelsAdaptersRpc.channelGet(this.methods, channelId);
  }

  channelCreate(
    name: string,
    members: string[],
    operationKey?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return channelsAdaptersRpc.channelCreate(this.methods, name, members, operationKey);
  }

  channelRename(
    channelId: string,
    name: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord; bot?: PersonaBotDetail } {
    return channelsAdaptersRpc.channelRename(this.methods, channelId, name, expectedChannel);
  }

  channelGroupAvatarSet(
    channelId: string,
    avatar: string | null,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelsAdaptersRpc.channelGroupAvatarSet(
      this.methods,
      channelId,
      avatar,
      expectedChannel,
    );
  }

  channelGroupInvite(
    channelId: string,
    botSlug: string,
    operationKey?: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return channelsAdaptersRpc.channelGroupInvite(
      this.methods,
      channelId,
      botSlug,
      operationKey,
      expectedChannel,
    );
  }

  channelGroupInviteCancel(
    channelId: string,
    invitationId: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelsAdaptersRpc.channelGroupInviteCancel(
      this.methods,
      channelId,
      invitationId,
      expectedChannel,
    );
  }

  channelGroupJoinDecide(
    channelId: string,
    requestId: string,
    accept: boolean,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelsAdaptersRpc.channelGroupJoinDecide(
      this.methods,
      channelId,
      requestId,
      accept,
      expectedChannel,
    );
  }

  channelGroupMemberRemove(
    channelId: string,
    botSlug: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelsAdaptersRpc.channelGroupMemberRemove(
      this.methods,
      channelId,
      botSlug,
      expectedChannel,
    );
  }

  channelGroupSendReview(channelId: string, enabled?: boolean): { enabled: boolean } {
    return channelsAdaptersRpc.channelGroupSendReview(this.methods, channelId, enabled);
  }

  channelGroupWakePolicies(channelId: string): {
    members: GroupMemberWakePolicy[];
  } {
    return channelsAdaptersRpc.channelGroupWakePolicies(this.methods, channelId);
  }

  channelGroupWakeSet(
    channelId: string,
    botSlug: string,
    mode: 'all' | 'mentions' | 'digest' | 'silent',
    count: number,
    intervalSeconds: number,
    inherit?: boolean,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return channelsAdaptersRpc.channelGroupWakeSet(
      this.methods,
      channelId,
      botSlug,
      mode,
      count,
      intervalSeconds,
      inherit,
      expectedChannel,
    );
  }

  ping() {
    return diagnosticsAdaptersRpc.ping(this.methods);
  }

  humanIdentity() {
    return humansRpc.humanIdentity(this.methods);
  }

  composerIdentity() {
    return humansRpc.composerIdentity(this.methods);
  }

  composerValidate(
    channelId: string,
    attachments: ChannelAttachmentRef[],
    replyTo?: string,
    quotes?: Array<{ messageId: string; text?: string }>,
  ) {
    return channelsAdaptersRpc.composerValidate(
      this.methods,
      channelId,
      attachments,
      replyTo,
      quotes,
    );
  }

  channelHumanNameSet(channelId: string, nickname: string | null) {
    return humansRpc.channelHumanNameSet(this.methods, channelId, nickname);
  }

  humanNameSet(displayName: string | null) {
    return humansRpc.humanNameSet(this.methods, displayName);
  }

  humanAvatarSet(avatar: string | null) {
    return humansRpc.humanAvatarSet(this.methods, avatar);
  }

  humanAvatars(humanIds: string[]) {
    return humansRpc.humanAvatars(this.methods, humanIds);
  }

  humanProfileSetupFinish() {
    return humansRpc.humanProfileSetupFinish(this.methods);
  }

  channelGroupDelete(channelId: string): { deleted: boolean } & GroupDisbandResult {
    return channelsAdaptersRpc.channelGroupDelete(this.methods, channelId);
  }

  channelHistory(): { channels: ChannelHistoryItem[] } {
    return channelsAdaptersRpc.channelHistory(this.methods);
  }
  channelHistorySources(
    channelId: string,
    before?: string,
  ): { sources: PurgeSource[]; before?: string } {
    return channelsAdaptersRpc.channelHistorySources(this.methods, channelId, before);
  }
  storageUsage(): StorageUsage {
    return profileStorageAdaptersRpc.storageUsage(this.methods);
  }
  storageCleanupPreview(
    before: string,
    channelIds?: string[],
    kinds?: StorageMediaKind[],
  ): MediaCleanupPreview {
    return profileStorageAdaptersRpc.storageCleanupPreview(this.methods, before, channelIds, kinds);
  }
  storageCleanupConfirm(
    before: string,
    channelIds: string[] | undefined,
    kinds: StorageMediaKind[] | undefined,
    token: string,
  ): MediaCleanupResult {
    return profileStorageAdaptersRpc.storageCleanupConfirm(
      this.methods,
      before,
      channelIds,
      kinds,
      token,
    );
  }
  storageMessagesCleanupPreview(before: string, channelIds?: string[]): TextCleanupPreview {
    return profileStorageAdaptersRpc.storageMessagesCleanupPreview(
      this.methods,
      before,
      channelIds,
    );
  }
  storageMessagesCleanupConfirm(
    before: string,
    channelIds: string[] | undefined,
    token: string,
  ): TextCleanupResult {
    return profileStorageAdaptersRpc.storageMessagesCleanupConfirm(
      this.methods,
      before,
      channelIds,
      token,
    );
  }
  channelPurgePreview(channelId: string, sourceEventIds: string[]): PurgePreview {
    return profileStorageAdaptersRpc.channelPurgePreview(this.methods, channelId, sourceEventIds);
  }
  channelPurgeConfirm(
    channelId: string,
    sourceEventIds: string[],
    token: string,
  ): { accepted: number } {
    return profileStorageAdaptersRpc.channelPurgeConfirm(
      this.methods,
      channelId,
      sourceEventIds,
      token,
    );
  }

  channelMessages(
    channelId: string,
    before?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; revision: number } {
    return channelsAdaptersRpc.channelMessages(this.methods, channelId, before, limit);
  }

  channelTimeline(
    channelId: string,
    direction?: TimelineDirection,
    cursor?: string,
    around?: string,
    limit?: number,
    olderLimit?: number,
    newerLimit?: number,
  ): { page: ChannelTimelinePage; revision: number } {
    return channelsAdaptersRpc.channelTimeline(
      this.methods,
      channelId,
      direction,
      cursor,
      around,
      limit,
      olderLimit,
      newerLimit,
    );
  }

  channelReadPosition(channelId: string): { position?: ChannelReadPosition } {
    return channelsAdaptersRpc.channelReadPosition(this.methods, channelId);
  }

  async channelMarkAllRead(channelId?: string, botSlug?: string): Promise<{ channels: number }> {
    return channelsAdaptersRpc.channelMarkAllRead(this.methods, channelId, botSlug);
  }
  async channelMarkRead(
    channelId: string,
    messageId: string,
  ): Promise<{ position: ChannelReadPosition }> {
    return channelsAdaptersRpc.channelMarkRead(this.methods, channelId, messageId);
  }

  channelReact(
    channelId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): { reactions: ChannelReaction[] } {
    return channelsAdaptersRpc.channelReact(this.methods, channelId, messageId, emoji, active);
  }

  channelSearch(
    channelId: string,
    text: string,
    cursor?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; nextCursor?: string } {
    return channelsAdaptersRpc.channelSearch(this.methods, channelId, text, cursor, limit);
  }

  messageSearch(text: string, cursor?: string, limit?: number): HumanMessageSearchPage {
    return channelsAdaptersRpc.messageSearch(this.methods, text, cursor, limit);
  }

  channelSkillCatalog(channelId: string): Promise<{ skills: SkillCatalogEntry[] }> {
    return skillsRpc.channelSkillCatalog(() => this.methods, channelId);
  }

  sessionSkillCatalog(slug: string, sessionId: string): Promise<{ skills: SkillCatalogEntry[] }> {
    return skillsRpc.sessionSkillCatalog(() => this.methods, slug, sessionId);
  }
  botSkills(slug: string): Promise<{ skills: BotSkill[] }> {
    return skillsRpc.botSkills(() => this.methods, slug);
  }
  skillShow(name: string, owner: string): Promise<{ skill: SkillDetail }> {
    return skillsRpc.skillShow(() => this.methods, name, owner);
  }
  botSkillRemove(slug: string, name: string): Promise<{ name: string; removed: string }> {
    return skillsRpc.botSkillRemove(() => this.methods, slug, name);
  }
  channelAllBotPreview(channelId: string): AllBotPreview {
    return channelsAdaptersRpc.channelAllBotPreview(this.methods, channelId);
  }
  async tobCli(
    action: 'start' | 'status' | 'cancel',
    command?: TobCliCommand,
    id?: string,
  ): Promise<TobCliStatus> {
    return tobAdaptersRpc.tobCli(this.methods, action, command, id);
  }

  channelSendStatus(channelId: string, messageId: string): ChannelSendStatus {
    return channelsAdaptersRpc.channelSendStatus(this.methods, channelId, messageId);
  }

  async channelSend(
    channelId: string,
    body: string,
    replyTo?: string,
    attachments?: ChannelAttachmentRef[],
    messageId?: string,
    memorySwitchTarget?: string,
    mentions?: ChannelMessage['mentions'],
    channelRefs?: ChannelMessage['channelRefs'],
    grantRequestResolution?: ChannelMessage['grantRequestResolution'],
    assignmentReply?: ChannelMessage['assignmentReply'],
    allBotMention?: AllBotMention,
    genuiReply?: GenuiMessageReply,
    skillInvocations?: ChannelSkillInvocationToken[],
    quotes?: ChannelMessage['quotes'],
  ): Promise<{ message: ChannelMessage }> {
    return channelsAdaptersRpc.channelSend(
      this.methods,
      channelId,
      body,
      replyTo,
      attachments,
      messageId,
      memorySwitchTarget,
      mentions,
      channelRefs,
      grantRequestResolution,
      assignmentReply,
      allBotMention,
      genuiReply,
      skillInvocations,
      quotes,
    );
  }

  channelGenuiView(channelId: string, messageId: string): GenuiPrivateView {
    return genuiRpc.channelGenuiView(this.methods, channelId, messageId);
  }
  channelGenuiViewSave(
    channelId: string,
    messageId: string,
    snapshotId: string,
    expectedVersion: number,
    state: GenuiViewState | GenuiDocumentState,
  ): GenuiPrivateView {
    return genuiRpc.channelGenuiViewSave(
      this.methods,
      channelId,
      messageId,
      snapshotId,
      expectedVersion,
      state,
    );
  }

  botAttention(
    slug: string,
    limit?: number,
    cursor?: string,
    state?: BotAttentionState,
  ): BotAttentionPage {
    return activityRpc.botAttention(this.methods, slug, limit, cursor, state);
  }

  botSourcePolicies(slug: string): { policies: BotSourcePolicy[] } {
    return activityRpc.botSourcePolicies(this.methods, slug);
  }

  botSourcePolicySet(
    slug: string,
    wake: 'conditional' | 'immediate' | 'digest' | 'mentions' | 'silent',
    sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
    digestCount?: number,
    digestIntervalSeconds?: number,
    delivery?: 'steer' | 'turn',
  ): { policy: BotSourcePolicy } {
    return activityRpc.botSourcePolicySet(
      this.methods,
      slug,
      wake,
      sourceClass,
      digestCount,
      digestIntervalSeconds,
      delivery,
    );
  }

  botSourcePolicyReset(
    slug: string,
    sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
  ): { policy: BotSourcePolicy } {
    return activityRpc.botSourcePolicyReset(this.methods, slug, sourceClass);
  }

  channelActivityToday(): ChannelActivityToday {
    return activityRpc.channelActivityToday(this.methods);
  }

  activityOverview() {
    return activityRpc.activityOverview(this.methods);
  }

  humanAttention(
    category?: HumanAttentionCategory,
    botSlug?: string,
    channelId?: string,
    limit?: number,
    cursor?: string,
    sort?: 'newest' | 'oldest' | 'mentions-first',
    snoozed?: boolean,
    kind?: 'auto-rejection',
    search?: string,
    unreadOnly?: boolean,
    queryVersion?: number,
    dismissed?: boolean,
    notifications?: boolean,
  ): HumanAttentionPage {
    return activityRpc.humanAttention(
      this.methods,
      category,
      botSlug,
      channelId,
      limit,
      cursor,
      sort,
      snoozed,
      kind,
      search,
      unreadOnly,
      queryVersion,
      dismissed,
      notifications,
    );
  }
  humanAttentionStatus(messageCounts?: boolean): HumanAttentionStatus {
    return activityRpc.humanAttentionStatus(this.methods, messageCounts);
  }
  channelUnreadCounts(): {
    channels: Array<{ channelId: string; unreadCount: number }>;
  } {
    return activityRpc.channelUnreadCounts(this.methods);
  }
  humanAssignmentContext(
    slug: string,
    sessionId: string,
    sourceEventId: string,
  ): { context: HumanAssignmentContext } {
    return assignmentsRpc.humanAssignmentContext(this.methods, slug, sessionId, sourceEventId);
  }
  humanAttentionDismiss(itemId: string, sourceKey: string): { accepted: boolean } {
    return activityRpc.humanAttentionDismiss(this.methods, itemId, sourceKey);
  }
  humanAttentionRestore(itemId: string, sourceKey: string): { accepted: boolean } {
    return activityRpc.humanAttentionRestore(this.methods, itemId, sourceKey);
  }
  async humanAttentionDismissAll(
    kind?: string,
    category?: string,
    botSlug?: string,
    channelId?: string,
  ): Promise<{ accepted: boolean; dismissed: number; read: number; more: boolean }> {
    return activityRpc.humanAttentionDismissAll(this.methods, kind, category, botSlug, channelId);
  }
  humanAttentionIgnore(sourceEventId: string): { accepted: boolean } {
    return activityRpc.humanAttentionIgnore(this.methods, sourceEventId);
  }
  humanAttentionSnooze(
    itemId: string,
    sourceKey: string,
    until: string | null,
  ): { accepted: boolean } {
    return activityRpc.humanAttentionSnooze(this.methods, itemId, sourceKey, until);
  }

  assignments(
    slug: string,
    query?: string,
    activity?: AssignmentActivity[],
    includeArchived?: boolean,
    limit?: number,
    cursor?: string,
  ): { assignments: AssignmentSummary[]; nextCursor?: string } {
    return assignmentsRpc.assignments(
      this.methods,
      slug,
      query,
      activity,
      includeArchived,
      limit,
      cursor,
    );
  }

  channelAssignments(channelId: string): {
    assignments: ChannelAssignmentSummary[];
  } {
    return assignmentsRpc.channelAssignments(this.methods, channelId);
  }

  assignment(slug: string, sessionId: string): { assignment: AssignmentDetail } {
    return assignmentsRpc.assignment(this.methods, slug, sessionId);
  }

  assignmentTimeline(
    slug: string,
    sessionId: string,
  ): Promise<{
    assignment: AssignmentDetail;
    lanes: AssignmentTimelineLane[];
    omittedSubagents: number;
  }> {
    return assignmentsRpc.assignmentTimeline(this.methods, slug, sessionId);
  }

  sessionSubagents(
    slug: string,
    sessionId: string,
  ): Promise<{
    sessionId: string;
    role: SessionRootRole;
    lanes: AssignmentTimelineLane[];
    omittedSubagents: number;
  }> {
    return assignmentsRpc.sessionSubagents(this.methods, slug, sessionId);
  }

  sessionProgress(
    slug: string,
    sessionIds: readonly string[],
  ): Promise<{ sessions: SessionProgressEntry[] }> {
    return assignmentsRpc.sessionProgress(this.methods, slug, sessionIds);
  }

  sessionModel(slug: string, sessionId: string, choice?: unknown): Promise<SessionModelState> {
    return sessionsRpc.sessionModel(this.methods, slug, sessionId, choice);
  }

  sessionTranscript(
    slug: string,
    sessionId: string,
  ): Promise<{ sessionId: string; role: SessionRootRole } & SessionTranscript> {
    return sessionsRpc.sessionTranscript(this.methods, slug, sessionId);
  }

  sessionLive(
    slug: string,
    sessionId: string,
    after?: number,
  ): Promise<{ sessionId: string } & SessionLiveSnapshot> {
    return unwrapAsync(
      this.methods.sessionLive({ slug, sessionId, ...(after === undefined ? {} : { after }) }),
    );
  }

  sessionToolDetail(
    slug: string,
    sessionId: string,
    callId: string,
  ): Promise<{ sessionId: string; callId: string; detail: SessionToolDetail }> {
    return sessionsRpc.sessionToolDetail(this.methods, slug, sessionId, callId);
  }

  workspaceOptions(): {
    workspaces: { id: string; path: string; title: string }[];
  } {
    return workspacesRpc.workspaceOptions(this.methods);
  }

  channelMediaTarget(
    channelId: string,
    sourceEventId: string,
    attachmentId: string,
  ): Promise<{ target: MemoryFileTarget }> {
    return messagingRpc.channelMediaTarget(this.methods, channelId, sourceEventId, attachmentId);
  }

  messageAttachmentTarget(
    channelId: string,
    messageId: string,
    fileId: string,
  ): { target: MemoryFileTarget } {
    return channelFilesAdaptersRpc.messageAttachmentTarget(
      this.methods,
      channelId,
      messageId,
      fileId,
    );
  }

  folderBrowse(path?: string, offset?: number): Promise<FolderListing> {
    return workspacesRpc.folderBrowse(this.methods, path, offset);
  }

  workspaceFileTarget(
    slug: string,
    grantId: string,
  ): { target: { path: string; relativePath: ''; kind: 'directory' } } {
    return workspacesRpc.workspaceFileTarget(this.methods, slug, grantId);
  }

  grants(slug: string, scope?: { channelId: string; path: string }): { grants: WorkspaceGrant[] } {
    return workspacesRpc.grants(this.methods, slug, scope);
  }

  grantCreate(
    slug: string,
    workspaceId: string,
    scope?: { channelId: string; path: string },
  ): Promise<{ grant: WorkspaceGrant; created?: boolean }> {
    return workspacesRpc.grantCreate(this.methods, slug, workspaceId, scope);
  }

  grantRevoke(slug: string, grantId: string): { grant: WorkspaceGrant } {
    return workspacesRpc.grantRevoke(this.methods, slug, grantId);
  }

  grantRequestApprove(
    slug: string,
    channelId: string,
    requestMessageId: string,
    workspaceId: string,
    acknowledgeReadWrite: boolean,
  ) {
    this.invocationHuman();
    return workspacesRpc.grantRequestApprove(
      this.methods,
      slug,
      channelId,
      requestMessageId,
      workspaceId,
      acknowledgeReadWrite,
    );
  }

  grantWriteSet(slug: string, grantId: string, enabled: boolean): { grant: WorkspaceGrant } {
    return workspacesRpc.grantWriteSet(this.methods, slug, grantId, enabled);
  }

  assignmentAccessGet(slug: string): { preset: AssignmentAccessPreset } {
    return assignmentsRpc.assignmentAccessGet(this.methods, slug);
  }

  assignmentAccessSet(
    slug: string,
    mode: AssignmentAccessMode,
    acknowledgeRisk: boolean,
    scope?: 'chat' | 'assignments',
  ): { preset: AssignmentAccessPreset } {
    return assignmentsRpc.assignmentAccessSet(this.methods, slug, mode, acknowledgeRisk, scope);
  }

  toolApprovalRules(slug: string): { rules: ToolApprovalRule[] } {
    return approvalsRpc.toolApprovalRules(this.methods, slug);
  }

  toolApprovalRuleRevoke(slug: string, id: string): { rule: ToolApprovalRule } {
    return approvalsRpc.toolApprovalRuleRevoke(this.methods, slug, id);
  }

  toolApprovalHistory(
    slug: string,
    page?: { cursor?: string; limit?: number },
  ): { entries: ToolApprovalHistoryEntry[]; nextCursor?: string } {
    return approvalsRpc.toolApprovalHistory(this.methods, slug, page);
  }

  toolApprovalStatus(
    channelId: string,
    messageId: string,
  ): {
    approval?: ApprovalCard;
    status: 'pending' | 'expired' | 'stopped';
    execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
  } {
    return approvalsRpc.toolApprovalStatus(this.methods, channelId, messageId);
  }

  toolApprovalDecide(
    channelId: string,
    messageId: string,
    outcome:
      | 'allowed-once'
      | 'allowed-always-tool'
      | 'allowed-always-exact'
      | 'allowed-always-all'
      | 'rejected',
  ): Promise<{ accepted: boolean }> {
    return approvalsRpc.toolApprovalDecide(this.methods, channelId, messageId, outcome);
  }

  toolAutoRejectionOverride(
    itemId: string,
  ): Promise<{ accepted: true; channelId: string; messageId: string }> {
    return approvalsRpc.toolAutoRejectionOverride(this.methods, itemId);
  }

  userQuestionStatus(
    channelId: string,
    messageId: string,
  ): { status: 'pending' | 'submitted' | 'answered' | 'expired'; approval?: ApprovalCard } {
    return approvalsRpc.userQuestionStatus(this.methods, channelId, messageId);
  }

  userQuestionAnswer(
    channelId: string,
    messageId: string,
    answer: { answers: { id: string; selected: string[]; custom?: string }[] },
  ): Promise<{ accepted: boolean }> {
    return approvalsRpc.userQuestionAnswer(this.methods, channelId, messageId, answer);
  }

  sessions(slug: string): { sessions: OwnedSessionSummary[] };
  sessions(
    slug: string,
    includeTitles: boolean,
  ): { sessions: OwnedSessionSummary[] } | Promise<{ sessions: OwnedSessionSummary[] }>;
  sessions(slug: string, includeTitles?: boolean) {
    return sessionsRpc.sessions(this.methods, slug, includeTitles);
  }

  botToolTrace(
    slug: string,
    sessionId?: string,
    turns?: number,
  ): Promise<{ slug: string; sessionId: string; turns: TurnTrace[] }> {
    return sessionsRpc.botToolTrace(this.methods, slug, sessionId, turns);
  }

  botTools(): { sessionId: 'direct'; tools: DirectBotToolSpec[] } {
    return tobAdaptersRpc.botTools(this.methods);
  }

  botToolRun(
    slug: string,
    tool: string,
    args?: Record<string, unknown>,
    sessionId?: string,
    sourceEventId?: string,
  ): Promise<{
    slug: string;
    tool: string;
    sessionId: 'direct';
    result: unknown;
  }> {
    return tobAdaptersRpc.botToolRun(this.methods, slug, tool, args, sessionId, sourceEventId);
  }

  sessionArchiveSet(
    slug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<{ archived: boolean }> {
    return sessionsRpc.sessionArchiveSet(this.methods, slug, sessionId, archived);
  }

  memoryMove(
    slug: string,
    location: string | null,
  ): Promise<{ memoryDir: string; moved: boolean; leftover?: string }> {
    return memoryRpc.memoryMove(this.methods, slug, location);
  }

  sessionOwner(sessionId: string): { owner: OwnedSessionBot | null } {
    return sessionsRpc.sessionOwner(this.methods, sessionId);
  }

  botSessionIds(): {
    sessionIds: string[];
    groups: { botSlug: string; displayName: string; sessionIds: string[] }[];
  } {
    return sessionsRpc.botSessionIds(this.methods);
  }

  memoryFileTarget(slug: string, path: string): { target: MemoryFileTarget } {
    return memoryRpc.memoryFileTarget(this.methods, slug, path);
  }

  memoryImage(
    slug: string,
    path: string,
    source: string,
    revision: string,
    reference?: string,
  ): { mime: string; dataBase64: string } {
    return memoryRpc.memoryImage(this.methods, slug, path, source, revision, reference);
  }

  memorySnapshot(channelId: string): { snapshot: MemoryAcceptedSnapshot } {
    return memoryRpc.memorySnapshot(this.methods, channelId);
  }

  memoryFile(
    channelId: string,
    path: string,
  ): {
    file?: {
      path: string;
      body: string;
      head: string;
      binary?: boolean;
      image?: import('../memory/image.js').MemoryImage;
      markdown?: import('../memory/markdown.js').MemoryMarkdown;
    };
  } {
    return memoryRpc.memoryFile(this.methods, channelId, path);
  }

  memoryHistory(channelId: string): { commits: MemoryAcceptedCommit[] } {
    return memoryRpc.memoryHistory(this.methods, channelId);
  }

  memoryDiff(channelId: string, sha: string): { sha: string; diff: string } {
    return memoryRpc.memoryDiff(this.methods, channelId, sha);
  }

  memoryGitGraph(channelId: string, offset: number): MemoryGitGraph {
    return memoryRpc.memoryGitGraph(this.methods, channelId, offset);
  }

  memoryGitCommitDiff(channelId: string, sha: string): MemoryGitCommitDiff {
    return memoryRpc.memoryGitCommitDiff(this.methods, channelId, sha);
  }

  memoryWorkingChanges(channelId: string): { changes: MemoryWorkingChange[] } {
    return memoryRpc.memoryWorkingChanges(this.methods, channelId);
  }

  memoryWorkingDiff(channelId: string, path: string, kind: MemoryWorkingKind): MemoryWorkingDiff {
    return memoryRpc.memoryWorkingDiff(this.methods, channelId, path, kind);
  }

  memoryRecoveryHistory(channelId: string): {
    checkpoints: MemoryRecoveryCheckpoint[];
  } {
    return memoryRpc.memoryRecoveryHistory(this.methods, channelId);
  }

  memoryRestore(
    channelId: string,
    checkpointId: string,
    expectedCurrentId: string,
  ): {
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  } {
    return memoryRpc.memoryRestore(this.methods, channelId, checkpointId, expectedCurrentId);
  }

  memoryRestoreCommit(
    channelId: string,
    sha: string,
    expectedHead: string,
    restoreId: string,
    name?: string,
  ): {
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  } {
    return memoryRpc.memoryRestoreCommit(
      this.methods,
      channelId,
      sha,
      expectedHead,
      restoreId,
      name,
    );
  }

  memoryNameVersion(channelId: string, sha: string, name: string): { version: MemoryVersionName } {
    return memoryRpc.memoryNameVersion(this.methods, channelId, sha, name);
  }

  memoryVersions(channelId: string): { versions: MemoryVersion[] } {
    return memoryRpc.memoryVersions(this.methods, channelId);
  }

  memoryRemoveVersionName(channelId: string, tag: string): { removed: true } {
    return memoryRpc.memoryRemoveVersionName(this.methods, channelId, tag);
  }

  memorySave(
    channelId: string,
    path: string,
    body: string,
    expectedHead: string,
    editId: string,
  ): { commit: MemoryAcceptedCommit } {
    return memoryRpc.memorySave(this.methods, channelId, path, body, expectedHead, editId);
  }

  memoryRepair(
    channelId: string,
    expectedHead: string,
    repairId: string,
  ): { repair: MemoryRepairEvent } {
    return memoryRpc.memoryRepair(this.methods, channelId, expectedHead, repairId);
  }

  overviewMemory(after?: string): Promise<OverviewMemory> {
    return memoryRpc.overviewMemory(this.methods, after);
  }

  overviewUsage(period: UsageOverviewPeriod, after?: string): OverviewUsage {
    return usageAdaptersRpc.overviewUsage(this.methods, period, after);
  }
  profileUsage(channelId: string, filter: UsageFilter): UsageQueryResult {
    return usageAdaptersRpc.profileUsage(this.methods, channelId, filter);
  }

  async profileActivity(
    channelId: string,
    before?: string,
    weeks?: number,
  ): Promise<ProfileActivity> {
    return activityRpc.profileActivity(this.methods, channelId, before, weeks);
  }

  async profileSessionUsage(channelId: string): Promise<ProfileSessionUsage> {
    return usageAdaptersRpc.profileSessionUsage(this.methods, channelId);
  }

  groupProfileActivity(channelId: string): GroupProfileActivity {
    return activityRpc.groupProfileActivity(this.methods, channelId);
  }

  rosterGet(): RosterSnapshot {
    return personabotsRpc.rosterGet(this.methods);
  }

  sectionCreate(name: string): Promise<{ section: RosterSection }> {
    return personabotsRpc.sectionCreate(this.methods, name);
  }

  sectionRename(sectionId: string, name: string): Promise<{ section: RosterSection }> {
    return personabotsRpc.sectionRename(this.methods, sectionId, name);
  }

  sectionRemove(sectionId: string): Promise<{ removed: boolean }> {
    return personabotsRpc.sectionRemove(this.methods, sectionId);
  }

  channelAssign(
    channelId: string,
    sectionId?: string | null,
    index?: number,
  ): Promise<Record<string, never>> {
    return personabotsRpc.channelAssign(this.methods, channelId, sectionId, index);
  }

  sectionReorder(order: string[]): Promise<{ sectionOrder: string[] }> {
    return personabotsRpc.sectionReorder(this.methods, order);
  }

  topReorder(order: TopOrderEntry[]): Promise<{ topOrder: TopOrderEntry[] }> {
    return personabotsRpc.topReorder(this.methods, order);
  }

  pinsSet(pins: string[]): Promise<{ pins: string[] }> {
    return personabotsRpc.pinsSet(this.methods, pins);
  }

  hiddenSet(hidden: string[]): Promise<{ hidden: string[] }> {
    return personabotsRpc.hiddenSet(this.methods, hidden);
  }
  channelMuteSet(channelId: string, muted: boolean): Promise<{ muted: string[] }> {
    return personabotsRpc.channelMuteSet(this.methods, channelId, muted);
  }

  rosterBatch(
    action: 'pin' | 'unpin' | 'hide' | 'move',
    channelIds: string[],
    sectionId?: string | null,
  ): Promise<RosterSnapshot> {
    return personabotsRpc.rosterBatch(this.methods, action, channelIds, sectionId);
  }

  developerModeSet(enabled: boolean): { accepted: boolean } {
    return diagnosticsAdaptersRpc.developerModeSet(this.methods, enabled);
  }

  async marketplaceList(query?: MarketplaceQuery): Promise<MarketplacePage> {
    return marketplaceRpc.marketplaceList(this.methods, query);
  }

  async marketplaceSubmit(url: string, altcha: string): Promise<{ bot: MarketplaceEntry }> {
    return marketplaceRpc.marketplaceSubmit(this.methods, url, altcha);
  }

  async marketplaceChallenge(): Promise<AltchaChallenge> {
    return marketplaceRpc.marketplaceChallenge(this.methods);
  }

  async marketplaceReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return marketplaceRpc.marketplaceReport(this.methods, id, altcha, reason);
  }

  async marketplaceAvatarReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return marketplaceRpc.marketplaceAvatarReport(this.methods, id, altcha, reason);
  }

  async marketplaceTopics(): Promise<MarketplaceTopic[]> {
    return marketplaceRpc.marketplaceTopics(this.methods);
  }

  async marketplaceSections(
    lang?: MarketplaceLanguage,
  ): Promise<{ sections: MarketplaceSection[] }> {
    return marketplaceRpc.marketplaceSections(this.methods, lang);
  }

  async marketplaceDigests(
    lang?: MarketplaceLanguage,
  ): Promise<{ digests: MarketplaceDigestSummary[] }> {
    return marketplaceRpc.marketplaceDigests(this.methods, lang);
  }

  async marketplaceDigest(
    day?: string,
    lang?: MarketplaceLanguage,
  ): Promise<{ digest: MarketplaceDigest }> {
    return marketplaceRpc.marketplaceDigest(this.methods, day, lang);
  }

  async marketplaceAvatarList(
    cursor?: string,
    q?: string,
    tag?: string,
    sort?: MarketplaceAvatarRanking,
  ): Promise<MarketplaceAvatarPage> {
    return marketplaceRpc.marketplaceAvatarList(this.methods, cursor, q, tag, sort);
  }

  async marketplaceAvatarTags(): Promise<MarketplaceAvatarTag[]> {
    return marketplaceRpc.marketplaceAvatarTags(this.methods);
  }

  async marketplaceAvatarDetail(id: string): Promise<MarketplaceAvatar> {
    return marketplaceRpc.marketplaceAvatarDetail(this.methods, id);
  }

  marketplaceAvatarApplyCandidates(): { bots: MarketplaceAvatarApplyCandidate[] } {
    return marketplaceRpc.marketplaceAvatarApplyCandidates(this.methods);
  }

  async marketplaceAvatarApply(
    id: string,
    bot: string,
    operationKey?: string,
  ): Promise<{ applied: true }> {
    return marketplaceRpc.marketplaceAvatarApply(this.methods, id, bot, operationKey);
  }

  marketplaceAvatarSource(bot: string): { image: string } {
    return marketplaceRpc.marketplaceAvatarSource(this.methods, bot);
  }

  async marketplaceAvatarPublish(
    name: string,
    image: string,
    requestKey: string,
    confirm: boolean,
    description?: string,
    tags?: string[],
    expectedAuthorId?: string,
  ): Promise<MarketplaceAvatar> {
    return marketplaceRpc.marketplaceAvatarPublish(
      this.methods,
      name,
      image,
      requestKey,
      confirm,
      description,
      tags,
      expectedAuthorId,
    );
  }

  async marketplaceAvatarMine(): Promise<{ avatars: MarketplaceAvatar[] }> {
    return marketplaceRpc.marketplaceAvatarMine(this.methods);
  }

  async marketplaceAvatarEdit(
    id: string,
    patch: MarketplaceAvatarEdit,
  ): Promise<MarketplaceAvatar> {
    return marketplaceRpc.marketplaceAvatarEdit(this.methods, id, patch);
  }

  async marketplaceAvatarDelete(id: string): Promise<{ deleted: true }> {
    return marketplaceRpc.marketplaceAvatarDelete(this.methods, id);
  }

  async marketplaceDetail(id: string, lang?: MarketplaceLanguage): Promise<MarketplaceDetail> {
    return marketplaceRpc.marketplaceDetail(this.methods, id, lang);
  }

  async marketplaceFileView(id: string, path: string): Promise<MarketplaceFileView> {
    return marketplaceRpc.marketplaceFileView(this.methods, id, path);
  }

  async marketplaceAccount(): Promise<MarketplaceAccount> {
    return marketplaceRpc.marketplaceAccount(this.methods);
  }

  async marketplaceAuthorSave(
    displayName: string,
    acceptTerms?: boolean,
  ): Promise<MarketplaceAuthorAccount> {
    return marketplaceRpc.marketplaceAuthorSave(this.methods, displayName, acceptTerms);
  }

  async marketplaceAuthorAvatarSet(avatar: string | null): Promise<MarketplaceAuthorAccount> {
    return marketplaceRpc.marketplaceAuthorAvatarSet(this.methods, avatar);
  }

  marketplaceUploadPlan(slug: string): UploadPlan {
    return marketplaceRpc.marketplaceUploadPlan(this.methods, slug);
  }

  async marketplaceUpload(
    slug: string,
    displayName: string,
    bio?: string,
    tags?: string[],
    replaces?: string,
  ): Promise<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }> {
    return marketplaceRpc.marketplaceUpload(this.methods, slug, displayName, bio, tags, replaces);
  }

  async marketplaceMine(lang?: MarketplaceLanguage): Promise<{ bots: MarketplaceAuthoredBot[] }> {
    return marketplaceRpc.marketplaceMine(this.methods, lang);
  }

  async marketplaceDelete(id: string): Promise<{ deleted: true }> {
    return marketplaceRpc.marketplaceDelete(this.methods, id);
  }

  async marketplaceInstallReview(id: string, lang?: 'en' | 'zh'): Promise<InstallReviewResult> {
    return marketplaceRpc.marketplaceInstallReview(this.methods, id, lang);
  }

  shareDraftStart(slug: string): ShareDraftView {
    return marketplaceRpc.shareDraftStart(this.methods, slug);
  }

  shareDraftGet(slug: string): ShareDraftView {
    return marketplaceRpc.shareDraftGet(this.methods, slug);
  }

  shareDraftFile(slug: string, path: string): { path: string; kind: string; text?: string } {
    return marketplaceRpc.shareDraftFile(this.methods, slug, path);
  }

  shareDraftDecide(
    slug: string,
    path: string,
    decision: 'keep' | 'drop' | 'rewrite',
    text?: string,
  ): ShareDraftView {
    return marketplaceRpc.shareDraftDecide(this.methods, slug, path, decision, text);
  }

  shareDraftFinish(slug: string): ShareDraftView {
    return marketplaceRpc.shareDraftFinish(this.methods, slug);
  }

  shareDraftDiscard(slug: string): { discarded: boolean } {
    return marketplaceRpc.shareDraftDiscard(this.methods, slug);
  }

  async shareDraftExport(slug: string): Promise<{ path: string; files: number }> {
    return marketplaceRpc.shareDraftExport(this.methods, slug);
  }

  async marketplaceInstall(
    id: string,
    reviewId: string,
    operationKey?: string,
    source?: MarketplaceInstallSource,
  ): Promise<{
    bot: PersonaBotDetail;
    channelId: string;
    receipt?: BotCreationReceipt;
    listing: MarketplaceEntry;
  }> {
    return marketplaceRpc.marketplaceInstall(this.methods, id, reviewId, operationKey, source);
  }

  async releaseInfo(since?: string): Promise<ReleaseInfo> {
    return releaseAdaptersRpc.releaseInfo(this.methods, since);
  }

  async releaseUpdate(force?: boolean): Promise<ReleaseUpdate> {
    return releaseAdaptersRpc.releaseUpdate(this.methods, force);
  }

  async releaseInstall(version: string, requestId?: string): Promise<ReleaseInstall> {
    return releaseAdaptersRpc.releaseInstall(this.methods, version, requestId);
  }

  async releaseRestart(): Promise<ReleaseRestart> {
    return releaseAdaptersRpc.releaseRestart(this.methods);
  }

  async pluginUpdates(force?: boolean): Promise<PluginUpdates> {
    return releaseAdaptersRpc.pluginUpdates(this.methods, force);
  }

  async pluginInstall(name: string, version: string, requestId?: string): Promise<PluginInstall> {
    return releaseAdaptersRpc.pluginInstall(this.methods, name, version, requestId);
  }

  async pluginRestart(): Promise<PluginRestart> {
    return releaseAdaptersRpc.pluginRestart(this.methods);
  }

  updateRun(id?: string): UpdateRun | null {
    return releaseAdaptersRpc.updateRun(this.methods, id);
  }

  async updateCancel(id: string): Promise<UpdateCancel> {
    return releaseAdaptersRpc.updateCancel(this.methods, id);
  }

  telemetryStatus(): TelemetryStatus {
    return diagnosticsAdaptersRpc.telemetryStatus(this.methods);
  }

  gitStatus(): GitStatus {
    return diagnosticsAdaptersRpc.gitStatus(this.methods);
  }

  gitInstall(): GitStatus {
    return diagnosticsAdaptersRpc.gitInstall(this.methods);
  }

  telemetrySet(enabled: boolean): TelemetryStatus {
    return diagnosticsAdaptersRpc.telemetrySet(this.methods, enabled);
  }

  takeoverList(query: {
    slug?: string;
    channelId?: string;
    pendingOnly?: boolean;
    limit?: number;
  }): { takeovers: TakeoverHandoff[] } {
    return takeoverAdaptersRpc.takeoverList(this.methods, query);
  }

  takeoverStatus(channelId: string, messageId: string): { takeover: TakeoverHandoff } {
    return takeoverAdaptersRpc.takeoverStatus(this.methods, channelId, messageId);
  }

  async takeoverRequest(
    slug: string,
    input: { channelId?: string; target: string; title: string; message: string; minutes?: number },
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverAdaptersRpc.takeoverRequest(this.methods, slug, input);
  }

  async takeoverComplete(
    channelId: string,
    messageId: string,
    outcome: 'done' | 'failed',
    surface?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverAdaptersRpc.takeoverComplete(
      this.methods,
      channelId,
      messageId,
      outcome,
      surface,
    );
  }

  async takeoverCancel(
    channelId: string,
    messageId: string,
    surface?: string,
    bot?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return takeoverAdaptersRpc.takeoverCancel(this.methods, channelId, messageId, surface, bot);
  }

  scheduleList(slug: string): { schedules: BotSchedule[] } {
    return schedulesRpc.scheduleList(this.methods, slug);
  }
  scheduleCreate(slug: string, input: BotScheduleInput): { schedule: BotSchedule } {
    return schedulesRpc.scheduleCreate(this.methods, slug, input);
  }
  scheduleUpdate(slug: string, id: string, change: BotScheduleChange): { schedule: BotSchedule } {
    return schedulesRpc.scheduleUpdate(this.methods, slug, id, change);
  }
  scheduleDelete(slug: string, id: string): { removed: boolean } {
    return schedulesRpc.scheduleDelete(this.methods, slug, id);
  }
  scheduleHistory(slug: string, id: string): { firings: BotScheduleFiring[] } {
    return schedulesRpc.scheduleHistory(this.methods, slug, id);
  }
  scheduleRunNow(slug: string, id: string): { firing: BotScheduleFiring } {
    return schedulesRpc.scheduleRunNow(this.methods, slug, id);
  }
  schedulePreview(trigger: BotScheduleTrigger): { occurrences: string[] } {
    return schedulesRpc.schedulePreview(this.methods, trigger);
  }
}

markRemoteMethods(BotharnessBridgeService.prototype, [
  'botVisibility',
  'botVisibilitySet',
  'botSwitches',
  'reachableBots',
  'botProactiveOptOut',
  'roleConflicts',
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
  'acknowledgements',
  'acknowledge',
  'onboardingModel',
  'telemetryEvent',
  'modelPlanInherit',
  'channelRetry',
  'botNewSession',
  'botCompact',
  'botContext',
  'botSystemPrompt',
  'botTurnInput',
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
  'ping',
  'humanIdentity',
  'composerIdentity',
  'composerValidate',
  'humanNameSet',
  'humanAvatarSet',
  'humanAvatars',
  'humanProfileSetupFinish',
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
  'channelGenuiView',
  'channelGenuiViewSave',
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
  'sessionTranscript',
  'sessionModel',
  'sessionLive',
  'sessionToolDetail',
  'workspaceOptions',
  'messageAttachmentTarget',
  'channelMediaTarget',
  'workspaceFileTarget',
  'folderBrowse',
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
  'promptParts',
  'promptPresets',
  'promptPresetCreate',
  'promptPresetUpdate',
  'promptPresetDelete',
  'promptGlobalSet',
  'botPrompt',
  'botPromptSet',
  'approvalTemplateCreate',
  'approvalTemplateUpdate',
  'approvalTemplateDeletePreview',
  'approvalTemplateDelete',
  'approvalTemplateGlobalSet',
  'botApprovalTemplateSet',
  'approvalReviewerModel',
  'approvalReviewerModelSet',
  'voiceProviders',
  'voiceProviderAdd',
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
  'releaseInfo',
  'releaseUpdate',
  'releaseInstall',
  'releaseRestart',
  'pluginUpdates',
  'pluginInstall',
  'pluginRestart',
  'updateRun',
  'updateCancel',
  'telemetryStatus',
  'telemetrySet',
  'gitStatus',
  'gitInstall',
  'scheduleList',
  'takeoverList',
  'takeoverStatus',
  'takeoverRequest',
  'takeoverComplete',
  'takeoverCancel',
  'scheduleCreate',
  'scheduleUpdate',
  'scheduleDelete',
  'scheduleHistory',
  'scheduleRunNow',
  'schedulePreview',
  'channelJournalPage',
  'channelFilesPage',
  'channelChanges',
  'channelChangeCursor',
  'channelListChanges',
]);
markRemoteStreams(BotharnessBridgeService.prototype, [
  'followRoster',
  'followActivity',
  'followChannel',
  'followCompanion',
]);

export function registerBridge(
  ctx: Context,
  methods: InvocationBridgeMethods,
  privateInputs?: PrivateInputs,
  live?: BridgeLive,
  team?: TeamService,
): BotharnessBridgeService {
  return new BotharnessBridgeService(ctx, methods, privateInputs, live, team);
}
