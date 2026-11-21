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
import { toRemoteError, unwrap, unwrapAsync, type AdminResult } from './rpc-result.js';
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
import type { BotModesView } from './bot-modes.js';
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
    return unwrapAsync(this.methods.spaceAudienceDirectory({}));
  }
  spaces() {
    return unwrapAsync(this.methods.spaces({}));
  }
  botVisibility(slug: string) {
    return unwrapAsync(this.methods.botVisibility({ slug }));
  }
  botVisibilitySet(
    slug: string,
    visibility: import('../team/bot-contract.js').BotVisibility,
    confirm?: boolean,
  ) {
    return unwrapAsync(this.methods.botVisibilitySet({ slug, visibility, confirm }));
  }
  botSwitches(
    slug: string,
    proactiveDms?: boolean,
    joinPrincipalChannels?: boolean,
    speakerContext?: boolean,
  ) {
    return unwrapAsync(
      this.methods.botSwitches({
        slug,
        ...(proactiveDms === undefined ? {} : { proactiveDms }),
        ...(joinPrincipalChannels === undefined ? {} : { joinPrincipalChannels }),
        ...(speakerContext === undefined ? {} : { speakerContext }),
      }),
    );
  }
  reachableBots() {
    return unwrapAsync(this.methods.reachableBots({}));
  }
  botProactiveOptOut(slug: string, optOut: boolean) {
    return unwrapAsync(this.methods.botProactiveOptOut({ slug, optOut }));
  }
  roleConflicts(humanId?: string, username?: string) {
    return unwrapAsync(this.methods.roleConflicts({ humanId, username }));
  }
  speakerPolicy(humanId?: string, topic?: string) {
    return unwrapAsync(this.methods.speakerPolicy({ humanId, topic }));
  }
  spaceCreate(name: string, audience: SpaceAudience) {
    return unwrapAsync(this.methods.spaceCreate({ name, audience }));
  }
  spaceUpdate(spaceId: string, name?: string, audience?: SpaceAudience) {
    return unwrapAsync(this.methods.spaceUpdate({ spaceId, name, audience }));
  }
  spaceDelete(spaceId: string, confirm: boolean) {
    return unwrapAsync(this.methods.spaceDelete({ spaceId, confirm }));
  }
  modelsAllowed() {
    return unwrapAsync(this.methods.modelsAllowed({}));
  }
  usageByMember(period: UsageOverviewPeriod) {
    return unwrap(this.methods.usageByMember({ period }));
  }
  privateObjects(humanId?: string, kind?: PrivateKind, username?: string) {
    return unwrapAsync(this.methods.privateObjects({ humanId, kind, username }));
  }
  privateContentOpen(kind: PrivateKind, objectId: string, reason?: string) {
    return unwrapAsync(this.methods.privateContentOpen({ kind, objectId, reason }));
  }
  privateContentPage(viewId: string, before: string) {
    return unwrapAsync(this.methods.privateContentPage({ viewId, before }));
  }
  auditLog(after?: string, limit?: number) {
    return unwrapAsync(this.methods.auditLog({ after, limit }));
  }
  auditVerify() {
    return unwrapAsync(this.methods.auditVerify({}));
  }
  teamMode() {
    return unwrapAsync(this.methods.teamMode({}));
  }
  teamModeSet(enabled: boolean) {
    return unwrapAsync(this.methods.teamModeSet({ enabled }));
  }
  teamOwnerPasswordSet(password: string, current?: string) {
    return unwrapAsync(this.methods.teamOwnerPasswordSet({ password, current }));
  }
  teamInsecureHttpSet(allowed: boolean) {
    return unwrapAsync(this.methods.teamInsecureHttpSet({ allowed }));
  }
  members() {
    return unwrapAsync(this.methods.members({}));
  }
  memberCreate(username: string, displayName: string, roleIds?: string[]) {
    return unwrapAsync(this.methods.memberCreate({ username, displayName, roleIds }));
  }
  permissionCatalog() {
    return unwrapAsync(this.methods.permissionCatalog({}));
  }
  roles() {
    return unwrapAsync(this.methods.roles({}));
  }
  roleCreate(
    name: string,
    permissions: string[],
    models?: import('../team/permissions.js').RoleModels,
    policy?: import('../team/bot-contract.js').RolePolicy,
  ) {
    return unwrapAsync(this.methods.roleCreate({ name, permissions, models, policy }));
  }
  roleUpdate(
    roleId: string,
    name?: string,
    permissions?: string[],
    models?: import('../team/permissions.js').RoleModels,
    policy?: import('../team/bot-contract.js').RolePolicy,
  ) {
    return unwrapAsync(this.methods.roleUpdate({ roleId, name, permissions, models, policy }));
  }
  roleDelete(roleId: string) {
    return unwrapAsync(this.methods.roleDelete({ roleId }));
  }
  memberRolesSet(humanId: string, roleIds: string[]) {
    return unwrapAsync(this.methods.memberRolesSet({ humanId, roleIds }));
  }
  memberDevices(humanId: string) {
    const principal = this.ctx.invocation?.peer.principal;
    return unwrapAsync(
      this.methods.memberDevices(
        { humanId },
        principal?.kind === 'botharness-member' ? principal.grantId : undefined,
      ),
    );
  }
  memberDeviceRevoke(humanId: string, grantId: string) {
    return unwrapAsync(this.methods.memberDeviceRevoke({ humanId, grantId }));
  }
  ownerTransfer(humanId: string, password: string) {
    return unwrapAsync(this.methods.ownerTransfer({ humanId, password }));
  }
  memberPasswordChange(current: string, next: string, signOutOthers?: boolean) {
    const principal = this.ctx.invocation?.peer.principal;
    if (principal?.kind === 'botharness-member' && this.team)
      return this.team.withPasswordCaller(principal, undefined, () =>
        unwrapAsync(this.methods.memberPasswordChange({ current, next, signOutOthers })),
      );
    return unwrapAsync(this.methods.memberPasswordChange({ current, next, signOutOthers }));
  }
  memberInvitation(humanId: string) {
    return unwrapAsync(this.methods.memberInvitation({ humanId }));
  }
  memberPairingOffer() {
    return unwrapAsync(this.methods.memberPairingOffer({}));
  }
  memberPasswordReset(humanId: string) {
    return unwrapAsync(this.methods.memberPasswordReset({ humanId }));
  }
  channelRoleDirectory(channelId: string) {
    return unwrapAsync(this.methods.channelRoleDirectory({ channelId }));
  }
  channelVisibilitySet(channelId: string, visibility: ChannelVisibility) {
    return unwrapAsync(this.methods.channelVisibilitySet({ channelId, visibility }));
  }
  channelAdminsSet(channelId: string, humanIds: string[]) {
    return unwrapAsync(this.methods.channelAdminsSet({ channelId, humanIds }));
  }
  channelPolicySet(channelId: string, policy: ChannelPolicy, expectedRevision?: string) {
    return unwrapAsync(
      this.methods.channelPolicySet({
        channelId,
        policy,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      }),
    );
  }
  channelMemberCandidates(channelId: string, query?: string) {
    return unwrapAsync(
      this.methods.channelMemberCandidates({
        channelId,
        ...(query === undefined ? {} : { query }),
      }),
    );
  }
  channelHumanAdd(channelId: string, humanId: string) {
    return unwrapAsync(this.methods.channelHumanAdd({ channelId, humanId }));
  }
  channelDescriptionSet(channelId: string, description: string) {
    return unwrapAsync(this.methods.channelDescriptionSet({ channelId, description }));
  }
  teamDirectory() {
    return unwrapAsync(this.methods.teamDirectory({}));
  }
  humanDm(humanId: string) {
    return unwrapAsync(this.methods.humanDm({ humanId }));
  }
  humanDmByUsername(username: string) {
    return unwrapAsync(this.methods.humanDmByUsername({ username }));
  }
  memberDeactivate(humanId: string) {
    return unwrapAsync(this.methods.memberDeactivate({ humanId }));
  }
  memberReactivate(humanId: string) {
    return unwrapAsync(this.methods.memberReactivate({ humanId }));
  }
  memberTransferPreview(humanId: string) {
    return unwrapAsync(this.methods.memberTransferPreview({ humanId }));
  }
  memberTransfer(humanId: string, toHumanId: string) {
    return unwrapAsync(this.methods.memberTransfer({ humanId, toHumanId }));
  }
  memberPurgePreview(humanId: string) {
    return unwrapAsync(this.methods.memberPurgePreview({ humanId }));
  }
  memberPurgeConfirm(humanId: string, token: string, username: string) {
    return unwrapAsync(this.methods.memberPurgeConfirm({ humanId, token, username }));
  }
  channelPublicSet(channelId: string, publicValue: boolean) {
    return unwrapAsync(this.methods.channelPublicSet({ channelId, public: publicValue }));
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
    const page = this.live?.journalPage(this.invocationHuman(), channelId, {
      through,
      before,
      limit,
    });
    if (page === undefined)
      throw toRemoteError({
        code: 'not-found',
        message: 'Channel journal page is unavailable',
      });
    return this.team?.approvals.project(this.invocationHuman(), page, channelId) ?? page;
  }

  channelFilesPage(channelId: string, before?: number, limit?: number): ChannelFilesPage {
    const page = this.live?.filesPage(this.invocationHuman(), channelId, { before, limit });
    if (page === undefined)
      throw toRemoteError({
        code: 'not-found',
        message: 'Channel files page is unavailable',
      });
    return this.team?.approvals.project(this.invocationHuman(), page, channelId) ?? page;
  }

  channelChanges(
    channelId: string,
    sinceSeq: number,
    epoch?: string,
    limit?: number,
  ): ChannelChanges {
    const changes = this.live?.changes(this.invocationHuman(), channelId, {
      sinceSeq,
      epoch,
      limit,
    });
    if (changes === undefined)
      throw toRemoteError({ code: 'not-found', message: 'Channel changes are unavailable' });
    return this.team?.approvals.project(this.invocationHuman(), changes, channelId) ?? changes;
  }

  channelChangeCursor(): ChannelChangeCursor {
    const cursor = this.live?.changeCursor(this.invocationHuman());
    if (cursor === undefined)
      throw toRemoteError({ code: 'unavailable', message: 'Channel changes are unavailable' });
    return cursor;
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
    return unwrapAsync(this.methods.tobHome({}));
  }
  onboarding(slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot> {
    return unwrapAsync(this.methods.onboarding({ slug, action }));
  }
  acknowledgements(): { items: Record<string, string> } {
    return unwrap(this.methods.acknowledgements({}));
  }
  acknowledge(key: string, value?: string): { key: string; value: string } {
    return unwrap(this.methods.acknowledge(value === undefined ? { key } : { key, value }));
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
    return unwrapAsync(
      this.methods.onboardingModel({
        slug,
        expectedRevision,
        ...(route === undefined ? {} : { route }),
        globalDefault,
        expectedDefaultRevision,
        ...(groupId === undefined ? {} : { groupId }),
        ...(groupEffort === undefined ? {} : { groupEffort }),
        ...(expectedDefaultGroupRevision === undefined ? {} : { expectedDefaultGroupRevision }),
      }),
    );
  }
  telemetryEvent(event: string, properties?: Record<string, string | boolean>): null {
    return unwrap(this.methods.telemetryEvent({ event, properties: properties ?? {} }));
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
    return unwrapAsync(
      this.methods.channelRetry({
        channelId,
        messageId,
        recovery,
        failureMessageId,
      }),
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
    return unwrapAsync(
      this.methods.botTurnInput({
        slug,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(turns === undefined ? {} : { turns }),
      }),
    );
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
    return unwrapAsync(this.methods.sessionMessageSend({ botSlug, sessionId, text }));
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

  engineAccountLogin(id: string, engine?: string) {
    return modelsRpc.engineAccountLogin(this.methods, id, engine);
  }

  engineAccountLoginCancel(id: string) {
    return modelsRpc.engineAccountLoginCancel(this.methods, id);
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

  modelPresets(includeUsage?: boolean): { presets: ModelPreset[]; usage?: ModelPresetUsage[] } {
    return modelsRpc.modelPresets(this.methods, includeUsage);
  }

  modelPresetDelete(id: string, expectedRevision: number, confirmed: boolean): { id: string } {
    return modelsRpc.modelPresetDelete(this.methods, id, expectedRevision, confirmed);
  }

  modelPresetCreate(
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
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
    );
  }

  modelPresetUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
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
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
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
    );
  }

  list(
    query?: string,
    administration?: boolean,
  ): { bots: Array<PersonaBotSummary | SharedBotSummary | BotMetadata> } {
    return unwrap(
      this.methods.list({ query, ...(administration === undefined ? {} : { administration }) }),
    );
  }

  activitySnapshot(): PersonaBotActivitySnapshot {
    return activityRpc.activitySnapshot(this.methods);
  }

  get(slug: string): AdminResult<{ bot: PersonaBotDetail; profileFingerprint: string }> {
    return unwrap(this.methods.get({ slug }));
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
    return unwrap(
      this.methods.create({
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
      }),
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
    return unwrap(
      this.methods.createLookup({
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
      }),
    );
  }

  async botImportPreview(
    gitUrl: string,
  ): Promise<Awaited<ReturnType<BotImportsService['previewGit']>>> {
    return unwrapAsync(this.methods.botImportPreview({ gitUrl }));
  }
  botImportLookup(
    operationKey: string,
    gitUrl: string,
    expectedCommit: string,
    displayName: string,
    roles?: string[],
    description?: string,
  ): { receipt: BotCreationReceipt | null } {
    return unwrap(
      this.methods.botImportLookup({
        operationKey,
        gitUrl,
        expectedCommit,
        displayName,
        roles,
        description,
      }),
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
    return unwrapAsync(
      this.methods.createFromGit({
        displayName,
        gitUrl,
        roles,
        description,
        origin,
        operationKey,
        expectedCommit,
        listingId,
      }),
    );
  }

  update(
    slug: string,
    patch: PersonaBotPatch,
    expectedProfile?: string,
  ): AdminResult<{ bot: PersonaBotDetail }> {
    return unwrap(this.methods.update({ slug, patch, expectedProfile }));
  }

  dataResetPreview(): { preview: DataResetPreview } {
    return unwrap(this.methods.dataResetPreview());
  }
  dataResetConfirm(token: string): { reset: DataResetResult } {
    return unwrap(this.methods.dataResetConfirm({ token }));
  }
  deletionPreview(
    slug: string,
  ): AdminResult<
    { preview: PersonaBotDeletionPreview },
    BotMetadataResult & { preview: AdminDeletionPreview }
  > {
    return unwrap(this.methods.deletionPreview({ slug }));
  }
  async deletionConfirm(
    slug: string,
    token: string,
    eraseMemory: boolean,
  ): Promise<
    AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
  > {
    return unwrapAsync(this.methods.deletionConfirm({ slug, token, eraseMemory }));
  }
  async deletionRetry(
    slug: string,
  ): Promise<
    AdminResult<{ deletion: PersonaBotDeletion }, BotMetadataResult & { deletion: AdminDeletion }>
  > {
    return unwrapAsync(this.methods.deletionRetry({ slug }));
  }
  deletionMemoryFolder(slug: string): AdminResult<{
    target: { path: string; relativePath: string; kind: 'directory' };
  }> {
    return unwrap(this.methods.deletionMemoryFolder({ slug }));
  }
  pause(slug: string): AdminResult<{ bot: PersonaBotDetail }> {
    return unwrap(this.methods.pause({ slug }));
  }

  resume(slug: string): AdminResult<{ bot: PersonaBotDetail }> {
    return unwrap(this.methods.resume({ slug }));
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
    return unwrapAsync(this.methods.botModes(slug === undefined ? {} : { slug }));
  }

  botModeDefaultSet(mode: string | null): Promise<BotModesView> {
    return unwrapAsync(this.methods.botModeDefaultSet({ mode }));
  }

  botModeSet(slug: string, mode: string | null): Promise<BotModesView> {
    return unwrapAsync(this.methods.botModeSet({ slug, mode }));
  }

  botModeTemplateSave(name: string, modes: string[], id?: string): Promise<BotModesView> {
    return unwrapAsync(
      this.methods.botModeTemplateSave({ name, modes, ...(id === undefined ? {} : { id }) }),
    );
  }

  botModeTemplateDelete(id: string): Promise<BotModesView> {
    return unwrapAsync(this.methods.botModeTemplateDelete({ id }));
  }

  botModeTemplateSet(slug: string, template: string | null): Promise<BotModesView> {
    return unwrapAsync(this.methods.botModeTemplateSet({ slug, template }));
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
    return unwrap(this.methods.standingLimitsSet({ slug, soul, coreMemory }));
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
    return unwrap(await this.methods.channels({}));
  }

  async channelListChanges(sinceSeq: number, epoch?: string): Promise<ChannelListChanges> {
    return unwrap(await this.methods.channelListChanges({ sinceSeq, epoch }));
  }

  channelDm(
    slug: string,
    displayName?: string,
  ): { channel: ChannelRecord & { readOnly?: boolean } } {
    return unwrap(this.methods.channelDm({ slug, displayName }));
  }

  channelGet(channelId: string) {
    return unwrap(this.methods.channelGet({ channelId }));
  }

  channelCreate(
    name: string,
    members: string[],
    operationKey?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return unwrap(this.methods.channelCreate({ name, members, operationKey }));
  }

  channelRename(
    channelId: string,
    name: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord; bot?: PersonaBotDetail } {
    return unwrap(
      this.methods.channelRename({
        channelId,
        name,
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  channelGroupAvatarSet(
    channelId: string,
    avatar: string | null,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return unwrap(
      this.methods.channelGroupAvatarSet({
        channelId,
        avatar,
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  channelGroupInvite(
    channelId: string,
    botSlug: string,
    operationKey?: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } | ChannelManagementResult {
    return unwrap(
      this.methods.channelGroupInvite({
        channelId,
        botSlug,
        operationKey,
        expectedChannel,
      }),
    );
  }

  channelGroupInviteCancel(
    channelId: string,
    invitationId: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return unwrap(
      this.methods.channelGroupInviteCancel({
        channelId,
        invitationId,
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  channelGroupJoinDecide(
    channelId: string,
    requestId: string,
    accept: boolean,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return unwrap(
      this.methods.channelGroupJoinDecide({
        channelId,
        requestId,
        accept,
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  channelGroupMemberRemove(
    channelId: string,
    botSlug: string,
    expectedChannel?: string,
  ): { channel: ChannelRecord } {
    return unwrap(
      this.methods.channelGroupMemberRemove({
        channelId,
        botSlug,
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  channelGroupSendReview(channelId: string, enabled?: boolean): { enabled: boolean } {
    return unwrap(this.methods.channelGroupSendReview({ channelId, enabled }));
  }

  channelGroupWakePolicies(channelId: string): {
    members: GroupMemberWakePolicy[];
  } {
    return unwrap(this.methods.channelGroupWakePolicies({ channelId }));
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
    return unwrap(
      this.methods.channelGroupWakeSet({
        channelId,
        botSlug,
        mode,
        count,
        intervalSeconds,
        ...(inherit === undefined ? {} : { inherit }),
        ...(expectedChannel === undefined ? {} : { expectedChannel }),
      }),
    );
  }

  ping() {
    return unwrap(this.methods.ping({}));
  }

  humanIdentity() {
    return unwrap(this.methods.humanIdentity({}));
  }

  composerIdentity() {
    return unwrap(this.methods.composerIdentity({}));
  }

  composerValidate(
    channelId: string,
    attachments: ChannelAttachmentRef[],
    replyTo?: string,
    quotes?: Array<{ messageId: string; text?: string }>,
  ) {
    return unwrap(
      this.methods.composerValidate({
        channelId,
        attachments,
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(quotes === undefined ? {} : { quotes }),
      }),
    );
  }

  channelHumanNameSet(channelId: string, nickname: string | null) {
    return unwrap(this.methods.channelHumanNameSet({ channelId, nickname }));
  }

  humanNameSet(displayName: string | null) {
    return unwrap(this.methods.humanNameSet({ displayName }));
  }

  humanAvatarSet(avatar: string | null) {
    return unwrap(this.methods.humanAvatarSet({ avatar }));
  }

  humanAvatars(humanIds: string[]) {
    return unwrap(this.methods.humanAvatars({ humanIds }));
  }

  humanProfileSetupFinish() {
    return unwrap(this.methods.humanProfileSetupFinish({}));
  }

  channelGroupDelete(channelId: string): { deleted: boolean } & GroupDisbandResult {
    return unwrap(this.methods.channelGroupDelete({ channelId }));
  }

  channelHistory(): { channels: ChannelHistoryItem[] } {
    return unwrap(this.methods.channelHistory({}));
  }
  channelHistorySources(
    channelId: string,
    before?: string,
  ): { sources: PurgeSource[]; before?: string } {
    return unwrap(
      this.methods.channelHistorySources({
        channelId,
        ...(before === undefined ? {} : { before }),
      }),
    );
  }
  storageUsage(): StorageUsage {
    return unwrap(this.methods.storageUsage({}));
  }
  storageCleanupPreview(
    before: string,
    channelIds?: string[],
    kinds?: StorageMediaKind[],
  ): MediaCleanupPreview {
    return unwrap(
      this.methods.storageCleanupPreview({
        before,
        ...(channelIds === undefined ? {} : { channelIds }),
        ...(kinds === undefined ? {} : { kinds }),
      }),
    );
  }
  storageCleanupConfirm(
    before: string,
    channelIds: string[] | undefined,
    kinds: StorageMediaKind[] | undefined,
    token: string,
  ): MediaCleanupResult {
    return unwrap(
      this.methods.storageCleanupConfirm({
        before,
        ...(channelIds === undefined ? {} : { channelIds }),
        ...(kinds === undefined ? {} : { kinds }),
        token,
      }),
    );
  }
  storageMessagesCleanupPreview(before: string, channelIds?: string[]): TextCleanupPreview {
    return unwrap(
      this.methods.storageMessagesCleanupPreview({
        before,
        ...(channelIds === undefined ? {} : { channelIds }),
      }),
    );
  }
  storageMessagesCleanupConfirm(
    before: string,
    channelIds: string[] | undefined,
    token: string,
  ): TextCleanupResult {
    return unwrap(
      this.methods.storageMessagesCleanupConfirm({
        before,
        ...(channelIds === undefined ? {} : { channelIds }),
        token,
      }),
    );
  }
  channelPurgePreview(channelId: string, sourceEventIds: string[]): PurgePreview {
    return unwrap(this.methods.channelPurgePreview({ channelId, sourceEventIds }));
  }
  channelPurgeConfirm(
    channelId: string,
    sourceEventIds: string[],
    token: string,
  ): { accepted: number } {
    return unwrap(this.methods.channelPurgeConfirm({ channelId, sourceEventIds, token }));
  }

  channelMessages(
    channelId: string,
    before?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; revision: number } {
    return unwrap(this.methods.channelMessages({ channelId, before, limit }));
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
    return unwrap(
      this.methods.channelTimeline({
        channelId,
        direction,
        cursor,
        around,
        limit,
        olderLimit,
        newerLimit,
      }),
    );
  }

  channelReadPosition(channelId: string): { position?: ChannelReadPosition } {
    return unwrap(this.methods.channelReadPosition({ channelId }));
  }

  async channelMarkAllRead(channelId?: string, botSlug?: string): Promise<{ channels: number }> {
    return unwrap(await this.methods.channelMarkAllRead({ channelId, botSlug }));
  }
  async channelMarkRead(
    channelId: string,
    messageId: string,
  ): Promise<{ position: ChannelReadPosition }> {
    return unwrap(await this.methods.channelMarkRead({ channelId, messageId }));
  }

  channelReact(
    channelId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): { reactions: ChannelReaction[] } {
    return unwrap(this.methods.channelReact({ channelId, messageId, emoji, active }));
  }

  channelSearch(
    channelId: string,
    text: string,
    cursor?: string,
    limit?: number,
  ): { messages: ChannelMessage[]; nextCursor?: string } {
    return unwrap(this.methods.channelSearch({ channelId, text, cursor, limit }));
  }

  messageSearch(text: string, cursor?: string, limit?: number): HumanMessageSearchPage {
    return unwrap(this.methods.messageSearch({ text, cursor, limit }));
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
    return unwrap(this.methods.channelAllBotPreview({ channelId }));
  }
  async tobCli(
    action: 'start' | 'status' | 'cancel',
    command?: TobCliCommand,
    id?: string,
  ): Promise<TobCliStatus> {
    return unwrap(
      await this.methods.tobCli(action === 'start' ? { action, command } : { action, id }),
    );
  }

  channelSendStatus(channelId: string, messageId: string): ChannelSendStatus {
    return unwrap(this.methods.channelSendStatus({ channelId, messageId }));
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
    return unwrap(
      await this.methods.channelSend({
        ...(skillInvocations === undefined ? {} : { skillInvocations }),
        ...(quotes === undefined ? {} : { quotes }),
        channelId,
        body,
        ...(allBotMention === undefined ? {} : { allBotMention }),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(attachments === undefined ? {} : { attachments }),
        ...(messageId === undefined ? {} : { messageId }),
        ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
        ...(mentions === undefined ? {} : { mentions }),
        ...(channelRefs === undefined ? {} : { channelRefs }),
        ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
        ...(assignmentReply === undefined ? {} : { assignmentReply }),
        ...(genuiReply === undefined ? {} : { genuiReply }),
      }),
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
    return unwrap(this.methods.workspaceOptions({}));
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
    return unwrap(this.methods.messageAttachmentTarget({ channelId, messageId, fileId }));
  }

  folderBrowse(path?: string, offset?: number): Promise<FolderListing> {
    return unwrapAsync(
      this.methods.folderBrowse({
        ...(path === undefined ? {} : { path }),
        ...(offset === undefined ? {} : { offset }),
      }),
    );
  }

  workspaceFileTarget(
    slug: string,
    grantId: string,
  ): { target: { path: string; relativePath: ''; kind: 'directory' } } {
    return unwrap(this.methods.workspaceFileTarget({ slug, grantId }));
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

  sessions(slug: string): { sessions: OwnedSessionSummary[] } {
    return sessionsRpc.sessions(this.methods, slug);
  }

  botToolTrace(
    slug: string,
    sessionId?: string,
    turns?: number,
  ): Promise<{ slug: string; sessionId: string; turns: TurnTrace[] }> {
    return sessionsRpc.botToolTrace(this.methods, slug, sessionId, turns);
  }

  botTools(): { sessionId: 'direct'; tools: DirectBotToolSpec[] } {
    return unwrap(this.methods.botTools({}));
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
    return unwrapAsync(
      this.methods.botToolRun({
        slug,
        tool,
        ...(args === undefined ? {} : { args }),
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(sourceEventId === undefined ? {} : { sourceEventId }),
      }),
    );
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
    return unwrap(this.methods.overviewUsage({ period, after }));
  }
  profileUsage(channelId: string, filter: UsageFilter): UsageQueryResult {
    return unwrap(this.methods.profileUsage({ channelId, filter }));
  }

  async profileActivity(
    channelId: string,
    before?: string,
    weeks?: number,
  ): Promise<ProfileActivity> {
    return activityRpc.profileActivity(this.methods, channelId, before, weeks);
  }

  async profileSessionUsage(channelId: string): Promise<ProfileSessionUsage> {
    return unwrap(await this.methods.profileSessionUsage({ channelId }));
  }

  groupProfileActivity(channelId: string): GroupProfileActivity {
    return activityRpc.groupProfileActivity(this.methods, channelId);
  }

  rosterGet(): RosterSnapshot {
    return unwrap(this.methods.rosterGet({}));
  }

  sectionCreate(name: string): Promise<{ section: RosterSection }> {
    return unwrapAsync(this.methods.sectionCreate({ name }));
  }

  sectionRename(sectionId: string, name: string): Promise<{ section: RosterSection }> {
    return unwrapAsync(this.methods.sectionRename({ sectionId, name }));
  }

  sectionRemove(sectionId: string): Promise<{ removed: boolean }> {
    return unwrapAsync(this.methods.sectionRemove({ sectionId }));
  }

  channelAssign(
    channelId: string,
    sectionId?: string | null,
    index?: number,
  ): Promise<Record<string, never>> {
    return unwrapAsync(this.methods.channelAssign({ channelId, sectionId, index }));
  }

  sectionReorder(order: string[]): Promise<{ sectionOrder: string[] }> {
    return unwrapAsync(this.methods.sectionReorder({ order }));
  }

  topReorder(order: TopOrderEntry[]): Promise<{ topOrder: TopOrderEntry[] }> {
    return unwrapAsync(this.methods.topReorder({ order }));
  }

  pinsSet(pins: string[]): Promise<{ pins: string[] }> {
    return unwrapAsync(this.methods.pinsSet({ pins }));
  }

  hiddenSet(hidden: string[]): Promise<{ hidden: string[] }> {
    return unwrapAsync(this.methods.hiddenSet({ hidden }));
  }
  channelMuteSet(channelId: string, muted: boolean): Promise<{ muted: string[] }> {
    return unwrapAsync(this.methods.channelMuteSet({ channelId, muted }));
  }

  rosterBatch(
    action: 'pin' | 'unpin' | 'hide' | 'move',
    channelIds: string[],
    sectionId?: string | null,
  ): Promise<RosterSnapshot> {
    return unwrapAsync(this.methods.rosterBatch({ action, channelIds, sectionId }));
  }

  developerModeSet(enabled: boolean): { accepted: boolean } {
    return unwrap(this.methods.developerModeSet({ enabled }));
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
    return unwrapAsync(this.methods.marketplaceAvatarMine({}));
  }

  async marketplaceAvatarEdit(
    id: string,
    patch: MarketplaceAvatarEdit,
  ): Promise<MarketplaceAvatar> {
    return unwrapAsync(this.methods.marketplaceAvatarEdit({ id, ...patch }));
  }

  async marketplaceAvatarDelete(id: string): Promise<{ deleted: true }> {
    return unwrapAsync(this.methods.marketplaceAvatarDelete({ id }));
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
    return unwrap(this.methods.releaseInfo(since === undefined ? {} : { since }));
  }

  async releaseUpdate(force?: boolean): Promise<ReleaseUpdate> {
    return unwrapAsync(this.methods.releaseUpdate({ force }));
  }

  async releaseInstall(version: string, requestId?: string): Promise<ReleaseInstall> {
    return unwrapAsync(
      this.methods.releaseInstall(requestId === undefined ? { version } : { version, requestId }),
    );
  }

  async releaseRestart(): Promise<ReleaseRestart> {
    return unwrapAsync(this.methods.releaseRestart({}));
  }

  async pluginUpdates(force?: boolean): Promise<PluginUpdates> {
    return unwrapAsync(this.methods.pluginUpdates({ force }));
  }

  async pluginInstall(name: string, version: string, requestId?: string): Promise<PluginInstall> {
    return unwrapAsync(
      this.methods.pluginInstall(
        requestId === undefined ? { name, version } : { name, version, requestId },
      ),
    );
  }

  async pluginRestart(): Promise<PluginRestart> {
    return unwrapAsync(this.methods.pluginRestart({}));
  }

  updateRun(id?: string): UpdateRun | null {
    return unwrap(this.methods.updateRun(id === undefined ? {} : { id }));
  }

  async updateCancel(id: string): Promise<UpdateCancel> {
    return unwrapAsync(this.methods.updateCancel({ id }));
  }

  telemetryStatus(): TelemetryStatus {
    return unwrap(this.methods.telemetryStatus());
  }

  gitStatus(): GitStatus {
    return unwrap(this.methods.gitStatus());
  }

  gitInstall(): GitStatus {
    return unwrap(this.methods.gitInstall());
  }

  telemetrySet(enabled: boolean): TelemetryStatus {
    return unwrap(this.methods.telemetrySet({ enabled }));
  }

  takeoverList(query: {
    slug?: string;
    channelId?: string;
    pendingOnly?: boolean;
    limit?: number;
  }): { takeovers: TakeoverHandoff[] } {
    return unwrap(this.methods.takeoverList(query ?? {}));
  }

  takeoverStatus(channelId: string, messageId: string): { takeover: TakeoverHandoff } {
    return unwrap(this.methods.takeoverStatus({ channelId, messageId }));
  }

  async takeoverRequest(
    slug: string,
    input: { channelId?: string; target: string; title: string; message: string; minutes?: number },
  ): Promise<{ takeover: TakeoverHandoff }> {
    return unwrapAsync(this.methods.takeoverRequest({ ...input, slug }));
  }

  async takeoverComplete(
    channelId: string,
    messageId: string,
    outcome: 'done' | 'failed',
    surface?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return unwrapAsync(this.methods.takeoverComplete({ channelId, messageId, outcome, surface }));
  }

  async takeoverCancel(
    channelId: string,
    messageId: string,
    surface?: string,
    bot?: string,
  ): Promise<{ takeover: TakeoverHandoff }> {
    return unwrapAsync(
      this.methods.takeoverCancel({
        channelId,
        messageId,
        surface,
        ...(bot === undefined ? {} : { bot }),
      }),
    );
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
  'engineSelection',
  'engineAccountAdd',
  'engineAccountRename',
  'engineAccountRemove',
  'engineAccountLogin',
  'engineAccountLoginCancel',
  'engineAccountSubmitCode',
  'modelFavoriteSet',
  'modelPresets',
  'modelPresetCreate',
  'modelPresetUpdate',
  'modelPresetDelete',
  'modelPresetApply',
  'modelGroups',
  'modelGroup',
  'modelGroupCreate',
  'modelGroupUpdate',
  'modelGroupDelete',
  'modelPlan',
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
