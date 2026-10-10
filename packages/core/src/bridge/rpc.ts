import type { PartLibraryEntry } from '../bots/part-library.js';
import type { OnboardingSnapshot, TutorialAction } from '../onboarding/service.js';
import type { HttpsFallback } from '../memory/clone.js';
import type { PairingRequest, PairingReviewInput } from '../messaging/pairing.js';
import type { SenderAccessInput } from '../messaging/sender-access.js';
import type { ChannelHistoryItem, PurgeSource, PurgePreview } from '../purge/contracts.js';
import type { GroupMemberWakePolicy } from '../channels/channel.js';
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
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceTopic,
} from '../marketplace/client.js';
import type { AltchaChallenge } from '../marketplace/altcha.js';
import type {
  ReleaseInfo,
  ReleaseInstall,
  ReleaseRestart,
  ReleaseUpdate,
} from '../release/service.js';
import type { TelemetryStatus } from '../telemetry/service.js';
import type { OverviewMemory } from '../memory/overview.js';
import type { OverviewUsage } from './methods.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { HumanAssignmentContext } from '../runtime/assignment-human-context.js';
import type { ThreadReceptionInput } from '../messaging/thread-policy.js';
import type { GroupReceptionInput } from '../messaging/group-policy.js';
import type { ExternalSource } from '../messaging/inbound.js';
import type {
  MessagingApp,
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
} from '../messaging/outbound.js';
import type { MessagingTarget } from '../messaging/provider.js';
import type { PersonaBotDeletionPreview, PersonaBotDeletion } from '../bots/deletion.js';
import type { MemoryFileTarget } from '../memory/file-actions.js';
import type { Context } from '@deepseek-ai/cordis';
import type { UsageFilter, UsageQueryResult } from '../usage/query.js';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

import type { PersonaBotPatch } from '../bots/persona-bot.js';
import type { ModelCatalogEntry } from '../models/catalog.js';
import type { ModelPlanState } from '../models/readiness.js';
import type {
  AssignmentModelOption,
  ModelPreset,
  ModelRoute,
  PersonaBotModelPlan,
} from '../models/presets.js';
import type {
  BridgeError,
  BridgeMethods,
  BridgeResult,
  ChannelListItem,
  MessagingAppsView,
  PersonaBotDetail,
  PersonaBotSummary,
  OwnedSessionSummary,
  OwnedSessionBot,
  ProfileActivity,
} from './methods.js';
import type { ChannelActivityToday } from '../channels/activity-today.js';
import type { GroupProfileActivity } from '../channels/profile-activity.js';
import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { ChannelSendStatus } from '../channels/store.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelReadPosition } from '../channels/store.js';
import type { RosterSection, RosterSnapshot } from '../roster/store.js';
import type { TopOrderEntry } from '../roster/spec.js';
import type { ChannelTimelinePage, TimelineDirection } from '../channels/timeline.js';
import type { AssignmentDetail, AssignmentSummary } from '../runtime/bot-runtime.js';
import type { BotAttentionPage, BotAttentionState } from '../runtime/attention.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../schedules/bot-schedules.js';
import type { BotSourcePolicy } from '../runtime/source-policy.js';
import type { HumanAttentionCategory, HumanAttentionPage } from '../runtime/human-attention.js';
import type {
  MemoryAcceptedCommit,
  MemoryAcceptedSnapshot,
  MemoryGitGraph,
  MemoryGitCommitDiff,
  MemoryWorkingChange,
  MemoryWorkingDiff,
  MemoryWorkingKind,
  MemoryRepairEvent,
} from '../memory/accepted.js';
import type { GitStatus } from '../memory/managed-git.js';
import type { MemoryRecoveryCheckpoint } from '../memory/recovery.js';
import type { WorkspaceGrant } from '../workspaces/grants.js';
import type { ToolApprovalRule } from '../workspaces/tool-approval-rules.js';
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

const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

interface RemoteMethodDescriptor {
  readonly version: 1;
  readonly methods: readonly {
    readonly method: string;
    readonly invocation: { readonly kind: 'direct' };
  }[];
}

function markRemoteMethods(prototype: object, methods: readonly string[]): void {
  const descriptor: RemoteMethodDescriptor = {
    version: 1,
    methods: methods.map((method) =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }),
    ),
  };
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze(descriptor),
  });
}

function toRemoteError(error: BridgeError): RemoteError {
  return new RemoteError(error.code as RemoteError['code'], error.message, error.details ?? {});
}

function unwrap<T>(result: BridgeResult<T>): T {
  if (result.ok) return result.value;
  throw toRemoteError(result.error);
}

async function unwrapAsync<T>(result: Promise<BridgeResult<T>>): Promise<T> {
  return unwrap(await result);
}

export class BotharnessBridgeService extends TypertRemoteService {
  private readonly methods: BridgeMethods;

  constructor(ctx: Context, methods: BridgeMethods) {
    super(ctx, BRIDGE_SERVICE_KEY, { namespace: BRIDGE_NAMESPACE });
    this.methods = methods;
  }

  messagingChannelTarget(
    slug: string,
    grantId: string,
    channelId: string | null,
  ): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.messagingChannelTarget({ slug, grantId, channelId }));
  }
  messagingThreadPolicy(
    slug: string,
    sourceEventId: string,
    policy: ThreadReceptionInput,
  ): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.messagingThreadPolicy({ slug, sourceEventId, policy }));
  }
  messagingGroupPolicy(
    slug: string,
    grantId: string,
    policy: GroupReceptionInput,
  ): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.messagingGroupPolicy({ slug, grantId, policy }));
  }
  messagingDefaults(platform?: MessagingDefaultsPlatform): Promise<MessagingDefaults> {
    return unwrapAsync(this.methods.messagingDefaults(platform === undefined ? {} : { platform }));
  }
  messagingDefaultsSet(input: MessagingDefaultsInput): Promise<MessagingDefaults> {
    return unwrapAsync(this.methods.messagingDefaultsSet(input));
  }
  channelBridges(channelId: string): Promise<ChannelBridgeSnapshot> {
    return unwrapAsync(this.methods.channelBridges({ channelId }));
  }
  channelIngests(channelId: string): Promise<ConversationIngestSnapshot> {
    return unwrapAsync(this.methods.channelIngests({ channelId }));
  }
  channelIngest(channelId: string, input: ConversationIngestInput): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.channelIngest({ channelId, input }));
  }
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.channelBridge({ channelId, input }));
  }
  messagingReceive(slug: string, grantId: string, enabled: boolean): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.messagingReceive({ slug, grantId, enabled }));
  }
  messagingSource(slug: string, sourceEventId: string): Promise<{ source: ExternalSource }> {
    return unwrapAsync(this.methods.messagingSource({ slug, sourceEventId }));
  }
  approvalRoute(
    slug: string,
    pairingId: string | null,
    expectedRevision: number,
  ): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.approvalRoute({ slug, pairingId, expectedRevision }));
  }
  approvalTest(
    slug: string,
  ): Promise<{ delivery: import('../messaging/approval-messaging.js').ApprovalDelivery }> {
    return unwrapAsync(this.methods.approvalTest({ slug }));
  }
  approvalRetry(
    slug: string,
    id: string,
  ): Promise<{ delivery: import('../messaging/approval-messaging.js').ApprovalDelivery }> {
    return unwrapAsync(this.methods.approvalRetry({ slug, id }));
  }
  pairingReview(slug: string, input: PairingReviewInput): Promise<{ pairing: PairingRequest }> {
    return unwrapAsync(this.methods.pairingReview({ slug, input }));
  }
  senderAccess(slug: string, input: SenderAccessInput): Promise<void> {
    return unwrapAsync(this.methods.senderAccess({ slug, input }));
  }
  messagingIdentity(
    slug: string,
    input: MessagingIdentityInput,
  ): Promise<{ identity: MessagingIdentity }> {
    return unwrapAsync(this.methods.messagingIdentity({ slug, input }));
  }
  messagingApps(): Promise<MessagingAppsView> {
    return unwrapAsync(this.methods.messagingApps());
  }
  messagingSnapshot(slug: string): Promise<MessagingSnapshot> {
    return unwrapAsync(this.methods.messagingSnapshot({ slug }));
  }
  messagingTargets(
    providerId: string,
    accountRef: string,
  ): Promise<{ targets: MessagingTarget[] }> {
    return unwrapAsync(this.methods.messagingTargets({ providerId, accountRef }));
  }
  messagingAuthorize(
    botSlug: string,
    providerId: string,
    accountRef: string,
    targetRef: string,
    fingerprint: string,
    targetDigest: string,
  ): Promise<{ grant: MessagingGrant }> {
    return unwrapAsync(
      this.methods.messagingAuthorize({
        botSlug,
        providerId,
        accountRef,
        targetRef,
        fingerprint,
        targetDigest,
      }),
    );
  }
  messagingRevoke(slug: string, grantId: string): Promise<{ revoked: true }> {
    return unwrapAsync(this.methods.messagingRevoke({ slug, grantId }));
  }
  messagingConversation(
    slug: string,
    input: MessagingConversationInput,
  ): Promise<{ updated: true }> {
    return unwrapAsync(this.methods.messagingConversation({ slug, input }));
  }
  messagingSend(
    slug: string,
    grantId: string,
    requestId: string,
    text: string,
  ): Promise<{ intent: OutboxIntent }> {
    return unwrapAsync(this.methods.messagingSend({ slug, grantId, requestId, text }));
  }

  onboarding(slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot> {
    return unwrapAsync(this.methods.onboarding({ slug, action }));
  }
  onboardingModel(
    slug: string | undefined,
    expectedRevision: number,
    route: ModelRoute,
    globalDefault: boolean,
  ): Promise<{ revision: number }> {
    return unwrapAsync(
      this.methods.onboardingModel({ slug, expectedRevision, route, globalDefault }),
    );
  }
  modelPlanInherit(slug: string, expectedRevision: number): { revision: number } {
    return unwrap(this.methods.modelPlanInherit({ slug, expectedRevision }));
  }
  channelRetry(channelId: string, messageId: string): Promise<{ accepted: true }> {
    return unwrapAsync(this.methods.channelRetry({ channelId, messageId }));
  }
  modelCatalog(): Promise<{
    models: ModelCatalogEntry[];
    default?: ModelRoute;
  }> {
    return unwrapAsync(this.methods.modelCatalog({}));
  }

  modelPresets(): { presets: ModelPreset[] } {
    return unwrap(this.methods.modelPresets({}));
  }

  modelPresetCreate(
    name: string,
    orchestrator: ModelRoute,
    assignmentDefault: ModelRoute,
  ): Promise<{ preset: ModelPreset }> {
    return unwrapAsync(this.methods.modelPresetCreate({ name, orchestrator, assignmentDefault }));
  }

  modelPresetUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    orchestrator: ModelRoute,
    assignmentDefault: ModelRoute,
  ): Promise<{ preset: ModelPreset }> {
    return unwrapAsync(
      this.methods.modelPresetUpdate({
        id,
        expectedRevision,
        name,
        orchestrator,
        assignmentDefault,
      }),
    );
  }

  modelPresetApply(slug: string, presetId: string): Promise<{ plan: PersonaBotModelPlan }> {
    return unwrapAsync(this.methods.modelPresetApply({ slug, presetId }));
  }

  modelPlan(slug: string): Promise<ModelPlanState> {
    return unwrapAsync(this.methods.modelPlan({ slug }));
  }

  modelPlanCustomize(
    slug: string,
    orchestrator: ModelRoute,
  ): Promise<{ plan: PersonaBotModelPlan }> {
    return unwrapAsync(this.methods.modelPlanCustomize({ slug, orchestrator }));
  }

  modelPlanAssignmentsSet(
    slug: string,
    expectedRevision: number,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
  ): Promise<{ plan: PersonaBotModelPlan }> {
    return unwrapAsync(
      this.methods.modelPlanAssignmentsSet({
        slug,
        expectedRevision,
        assignmentDefault,
        assignmentModels,
      }),
    );
  }

  modelPlanSet(
    slug: string,
    expectedRevision: number,
    orchestrator: ModelRoute,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
  ): Promise<{ plan: PersonaBotModelPlan }> {
    return unwrapAsync(
      this.methods.modelPlanSet({
        slug,
        expectedRevision,
        orchestrator,
        assignmentDefault,
        assignmentModels,
      }),
    );
  }

  list(query?: string): { bots: PersonaBotSummary[] } {
    return unwrap(this.methods.list({ query }));
  }

  activitySnapshot(): PersonaBotActivitySnapshot {
    return unwrap(this.methods.activitySnapshot({}));
  }

  get(slug: string): { bot: PersonaBotDetail } {
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
  ): { bot: PersonaBotDetail } {
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
      }),
    );
  }

  async createFromGit(
    displayName: string,
    gitUrl: string,
    roles?: string[],
    description?: string,
  ): Promise<{ bot: PersonaBotDetail; httpsFallback?: HttpsFallback }> {
    return unwrapAsync(this.methods.createFromGit({ displayName, gitUrl, roles, description }));
  }

  update(slug: string, patch: PersonaBotPatch): { bot: PersonaBotDetail } {
    return unwrap(this.methods.update({ slug, patch }));
  }

  deletionPreview(slug: string): { preview: PersonaBotDeletionPreview } {
    return unwrap(this.methods.deletionPreview({ slug }));
  }
  async deletionConfirm(
    slug: string,
    token: string,
    eraseMemory: boolean,
  ): Promise<{ deletion: PersonaBotDeletion }> {
    return unwrapAsync(this.methods.deletionConfirm({ slug, token, eraseMemory }));
  }
  async deletionRetry(slug: string): Promise<{ deletion: PersonaBotDeletion }> {
    return unwrapAsync(this.methods.deletionRetry({ slug }));
  }
  deletionMemoryFolder(slug: string): {
    target: { path: string; relativePath: string; kind: 'directory' };
  } {
    return unwrap(this.methods.deletionMemoryFolder({ slug }));
  }
  pause(slug: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.pause({ slug }));
  }

  resume(slug: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.resume({ slug }));
  }
  computerAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return unwrap(this.methods.computerAccessSet({ slug, enabled }));
  }

  browserAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return unwrap(this.methods.browserAccessSet({ slug, enabled }));
  }

  browserProfileSet(slug: string, profile: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.browserProfileSet({ slug, profile }));
  }

  standingLimitsSet(slug: string, soul: number, coreMemory: number): { bot: PersonaBotDetail } {
    return unwrap(this.methods.standingLimitsSet({ slug, soul, coreMemory }));
  }

  botAvatarSet(channelId: string, avatar: string | null): { bot: PersonaBotDetail } {
    return unwrap(this.methods.botAvatarSet({ channelId, avatar }));
  }

  partLibraryList(): { parts: PartLibraryEntry[] } {
    return unwrap(this.methods.partLibraryList());
  }

  partLibraryExport(id?: string, part?: unknown): { fileName: string; data: string } {
    return unwrap(
      this.methods.partLibraryExport(
        part !== undefined ? { part } : id === undefined ? {} : { id },
      ),
    );
  }

  partLibraryImport(data: string): {
    added: PartLibraryEntry[];
    refused: { name: string; reason: string }[];
  } {
    return unwrap(this.methods.partLibraryImport({ data }));
  }

  partLibraryImportImage(
    data: string,
    slot: string,
    colors: number,
    name: string,
  ): { entry: PartLibraryEntry } {
    return unwrap(this.methods.partLibraryImportImage({ data, slot, colors, name }));
  }

  partLibraryAdd(part: unknown, name: string, parent?: string): { entry: PartLibraryEntry } {
    return unwrap(this.methods.partLibraryAdd({ part, name, parent }));
  }

  botBannerSet(channelId: string, banner: unknown): { bot: PersonaBotDetail } {
    return unwrap(this.methods.botBannerSet({ channelId, banner }));
  }

  botAppearanceSet(channelId: string, recipe: unknown): { bot: PersonaBotDetail } {
    return unwrap(this.methods.botAppearanceSet({ channelId, recipe }));
  }

  channels(): { channels: ChannelListItem[] } {
    return unwrap(this.methods.channels({}));
  }

  channelDm(slug: string, displayName?: string): { channel: ChannelRecord } {
    return unwrap(this.methods.channelDm({ slug, displayName }));
  }

  channelCreate(name: string, members: string[]): { channel: ChannelRecord } {
    return unwrap(this.methods.channelCreate({ name, members }));
  }

  channelRename(
    channelId: string,
    name: string,
  ): { channel: ChannelRecord; bot?: PersonaBotDetail } {
    return unwrap(this.methods.channelRename({ channelId, name }));
  }

  channelGroupAvatarSet(channelId: string, avatar: string | null): { channel: ChannelRecord } {
    return unwrap(this.methods.channelGroupAvatarSet({ channelId, avatar }));
  }

  channelGroupInvite(channelId: string, botSlug: string): { channel: ChannelRecord } {
    return unwrap(this.methods.channelGroupInvite({ channelId, botSlug }));
  }

  channelGroupInviteCancel(channelId: string, invitationId: string): { channel: ChannelRecord } {
    return unwrap(this.methods.channelGroupInviteCancel({ channelId, invitationId }));
  }

  channelGroupJoinDecide(
    channelId: string,
    requestId: string,
    accept: boolean,
  ): { channel: ChannelRecord } {
    return unwrap(this.methods.channelGroupJoinDecide({ channelId, requestId, accept }));
  }

  channelGroupMemberRemove(channelId: string, botSlug: string): { channel: ChannelRecord } {
    return unwrap(this.methods.channelGroupMemberRemove({ channelId, botSlug }));
  }

  channelGroupWakePolicies(channelId: string): { members: GroupMemberWakePolicy[] } {
    return unwrap(this.methods.channelGroupWakePolicies({ channelId }));
  }

  channelGroupWakeSet(
    channelId: string,
    botSlug: string,
    mode: 'all' | 'mentions' | 'digest' | 'silent',
    count: number,
    intervalSeconds: number,
    inherit?: boolean,
  ): { channel: ChannelRecord } {
    return unwrap(
      this.methods.channelGroupWakeSet({
        channelId,
        botSlug,
        mode,
        count,
        intervalSeconds,
        ...(inherit === undefined ? {} : { inherit }),
      }),
    );
  }

  humanIdentity() {
    return unwrap(this.methods.humanIdentity({}));
  }

  channelHumanNameSet(channelId: string, nickname: string | null) {
    return unwrap(this.methods.channelHumanNameSet({ channelId, nickname }));
  }

  humanNameSet(displayName: string | null) {
    return unwrap(this.methods.humanNameSet({ displayName }));
  }

  channelGroupDelete(channelId: string): { deleted: boolean } {
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

  async channelMarkAllRead(): Promise<{ channels: number }> {
    return unwrap(await this.methods.channelMarkAllRead({}));
  }
  async channelMarkRead(
    channelId: string,
    messageId: string,
  ): Promise<{ position: ChannelReadPosition }> {
    return unwrap(await this.methods.channelMarkRead({ channelId, messageId }));
  }

  channelAllBotPreview(channelId: string): AllBotPreview {
    return unwrap(this.methods.channelAllBotPreview({ channelId }));
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
  ): Promise<{ message: ChannelMessage }> {
    return unwrap(
      await this.methods.channelSend({
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
      }),
    );
  }

  botAttention(
    slug: string,
    limit?: number,
    cursor?: string,
    state?: BotAttentionState,
  ): BotAttentionPage {
    return unwrap(this.methods.botAttention({ slug, limit, cursor, state }));
  }

  botSourcePolicies(slug: string): { policies: BotSourcePolicy[] } {
    return unwrap(this.methods.botSourcePolicies({ slug }));
  }

  botSourcePolicySet(
    slug: string,
    wake: 'conditional' | 'immediate' | 'digest' | 'mentions' | 'silent',
    sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
    digestCount?: number,
    digestIntervalSeconds?: number,
    delivery?: 'steer' | 'turn',
  ): { policy: BotSourcePolicy } {
    return unwrap(
      this.methods.botSourcePolicySet({
        slug,
        wake,
        sourceClass,
        digestCount,
        digestIntervalSeconds,
        delivery,
      }),
    );
  }

  botSourcePolicyReset(
    slug: string,
    sourceClass?: 'assignment-report' | 'group-ordinary' | 'human-dm' | 'bot-dm' | 'group-mention',
  ): { policy: BotSourcePolicy } {
    return unwrap(this.methods.botSourcePolicyReset({ slug, sourceClass }));
  }

  channelActivityToday(): ChannelActivityToday {
    return unwrap(this.methods.channelActivityToday({}));
  }

  activityOverview() {
    return unwrap(this.methods.activityOverview({}));
  }

  humanAttention(
    category?: HumanAttentionCategory,
    botSlug?: string,
    channelId?: string,
    limit?: number,
    cursor?: string,
    sort?: 'newest' | 'oldest',
  ): HumanAttentionPage {
    return unwrap(
      this.methods.humanAttention({ category, botSlug, channelId, limit, cursor, sort }),
    );
  }
  humanAttentionStatus(): { unreadCount: number; hasAction: boolean } {
    return unwrap(this.methods.humanAttentionStatus({}));
  }
  humanAssignmentContext(
    slug: string,
    sessionId: string,
    sourceEventId: string,
  ): { context: HumanAssignmentContext } {
    return unwrap(this.methods.humanAssignmentContext({ slug, sessionId, sourceEventId }));
  }
  humanAttentionDismiss(itemId: string, sourceKey: string): { accepted: boolean } {
    return unwrap(this.methods.humanAttentionDismiss({ itemId, sourceKey }));
  }
  humanAttentionIgnore(sourceEventId: string): { accepted: boolean } {
    return unwrap(this.methods.humanAttentionIgnore({ sourceEventId }));
  }

  assignments(slug: string): { assignments: AssignmentSummary[] } {
    return unwrap(this.methods.assignments({ slug }));
  }

  assignment(slug: string, sessionId: string): { assignment: AssignmentDetail } {
    return unwrap(this.methods.assignment({ slug, sessionId }));
  }

  workspaceOptions(): { workspaces: { id: string; path: string; title: string }[] } {
    return unwrap(this.methods.workspaceOptions({}));
  }

  messageAttachmentTarget(
    channelId: string,
    messageId: string,
    fileId: string,
  ): { target: MemoryFileTarget } {
    return unwrap(this.methods.messageAttachmentTarget({ channelId, messageId, fileId }));
  }

  workspaceFileTarget(
    slug: string,
    grantId: string,
  ): { target: { path: string; relativePath: ''; kind: 'directory' } } {
    return unwrap(this.methods.workspaceFileTarget({ slug, grantId }));
  }

  grants(slug: string): { grants: WorkspaceGrant[] } {
    return unwrap(this.methods.grants({ slug }));
  }

  grantCreate(slug: string, workspaceId: string): Promise<{ grant: WorkspaceGrant }> {
    return unwrapAsync(this.methods.grantCreate({ slug, workspaceId }));
  }

  grantRevoke(slug: string, grantId: string): { grant: WorkspaceGrant } {
    return unwrap(this.methods.grantRevoke({ slug, grantId }));
  }

  grantWriteSet(slug: string, grantId: string, enabled: boolean): { grant: WorkspaceGrant } {
    return unwrap(this.methods.grantWriteSet({ slug, grantId, enabled }));
  }

  assignmentAccessGet(slug: string): { preset: AssignmentAccessPreset } {
    return unwrap(this.methods.assignmentAccessGet({ slug }));
  }

  assignmentAccessSet(
    slug: string,
    mode: AssignmentAccessMode,
    acknowledgeRisk: boolean,
  ): { preset: AssignmentAccessPreset } {
    return unwrap(this.methods.assignmentAccessSet({ slug, mode, acknowledgeRisk }));
  }

  toolApprovalRules(slug: string): { rules: ToolApprovalRule[] } {
    return unwrap(this.methods.toolApprovalRules({ slug }));
  }

  toolApprovalRuleRevoke(slug: string, id: string): { rule: ToolApprovalRule } {
    return unwrap(this.methods.toolApprovalRuleRevoke({ slug, id }));
  }

  toolApprovalStatus(
    channelId: string,
    messageId: string,
  ): {
    status: 'pending' | 'expired';
    execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
  } {
    return unwrap(this.methods.toolApprovalStatus({ channelId, messageId }));
  }

  toolApprovalDecide(
    channelId: string,
    messageId: string,
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): Promise<{ accepted: boolean }> {
    return unwrapAsync(this.methods.toolApprovalDecide({ channelId, messageId, outcome }));
  }

  userQuestionStatus(
    channelId: string,
    messageId: string,
  ): { status: 'pending' | 'submitted' | 'answered' | 'expired' } {
    return unwrap(this.methods.userQuestionStatus({ channelId, messageId }));
  }

  userQuestionAnswer(
    channelId: string,
    messageId: string,
    answer: { answers: { id: string; selected: string[]; custom?: string }[] },
  ): Promise<{ accepted: boolean }> {
    return unwrapAsync(this.methods.userQuestionAnswer({ channelId, messageId, answer }));
  }

  sessions(slug: string): { sessions: OwnedSessionSummary[] } {
    return unwrap(this.methods.sessions({ slug }));
  }

  sessionOwner(sessionId: string): { owner: OwnedSessionBot | null } {
    return unwrap(this.methods.sessionOwner({ sessionId }));
  }

  memoryFileTarget(slug: string, path: string): { target: MemoryFileTarget } {
    return unwrap(this.methods.memoryFileTarget({ slug, path }));
  }

  memorySnapshot(channelId: string): { snapshot: MemoryAcceptedSnapshot } {
    return unwrap(this.methods.memorySnapshot({ channelId }));
  }

  memoryFile(
    channelId: string,
    path: string,
  ): { file?: { path: string; body: string; head: string } } {
    return unwrap(this.methods.memoryFile({ channelId, path }));
  }

  memoryHistory(channelId: string): { commits: MemoryAcceptedCommit[] } {
    return unwrap(this.methods.memoryHistory({ channelId }));
  }

  memoryDiff(channelId: string, sha: string): { sha: string; diff: string } {
    return unwrap(this.methods.memoryDiff({ channelId, sha }));
  }

  memoryGitGraph(channelId: string, offset: number): MemoryGitGraph {
    return unwrap(this.methods.memoryGitGraph({ channelId, offset }));
  }

  memoryGitCommitDiff(channelId: string, sha: string): MemoryGitCommitDiff {
    return unwrap(this.methods.memoryGitCommitDiff({ channelId, sha }));
  }

  memoryWorkingChanges(channelId: string): { changes: MemoryWorkingChange[] } {
    return unwrap(this.methods.memoryWorkingChanges({ channelId }));
  }

  memoryWorkingDiff(channelId: string, path: string, kind: MemoryWorkingKind): MemoryWorkingDiff {
    return unwrap(this.methods.memoryWorkingDiff({ channelId, path, kind }));
  }

  memoryRecoveryHistory(channelId: string): { checkpoints: MemoryRecoveryCheckpoint[] } {
    return unwrap(this.methods.memoryRecoveryHistory({ channelId }));
  }

  memoryRestore(
    channelId: string,
    checkpointId: string,
    expectedCurrentId: string,
  ): {
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  } {
    return unwrap(this.methods.memoryRestore({ channelId, checkpointId, expectedCurrentId }));
  }

  memorySave(
    channelId: string,
    path: string,
    body: string,
    expectedHead: string,
    editId: string,
  ): { commit: MemoryAcceptedCommit } {
    return unwrap(this.methods.memorySave({ channelId, path, body, expectedHead, editId }));
  }

  memoryRepair(
    channelId: string,
    expectedHead: string,
    repairId: string,
  ): { repair: MemoryRepairEvent } {
    return unwrap(this.methods.memoryRepair({ channelId, expectedHead, repairId }));
  }

  overviewMemory(after?: string): Promise<OverviewMemory> {
    return unwrapAsync(this.methods.overviewMemory({ after }));
  }

  overviewUsage(period: UsageOverviewPeriod, after?: string): OverviewUsage {
    return unwrap(this.methods.overviewUsage({ period, after }));
  }
  profileUsage(channelId: string, filter: UsageFilter): UsageQueryResult {
    return unwrap(this.methods.profileUsage({ channelId, filter }));
  }

  profileActivity(channelId: string, before?: string, weeks?: number): ProfileActivity {
    return unwrap(this.methods.profileActivity({ channelId, before, weeks }));
  }

  groupProfileActivity(channelId: string): GroupProfileActivity {
    return unwrap(this.methods.groupProfileActivity({ channelId }));
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
    return unwrapAsync(this.methods.marketplaceList(query ?? {}));
  }

  async marketplaceSubmit(url: string, altcha: string): Promise<{ bot: MarketplaceEntry }> {
    return unwrapAsync(this.methods.marketplaceSubmit({ url, altcha }));
  }

  async marketplaceChallenge(): Promise<AltchaChallenge> {
    return unwrapAsync(this.methods.marketplaceChallenge());
  }

  async marketplaceReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return unwrapAsync(
      this.methods.marketplaceReport({ id, altcha, ...(reason === undefined ? {} : { reason }) }),
    );
  }

  async marketplaceTopics(): Promise<MarketplaceTopic[]> {
    return unwrapAsync(this.methods.marketplaceTopics());
  }

  async marketplaceDetail(id: string): Promise<MarketplaceDetail> {
    return unwrapAsync(this.methods.marketplaceDetail({ id }));
  }

  async releaseInfo(since?: string): Promise<ReleaseInfo> {
    return unwrap(this.methods.releaseInfo(since === undefined ? {} : { since }));
  }

  async releaseUpdate(): Promise<ReleaseUpdate> {
    return unwrapAsync(this.methods.releaseUpdate());
  }

  async releaseInstall(version: string): Promise<ReleaseInstall> {
    return unwrapAsync(this.methods.releaseInstall({ version }));
  }

  async releaseRestart(): Promise<ReleaseRestart> {
    return unwrapAsync(this.methods.releaseRestart({}));
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

  scheduleList(slug: string): { schedules: BotSchedule[] } {
    return unwrap(this.methods.scheduleList({ slug }));
  }

  scheduleCreate(slug: string, input: BotScheduleInput): { schedule: BotSchedule } {
    return unwrap(this.methods.scheduleCreate({ ...input, slug }));
  }

  scheduleUpdate(slug: string, id: string, change: BotScheduleChange): { schedule: BotSchedule } {
    return unwrap(this.methods.scheduleUpdate({ ...change, slug, id }));
  }

  scheduleDelete(slug: string, id: string): { removed: boolean } {
    return unwrap(this.methods.scheduleDelete({ slug, id }));
  }

  scheduleHistory(slug: string, id: string): { firings: BotScheduleFiring[] } {
    return unwrap(this.methods.scheduleHistory({ slug, id }));
  }

  scheduleRunNow(slug: string, id: string): { firing: BotScheduleFiring } {
    return unwrap(this.methods.scheduleRunNow({ slug, id }));
  }

  schedulePreview(trigger: BotScheduleTrigger): { occurrences: string[] } {
    return unwrap(this.methods.schedulePreview({ trigger }));
  }
}

markRemoteMethods(BotharnessBridgeService.prototype, [
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

export function registerBridge(ctx: Context, methods: BridgeMethods): BotharnessBridgeService {
  return new BotharnessBridgeService(ctx, methods);
}
