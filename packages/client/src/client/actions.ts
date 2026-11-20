import type {
  MarketplaceAvatar,
  MarketplaceAvatarPage,
  MarketplaceAvatarPublish,
} from '@botharness/host-protocol/marketplace-avatar';
import { botModeActions, type BotModeActions } from './bot-mode-actions.js';
import { replyPreviewOf } from '../../../core/src/channels/reply-preview.js';
import type * as prompts from '@botharness/host-client/prompt-presets';
import {
  loadGenuiView,
  saveGenuiView,
  loadGenuiDocumentView,
  saveGenuiDocumentView,
  BridgeCallError,
  type PartImageInfo,
  loadPrivateInputStatus,
  submitPrivateInput,
  cancelPrivateInput,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import {
  genuiDocumentReplySchema,
  type GenuiDocument,
  type GenuiDocumentState,
  type GenuiDocumentReply,
} from '../../../core/src/channels/genui-document.js';
import {
  genuiReplySchema,
  type GenuiReply,
  type GenuiView,
  type GenuiViewState,
} from '../../../core/src/channels/genui.js';
import type { ClientTelemetryEventName } from '../../../core/src/telemetry/events.js';
import type { ProviderAppSetup } from './provider-app-setup.js';
import type { OnboardingSnapshot, TutorialAction } from '../../../core/src/onboarding/types.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {
  ChannelHistoryItem,
  PurgeSource,
  PurgePreview,
} from '../../../core/src/purge/contracts.js';
import type {
  PersonaBotDeletionPreview,
  PersonaBotDeletion,
} from '../../../core/src/bots/deletion.js';
import type { PairingRequest, PairingReviewInput } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import type { GroupMemberWakePolicy } from '../../../core/src/channels/channel.js';
import type { ChannelAssignmentSummary } from '../../../core/src/runtime/bot-runtime.js';
import { parsePrivateAccountList, type PrivateAccountList } from './private-accounts.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceAuthorAccount,
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceSection,
  MarketplaceTopic,
  MarketplaceInstallSource,
} from '../../../core/src/marketplace/client.js';
import type { AltchaChallenge } from '../../../core/src/marketplace/altcha.js';
import type {
  MarketplaceAccount,
  UploadPlan,
} from '../../../core/src/marketplace/uploaded-bots.js';
import type { ShareDraftView } from '../../../core/src/marketplace/share-draft.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import type { InstallReviewResult } from '../../../core/src/marketplace/install-review.js';
import type { AllBotPreview, AllBotMention } from '../../../core/src/channels/all-bot-mention.js';
import type { ChannelSkillInvocationToken } from '../../../core/src/channels/channel.js';
import type { SkillCatalogEntry } from '../../../core/src/skills/entries.js';
import type {
  ChannelBridgeInput,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type {
  ConversationIngestInput,
  ConversationIngestSnapshot,
} from '../../../core/src/messaging/conversation-ingest.js';
import type {
  MessagingIdentity,
  MessagingIdentityInput,
} from '../../../core/src/messaging/identity.js';
import type { ChannelActivityToday } from '../../../core/src/channels/activity-today.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type {
  MessagingSnapshot,
  MessagingReadMode,
  MessagingGrant,
  OutboxIntent,
} from '../../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../../core/src/messaging/provider.js';
import type {
  QuoteRef,
  BotSummary,
  ChannelAttachmentRef,
  ChannelMessage,
  ClientStore,
} from './store.js';
import type { NativeHostFiles } from './host-file-actions.js';
import type { FileOpenPreferences } from './file-open-preferences.js';
import type { ComposerSubmissionStore } from './composer-submission-store.js';
import { createTelemetryActions } from './actions-telemetry.js';
import { createHomeActions, type HomeActions } from './actions-home.js';
import { createModelActions, type ModelActions } from './actions-models.js';
import { createPromptActions, type PromptActions } from './actions-prompts.js';
import { createWorkspaceActions, type WorkspaceActions } from './actions-workspace.js';
import { createApprovalActions, type ApprovalActions } from './actions-approvals.js';
import { createVoiceActions, type VoiceActions } from './actions-voice.js';
import { createRosterActions, type RosterActions } from './actions-roster.js';
import { createGitActions, type GitActions } from './actions-git.js';
import { createActivityActions, type ActivityActions } from './actions-activity.js';
import { createConversationActions, type ConversationActions } from './actions-conversation.js';
import { createFileActions, type FileActions } from './actions-files.js';
import { createMemoryActions, type MemoryActions } from './actions-memory.js';
import { createUsageActions, type UsageActions } from './actions-usage.js';
import { createMarketplaceActions, type MarketplaceActions } from './actions-marketplace.js';
import { createMessagingActions, type MessagingActions } from './actions-messaging.js';
import { createTriggerActions, type TriggerActions } from './actions-triggers.js';
import { createSessionActions, type SessionActions } from './actions-sessions.js';
import { createComposerActions, type ComposerActions } from './actions-composer.js';
import { createBotActions, type BotActions } from './actions-bots.js';
import { createChannelActions, type ChannelActions } from './actions-channels.js';

export interface HostDirectoryListing {
  path: string;
  home: string;
  crumbs: { name: string; path: string; hidden: boolean }[];
  entries: { name: string; path: string; hidden: boolean }[];
  truncated: boolean;
  nextOffset?: number;
  roots?: { name: string; path: string; hidden: boolean }[];
  nativePicker?: boolean;
}

export interface BridgeActions
  extends
    BotModeActions,
    HomeActions,
    ModelActions,
    PromptActions,
    WorkspaceActions,
    ApprovalActions,
    VoiceActions,
    RosterActions,
    GitActions,
    ActivityActions,
    ConversationActions,
    FileActions,
    MemoryActions,
    UsageActions,
    MarketplaceActions,
    MessagingActions,
    TriggerActions,
    SessionActions,
    ComposerActions,
    BotActions,
    ChannelActions {
  readonly teamCall?: BridgeCall;
  readonly openModelPresets?: () => void;
  genuiDocumentView(
    channelId: string,
    messageId: string,
    document: GenuiDocument,
  ): Promise<{ version: number; state: GenuiDocumentState }>;
  saveGenuiDocumentView(
    channelId: string,
    messageId: string,
    document: GenuiDocument,
    expectedVersion: number,
    state: GenuiDocumentState,
  ): Promise<{ version: number; state: GenuiDocumentState }>;
  sendGenuiDocumentReply(
    channelId: string,
    body: string,
    submissionId: string,
    reply: GenuiDocumentReply,
  ): Promise<void>;
  genuiView(channelId: string, messageId: string): Promise<GenuiView>;
  saveGenuiView(
    channelId: string,
    messageId: string,
    snapshotId: string,
    expectedVersion: number,
    state: GenuiViewState,
  ): Promise<GenuiView>;
  sendGenuiReply(
    channelId: string,
    body: string,
    submissionId: string,
    reply: GenuiReply,
  ): Promise<void>;
  tobHome(): Promise<
    import('../../../core/src/tob/service.js').TobHome & {
      attention?: { unreadCount: number; hasAction: boolean };
    }
  >;
  onboarding(slug?: string, action?: TutorialAction): Promise<OnboardingSnapshot>;
  telemetryEvent(
    event: ClientTelemetryEventName,
    properties?: Record<string, string | boolean>,
  ): void;
  botContext(
    botSlug: string,
  ): Promise<import('../../../core/src/runtime/context-window.js').BotContextWindow>;
  botSystemPrompt(
    botSlug: string,
  ): Promise<import('../../../core/src/runtime/prompt-inspection.js').BotSystemPromptView>;
  botPrompt?(slug: string): Promise<import('../../../core/src/bridge/methods.js').BotPromptView>;
  botPromptSet?(
    slug: string,
    change: {
      presetId?: string | null;
      parts?: Record<string, string | null>;
      limits?: Record<string, number | null>;
    },
  ): Promise<import('../../../core/src/bridge/methods.js').BotPromptView>;
  botTurnInput(
    botSlug: string,
    turns?: number,
  ): Promise<{
    slug: string;
    sessionId: string;
    turns: import('../../../core/src/runtime/prompt-inspection.js').TurnInputView[];
  }>;
  channelBridges(channelId: string, mode?: MessagingReadMode): Promise<ChannelBridgeSnapshot>;
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<void>;
  channelIngests(channelId: string): Promise<ConversationIngestSnapshot>;
  channelIngest(channelId: string, input: ConversationIngestInput): Promise<void>;
  messagingThreadPolicy(
    slug: string,
    sourceEventId: string,
    policy: import('../../../core/src/messaging/thread-policy.js').ThreadReceptionInput,
  ): Promise<void>;
  messagingGroupPolicy(slug: string, grantId: string, policy: GroupReceptionInput): Promise<void>;
  messagingSource(slug: string, sourceEventId: string): Promise<ExternalSource>;
  pairingReview(slug: string, input: PairingReviewInput): Promise<PairingRequest>;
  senderAccess(slug: string, input: SenderAccessInput): Promise<void>;
  messagingIdentity(slug: string, input: MessagingIdentityInput): Promise<MessagingIdentity>;
  messagingConversation(slug: string, input: MessagingConversationInput): Promise<void>;
  appSetup?: ProviderAppSetup;
  messagingSnapshot(slug: string, mode?: MessagingReadMode): Promise<MessagingSnapshot>;
  messagingReachable?(
    slug: string,
    bindingId: string,
    cursor?: string,
  ): Promise<import('../../../core/src/messaging/provider.js').MessagingReachablePage>;
  messagingPostConversation?(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<OutboxIntent>;
  messagingPostRequest?(
    slug: string,
    bindingId: string,
    conversationId: string,
    requestId: string,
    text: string,
  ): Promise<OutboxIntent | undefined>;
  messagingTargets(providerId: string, accountRef: string): Promise<MessagingTarget[]>;
  messagingAuthorize(input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  }): Promise<MessagingGrant>;
  messagingSend(
    slug: string,
    grantId: string,
    requestId: string,
    text: string,
  ): Promise<OutboxIntent>;
  deletionPreview(slug: string): Promise<PersonaBotDeletionPreview>;
  deletionConfirm(slug: string, token: string, eraseMemory: boolean): Promise<PersonaBotDeletion>;
  deletionRetry(slug: string): Promise<PersonaBotDeletion>;
  overviewMemory(
    after?: string,
  ): Promise<import('../../../core/src/memory/overview.js').OverviewMemory>;
  overviewUsage(
    period: import('../../../core/src/usage/overview.js').UsageOverviewPeriod,
    after?: string,
  ): Promise<import('@botharness/host-client/usage').OverviewUsage>;
  channelActivityToday(): Promise<ChannelActivityToday>;
  privateInputStatus?(
    channelId: string,
    messageId: string,
  ): Promise<import('../../../core/src/credentials/contracts.js').PrivateInputStatus>;
  privateInputSubmit?(
    channelId: string,
    messageId: string,
    values: Record<string, string>,
  ): Promise<void>;
  privateInputCancel?(channelId: string, messageId: string): Promise<void>;
  privateAccountStatus?(
    channelId: string,
    messageId: string,
  ): Promise<import('../../../core/src/credentials/contracts.js').PrivateAccountStatus>;
  privateInputReplace?(channelId: string, messageId: string): Promise<string>;
  privateAccounts?(slug: string): Promise<PrivateAccountList>;
  privateMcpServerRemove?(slug: string, serverName: string): Promise<boolean>;
  privateMcpServerEnable?(slug: string, serverName: string, enabled: boolean): Promise<boolean>;
  privateAccountRevoke?(
    channelId: string,
    messageId: string,
  ): Promise<import('../../../core/src/credentials/contracts.js').PrivateRevocationResult>;
  requestHost?(): import('@botharness/host-client/client').HostClient;
  allBotPreview(channelId: string): Promise<AllBotPreview>;
  send(
    body: string,
    replyTo?: string,
    attachments?: ChannelAttachmentRef[],
    memorySwitchTarget?: string,
    mentions?: ChannelMessage['mentions'],
    channelRefs?: ChannelMessage['channelRefs'],
    grantRequestResolution?: ChannelMessage['grantRequestResolution'],
    allBotMention?: AllBotMention,
    submissionId?: string,
    skillInvocations?: ChannelSkillInvocationToken[],
    quotes?: readonly QuoteRef[],
  ): Promise<boolean>;
  skillCatalog?(channelId: string): Promise<SkillCatalogEntry[]>;
  sessionSkillCatalog?(slug: string, sessionId: string): Promise<SkillCatalogEntry[]>;
  marketplaceList(query?: MarketplaceQuery): Promise<MarketplacePage>;
  marketplaceChallenge(): Promise<AltchaChallenge>;
  marketplaceSubmit(url: string, altcha: string): Promise<MarketplaceEntry>;
  marketplaceTopics(): Promise<MarketplaceTopic[]>;
  marketplaceSections(lang?: MarketplaceLanguage): Promise<MarketplaceSection[]>;
  marketplaceDigests(lang?: MarketplaceLanguage): Promise<MarketplaceDigestSummary[]>;
  marketplaceDigest(day?: string, lang?: MarketplaceLanguage): Promise<MarketplaceDigest>;
  marketplaceAvatarList(cursor?: string): Promise<MarketplaceAvatarPage>;
  marketplaceAvatarDetail(id: string): Promise<MarketplaceAvatar>;
  marketplaceAvatarPublish(input: MarketplaceAvatarPublish): Promise<MarketplaceAvatar>;
  marketplaceDetail(id: string, lang?: MarketplaceLanguage): Promise<MarketplaceDetail>;
  marketplaceFile(id: string, path: string): Promise<MarketplaceFileView>;
  marketplaceAccount(): Promise<MarketplaceAccount>;
  marketplaceAuthorSave(
    displayName: string,
    acceptTerms: boolean,
  ): Promise<MarketplaceAuthorAccount>;
  marketplaceAuthorAvatarSet(avatar: string | null): Promise<MarketplaceAuthorAccount>;
  marketplaceUploadPlan(slug: string): Promise<UploadPlan>;
  marketplaceUpload(
    slug: string,
    presentation: {
      displayName: string;
      bio?: string;
      tags?: string[];
      replaces?: string;
    },
  ): Promise<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }>;
  marketplaceMine(lang?: MarketplaceLanguage): Promise<MarketplaceAuthoredBot[]>;
  shareDraftStart(slug: string): Promise<ShareDraftView>;
  shareDraftGet(slug: string): Promise<ShareDraftView | undefined>;
  marketplaceInstallReview(id: string, lang?: MarketplaceLanguage): Promise<InstallReviewResult>;
  marketplaceInstall(
    id: string,
    reviewId: string,
    sectionId?: string,
    source?: MarketplaceInstallSource,
  ): Promise<BotSummary>;
  setBotAppearance(
    channelId: string,
    recipe: import('../../../core/src/bots/avatar-appearance.js').AvatarRecipe,
  ): Promise<boolean>;
  exportLibraryParts(
    id?: string,
    part?: import('../../../core/src/bots/avatar-appearance.js').PixelCustomPart,
  ): Promise<{ fileName: string; data: string } | undefined>;
  importLibraryParts(data: string): Promise<
    | {
        added: import('../../../core/src/bots/part-library.js').PartLibraryEntry[];
        refused: number;
        image?: PartImageInfo;
      }
    | { error: string }
  >;
  importLibraryImage(
    data: string,
    slot: string,
    colors: number,
    name: string,
  ): Promise<import('../../../core/src/bots/part-library.js').PartLibraryEntry | { error: string }>;
  loadPartLibrary(): Promise<
    import('../../../core/src/bots/part-library.js').PartLibraryEntry[] | undefined
  >;
  addLibraryPart(
    part: import('../../../core/src/bots/avatar-appearance.js').PixelCustomPart,
    name: string,
    parent?: string,
  ): Promise<import('../../../core/src/bots/part-library.js').PartLibraryEntry | undefined>;
  groupWakePolicies(channelId: string): Promise<GroupMemberWakePolicy[]>;
  channelAssignments(channelId: string): Promise<ChannelAssignmentSummary[]>;
  channelHistory(): Promise<ChannelHistoryItem[]>;
  channelHistorySources(
    channelId: string,
    before?: string,
  ): Promise<{ sources: PurgeSource[]; before?: string }>;
  channelPurgePreview(channelId: string, sourceEventIds: string[]): Promise<PurgePreview>;
  channelPurgeConfirm(
    channelId: string,
    sourceEventIds: string[],
    token: string,
  ): Promise<{ accepted: number; cleanupPending?: number }>;
}

export interface ActionFolderAccess {
  pickDirectory(): Promise<string | null>;
  createWorkspace(input: { path: string }): Promise<{ workspaceId: string }>;
  openSession?(sessionId: string): void;
  nativeFiles?: NativeHostFiles;
  fileOpenPreferences?: FileOpenPreferences;
  submissions?: ComposerSubmissionStore;
  openModelPresets?(): void;
}

export type ActionResources = { download(path: string, name: string): Promise<void> };
export type InvokeAction = <T>(endpoint: string, payload: Record<string, unknown>) => Promise<T>;
export type ReplyPreviewOf = typeof replyPreviewOf;

export function createActions(
  call: BridgeCall,
  clientStore: ClientStore,
  folderAccess?: ActionFolderAccess,
  resources?: ActionResources,
): BridgeActions {
  clientStore.setComposerIdentity(undefined);
  const invoke = async <T>(endpoint: string, payload: Record<string, unknown>): Promise<T> => {
    const result = await call(endpoint, payload);
    if (!result.ok)
      throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
    return result.value as T;
  };
  const host: prompts.PromptPresetClient = {
    call: (method, args) => invoke(method, args ?? {}),
  };
  const getActions = (): BridgeActions => actions;
  const gitActions = createGitActions(call, clientStore);
  const sessionsActions = createSessionActions(call, clientStore, folderAccess, getActions);
  const activityActions = createActivityActions(
    call,
    clientStore,
    getActions,
    sessionsActions.currentSelection,
  );
  const rosterActions = createRosterActions(
    call,
    clientStore,
    gitActions.refreshGit,
    activityActions.actions.refreshActivityListStatus,
  );
  const filesActions = createFileActions(call, folderAccess, resources);
  const composerActions = createComposerActions(
    call,
    clientStore,
    folderAccess,
    host,
    getActions,
    replyPreviewOf,
    sessionsActions.currentSelection,
    sessionsActions.selectedBotSlug,
    sessionsActions.loadSessionsFor,
  );
  const conversationActions = createConversationActions(
    call,
    clientStore,
    getActions,
    sessionsActions.currentSelection,
    sessionsActions.loadSessionsFor,
    activityActions.loadBotInboxFor,
    activityActions.actions.refreshActivityListStatus,
    composerActions.remainingFailures,
  );
  const homeActions = createHomeActions(
    call,
    clientStore,
    invoke,
    getActions,
    conversationActions.openChannelById,
  );
  const botsActions = createBotActions(
    call,
    clientStore,
    resources,
    getActions,
    rosterActions.actions.refreshRoster,
    rosterActions.placeCreatedChannelFirst,
  );
  const modelsActions = createModelActions(call, host, getActions);
  const workspaceActions = createWorkspaceActions(
    call,
    folderAccess,
    getActions,
    activityActions.settleNativeInboxAction,
  );
  const approvalsActions = createApprovalActions(
    call,
    getActions,
    activityActions.settleNativeInboxAction,
  );
  const memoryActions = createMemoryActions(call, host);
  const usageActions = createUsageActions(call);
  const marketplaceActions = createMarketplaceActions(call, invoke, botsActions.openCreatedBot);
  const channelsActions = createChannelActions(
    call,
    clientStore,
    getActions,
    rosterActions.placeCreatedChannelFirst,
    conversationActions.openChannelById,
  );
  const actions: BridgeActions = {
    ...botModeActions(call),
    teamCall: call,
    ...(folderAccess?.openModelPresets === undefined
      ? {}
      : { openModelPresets: folderAccess.openModelPresets }),
    genuiDocumentView: (channelId, messageId, document) =>
      loadGenuiDocumentView(call, channelId, messageId, document),
    saveGenuiDocumentView: (channelId, messageId, document, expectedVersion, state) =>
      saveGenuiDocumentView(call, channelId, messageId, document, expectedVersion, state),
    async sendGenuiDocumentReply(channelId, body, submissionId, reply) {
      reply = genuiDocumentReplySchema.parse(reply);
      const channel = clientStore.getSnapshot().conversation.channel;
      if (channel?.id !== channelId || channel.type !== 'dm')
        throw new BridgeCallError('genui-unavailable', 'Document unavailable');
      await sendChannelMessage(
        call,
        channelId,
        body,
        undefined,
        undefined,
        submissionId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        reply,
      );
      await actions.refreshChannelMessages(channelId);
    },
    genuiView: (channelId, messageId) => loadGenuiView(call, channelId, messageId),
    saveGenuiView: (channelId, messageId, snapshotId, expectedVersion, state) =>
      saveGenuiView(call, channelId, messageId, snapshotId, expectedVersion, state),
    async sendGenuiReply(channelId, body, submissionId, reply) {
      reply = genuiReplySchema.parse(reply);
      const channel = clientStore.getSnapshot().conversation.channel;
      if (channel?.id !== channelId || channel.type !== 'dm') throw new Error('genui-unavailable');
      await sendChannelMessage(
        call,
        channelId,
        body,
        undefined,
        undefined,
        submissionId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        reply,
      );
      await actions.refreshChannelMessages(channelId);
    },
    ...homeActions,
    onboardingModel: modelsActions.onboardingModel,
    inheritModel: modelsActions.inheritModel,
    ...createTelemetryActions(invoke),
    ...createPromptActions(invoke, host),
    newBotSession: sessionsActions.actions.newBotSession,
    retryMessage: composerActions.actions.retryMessage,
    compactBot: sessionsActions.actions.compactBot,
    stopBot: sessionsActions.actions.stopBot,
    cancelAutoContinue: sessionsActions.actions.cancelAutoContinue,
    modelCatalog: modelsActions.modelCatalog,
    setModelFavorite: modelsActions.setModelFavorite,
    modelPresets: modelsActions.modelPresets,
    routingGroups: modelsActions.routingGroups,
    routingGroupEngines: modelsActions.routingGroupEngines,
    createRoutingGroup: modelsActions.createRoutingGroup,
    updateRoutingGroup: modelsActions.updateRoutingGroup,
    deleteRoutingGroup: modelsActions.deleteRoutingGroup,
    modelPlan: modelsActions.modelPlan,
    modelPlanState: modelsActions.modelPlanState,
    applyModelPreset: modelsActions.applyModelPreset,
    customizeModelPlan: modelsActions.customizeModelPlan,
    chooseModelPlanGroup: modelsActions.chooseModelPlanGroup,
    setStandingLimits: modelsActions.setStandingLimits,
    setModelPlanAssignments: modelsActions.setModelPlanAssignments,
    setModelPlan: modelsActions.setModelPlan,
    listHostFolders: workspaceActions.listHostFolders,
    addWorkspaceFolder: workspaceActions.addWorkspaceFolder,
    authorizeWorkspacePath: workspaceActions.authorizeWorkspacePath,
    resolveWorkspaceFolder: workspaceActions.resolveWorkspaceFolder,
    authorizeGroupWorkspacePath: workspaceActions.authorizeGroupWorkspacePath,
    readGroupWorkspaceGrant: workspaceActions.readGroupWorkspaceGrant,
    memoryDirectory: memoryActions.memoryDirectory,
    moveMemoryLocation: memoryActions.moveMemoryLocation,
    listWorkspaceOptions: workspaceActions.listWorkspaceOptions,
    listWorkspaceGrants: workspaceActions.listWorkspaceGrants,
    createWorkspaceGrant: workspaceActions.createWorkspaceGrant,
    revokeWorkspaceGrant: workspaceActions.revokeWorkspaceGrant,
    setWorkspaceGrantWrite: workspaceActions.setWorkspaceGrantWrite,
    assignmentAccess: workspaceActions.assignmentAccess,
    setAssignmentAccess: workspaceActions.setAssignmentAccess,
    listToolApprovalRules: approvalsActions.listToolApprovalRules,
    approvalTemplates: approvalsActions.approvalTemplates,
    setBotApprovalTemplate: approvalsActions.setBotApprovalTemplate,
    approvalReviewerModel: approvalsActions.approvalReviewerModel,
    ...createVoiceActions(call),
    setApprovalReviewerModel: approvalsActions.setApprovalReviewerModel,
    revokeToolApprovalRule: approvalsActions.revokeToolApprovalRule,
    toolApprovalStatus: approvalsActions.toolApprovalStatus,
    privateInputStatus: (channelId, messageId) =>
      loadPrivateInputStatus(call, channelId, messageId),
    privateInputSubmit: (channelId, messageId, values) =>
      submitPrivateInput(call, channelId, messageId, values),
    privateInputCancel: (channelId, messageId) => cancelPrivateInput(call, channelId, messageId),
    settleTakeover: approvalsActions.settleTakeover,
    privateAccountStatus: async (channelId, messageId) => {
      const result = await call('privateAccountStatus', {
        channelId,
        messageId,
      });
      if (!result.ok) throw new Error('Private account status is unavailable');
      const value =
        result.value as import('../../../core/src/credentials/contracts.js').PrivateAccountStatus;
      if (
        !['configured', 'revoked', 'superseded', 'unavailable'].includes(value.status) ||
        typeof value.references !== 'object' ||
        value.references === null ||
        !Object.values(value.references).every(
          (reference) =>
            typeof reference === 'string' &&
            /^private:[0-9a-f-]{36}:[a-z][a-z0-9_]{0,47}$/.test(reference),
        )
      )
        throw new Error('Private account status is invalid');
      return value;
    },
    privateInputReplace: async (channelId, messageId) => {
      const result = await call('privateInputReplace', {
        channelId,
        messageId,
      });
      const replacement = result.ok
        ? (result.value as { messageId?: unknown }).messageId
        : undefined;
      if (typeof replacement !== 'string')
        throw new Error('Private input replacement is unavailable');
      return replacement;
    },
    privateAccounts: async (slug) => {
      const result = await call('privateAccounts', { slug });
      if (!result.ok) throw new Error('Private accounts are unavailable');
      return parsePrivateAccountList(result.value);
    },
    privateMcpServerEnable: async (slug, serverName, enabled) => {
      const result = await call('privateMcpServerEnable', {
        slug,
        serverName,
        enabled,
      });
      if (!result.ok) throw new Error('MCP server setting is unavailable');
      return (result.value as { accepted?: unknown }).accepted === true;
    },
    privateMcpServerRemove: async (slug, serverName) => {
      const result = await call('privateMcpServerRemove', { slug, serverName });
      if (!result.ok) throw new Error('MCP server removal is unavailable');
      return (result.value as { removed?: unknown }).removed === true;
    },
    privateAccountRevoke: async (channelId, messageId) => {
      const result = await call('privateAccountRevoke', {
        channelId,
        messageId,
      });
      if (!result.ok) throw new Error('Private account revocation is unavailable');
      const value =
        result.value as import('../../../core/src/credentials/contracts.js').PrivateRevocationResult;
      if (
        value.accepted !== true ||
        ![value.stopped, value.completed, value.uncertain].every(
          (count) => Number.isSafeInteger(count) && count >= 0,
        )
      )
        throw new Error('Private account revocation was not accepted');
      return value;
    },
    toolApprovalState: approvalsActions.toolApprovalState,
    toolApprovalExecutionState: approvalsActions.toolApprovalExecutionState,
    decideToolApproval: approvalsActions.decideToolApproval,
    userQuestionStatus: approvalsActions.userQuestionStatus,
    answerUserQuestion: approvalsActions.answerUserQuestion,
    load: rosterActions.actions.load,
    deletionPreview: botsActions.actions.deletionPreview,
    deletionConfirm: botsActions.actions.deletionConfirm,
    deletionRetry: botsActions.actions.deletionRetry,
    deletionFolderApplications: filesActions.deletionFolderApplications,
    deletionFolderOpen: filesActions.deletionFolderOpen,
    refreshRoster: rosterActions.actions.refreshRoster,
    ...gitActions,
    openBot: conversationActions.actions.openBot,
    refreshBotInbox: activityActions.actions.refreshBotInbox,
    loadMoreBotInbox: activityActions.actions.loadMoreBotInbox,
    openActivityCenter: activityActions.actions.openActivityCenter,
    attachActivityCenterPanel: activityActions.actions.attachActivityCenterPanel,
    botInboxPage: activityActions.actions.botInboxPage,
    activityPage: activityActions.actions.activityPage,
    openActivityList: activityActions.actions.openActivityList,
    refreshActivityListStatus: activityActions.actions.refreshActivityListStatus,
    refreshActivityList: activityActions.actions.refreshActivityList,
    setActivityListFilters: activityActions.actions.setActivityListFilters,
    loadMoreActivityList: activityActions.actions.loadMoreActivityList,
    allowAutoRejectionOnce: activityActions.actions.allowAutoRejectionOnce,
    dismissActivityList: activityActions.actions.dismissActivityList,
    dismissAllActivityList: activityActions.actions.dismissAllActivityList,
    channelFilesPage: filesActions.channelFilesPage,
    activityListContextPage: activityActions.actions.activityListContextPage,
    averageReplyPerf: usageActions.averageReplyPerf,
    snoozeActivityList: activityActions.actions.snoozeActivityList,
    ignoreHumanReport: activityActions.actions.ignoreHumanReport,
    openChannel: conversationActions.actions.openChannel,
    openChannelAtMessage: conversationActions.actions.openChannelAtMessage,
    activityListContext: activityActions.actions.activityListContext,
    replyFromActivityList: activityActions.actions.replyFromActivityList,
    pickWorkspaceFolder: workspaceActions.pickWorkspaceFolder,
    resolveWorkspaceGrantRequest: workspaceActions.resolveWorkspaceGrantRequest,
    markAllRead: activityActions.actions.markAllRead,
    markRead: activityActions.actions.markRead,
    reactToMessage: conversationActions.actions.reactToMessage,
    searchChannel: conversationActions.actions.searchChannel,
    searchMessages: conversationActions.actions.searchMessages,
    markChannelRead: conversationActions.actions.markChannelRead,
    humanAssignmentContext: activityActions.actions.humanAssignmentContext,
    replyToHumanAssignment: activityActions.actions.replyToHumanAssignment,
    loadOlder: conversationActions.actions.loadOlder,
    loadNewer: conversationActions.actions.loadNewer,
    openLatest: conversationActions.actions.openLatest,
    openAround: conversationActions.actions.openAround,
    applyChannelTail: conversationActions.actions.applyChannelTail,
    refreshChannelMessages: conversationActions.actions.refreshChannelMessages,
    bridgeFileCommands: filesActions.bridgeFileCommands,
    messageAttachmentTarget: filesActions.messageAttachmentTarget,
    messageAttachmentApplications: filesActions.messageAttachmentApplications,
    messageAttachmentOpen: filesActions.messageAttachmentOpen,
    messageAttachmentDownload: filesActions.messageAttachmentDownload,
    workspaceFileTarget: filesActions.workspaceFileTarget,
    workspaceFileApplications: filesActions.workspaceFileApplications,
    workspaceFileOpen: filesActions.workspaceFileOpen,
    fileOpenPreferences: filesActions.fileOpenPreferences,
    memoryFileTarget: filesActions.memoryFileTarget,
    memoryFileApplications: filesActions.memoryFileApplications,
    memoryFileOpen: filesActions.memoryFileOpen,
    memoryFileDownload: filesActions.memoryFileDownload,
    memorySnapshot: memoryActions.memorySnapshot,
    memoryFile: memoryActions.memoryFile,
    memoryHistory: memoryActions.memoryHistory,
    memoryDiff: memoryActions.memoryDiff,
    memoryGitGraph: memoryActions.memoryGitGraph,
    memoryGitCommitDiff: memoryActions.memoryGitCommitDiff,
    profileActivity: usageActions.profileActivity,
    profileSessionUsage: usageActions.profileSessionUsage,
    overviewMemory: memoryActions.overviewMemory,
    overviewUsage: usageActions.overviewUsage,
    marketplaceList: marketplaceActions.marketplaceList,
    marketplaceChallenge: marketplaceActions.marketplaceChallenge,
    marketplaceSubmit: marketplaceActions.marketplaceSubmit,
    marketplaceReport: marketplaceActions.marketplaceReport,
    marketplaceTopics: marketplaceActions.marketplaceTopics,
    marketplaceSections: marketplaceActions.marketplaceSections,
    marketplaceDigests: marketplaceActions.marketplaceDigests,
    marketplaceDigest: marketplaceActions.marketplaceDigest,
    marketplaceAvatarList: marketplaceActions.marketplaceAvatarList,
    marketplaceAvatarDetail: marketplaceActions.marketplaceAvatarDetail,
    marketplaceAvatarPublish: marketplaceActions.marketplaceAvatarPublish,
    marketplaceDetail: marketplaceActions.marketplaceDetail,
    marketplaceFile: marketplaceActions.marketplaceFile,
    marketplaceAccount: marketplaceActions.marketplaceAccount,
    marketplaceAuthorSave: marketplaceActions.marketplaceAuthorSave,
    marketplaceAuthorAvatarSet: marketplaceActions.marketplaceAuthorAvatarSet,
    marketplaceUploadPlan: marketplaceActions.marketplaceUploadPlan,
    marketplaceUpload: marketplaceActions.marketplaceUpload,
    marketplaceMine: marketplaceActions.marketplaceMine,
    marketplaceDelete: marketplaceActions.marketplaceDelete,
    shareDraftStart: marketplaceActions.shareDraftStart,
    async shareDraftGet(slug) {
      const result = await call('shareDraftGet', { slug });
      if (result.ok) return result.value as ShareDraftView;
      if (result.error.code === 'share-draft-not-found') return undefined;
      throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
    },
    shareDraftDiscard: marketplaceActions.shareDraftDiscard,
    shareDraftExport: marketplaceActions.shareDraftExport,
    marketplaceInstallReview: marketplaceActions.marketplaceInstallReview,
    marketplaceInstall: marketplaceActions.marketplaceInstall,
    profileUsage: usageActions.profileUsage,
    channelActivityToday: usageActions.channelActivityToday,
    groupProfileActivity: usageActions.groupProfileActivity,
    ...createMessagingActions(call),
    ...createTriggerActions(call),
    memoryWorkingChanges: memoryActions.memoryWorkingChanges,
    memoryWorkingDiff: memoryActions.memoryWorkingDiff,
    memoryRecoveryHistory: memoryActions.memoryRecoveryHistory,
    memoryRestore: memoryActions.memoryRestore,
    memoryRestoreCommit: memoryActions.memoryRestoreCommit,
    memoryNameVersion: memoryActions.memoryNameVersion,
    memoryRemoveVersionName: memoryActions.memoryRemoveVersionName,
    memoryVersions: memoryActions.memoryVersions,
    memorySave: memoryActions.memorySave,
    memoryRepair: memoryActions.memoryRepair,
    openSession: sessionsActions.actions.openSession,
    readSessions: sessionsActions.actions.readSessions,
    refreshSessions: sessionsActions.actions.refreshSessions,
    setSessionArchived: sessionsActions.actions.setSessionArchived,
    stopSession: sessionsActions.actions.stopSession,
    allBotPreview: composerActions.actions.allBotPreview,
    subscribeSkillCatalog: composerActions.actions.subscribeSkillCatalog,
    skillCatalog: composerActions.actions.skillCatalog,
    sessionSkillCatalog: composerActions.actions.sessionSkillCatalog,
    botSkills: composerActions.actions.botSkills,
    skillDetail: composerActions.actions.skillDetail,
    botSkillRemove: composerActions.actions.botSkillRemove,
    validateComposerDraft: composerActions.actions.validateComposerDraft,
    send: composerActions.actions.send,
    submissions: composerActions.actions.submissions,
    dismissFailedMessage: composerActions.actions.dismissFailedMessage,
    createBot: botsActions.actions.createBot,
    openCreatedBot: botsActions.actions.openCreatedBot,
    importBotZip: botsActions.actions.importBotZip,
    botZipFiles: botsActions.actions.botZipFiles,
    exportBotZip: botsActions.actions.exportBotZip,
    previewBotImport: botsActions.actions.previewBotImport,
    createGroup: channelsActions.createGroup,
    setHumanNickname: channelsActions.setHumanNickname,
    renameChannel: channelsActions.renameChannel,
    setBotAppearance: botsActions.actions.setBotAppearance,
    loadPartLibrary: botsActions.actions.loadPartLibrary,
    exportLibraryParts: botsActions.actions.exportLibraryParts,
    importLibraryParts: botsActions.actions.importLibraryParts,
    importLibraryImage: botsActions.actions.importLibraryImage,
    addLibraryPart: botsActions.actions.addLibraryPart,
    updateBotProfile: botsActions.actions.updateBotProfile,
    setBotAvatar: botsActions.actions.setBotAvatar,
    setBotBanner: botsActions.actions.setBotBanner,
    setBotPrimaryColor: botsActions.actions.setBotPrimaryColor,
    setGroupAvatar: channelsActions.setGroupAvatar,
    inviteGroupBot: channelsActions.inviteGroupBot,
    cancelGroupInvitation: channelsActions.cancelGroupInvitation,
    decideGroupJoin: channelsActions.decideGroupJoin,
    removeGroupMember: channelsActions.removeGroupMember,
    channelAssignments: sessionsActions.actions.channelAssignments,
    sessionSubagents: sessionsActions.actions.sessionSubagents,
    assignmentWork: sessionsActions.actions.assignmentWork,
    sessionProgress: sessionsActions.actions.sessionProgress,
    sessionTranscript: sessionsActions.actions.sessionTranscript,
    sessionLive: sessionsActions.actions.sessionLive,
    sessionToolDetail: sessionsActions.actions.sessionToolDetail,
    sendSessionRequest: sessionsActions.actions.sendSessionRequest,
    sendOrchestratorMessage: sessionsActions.actions.sendOrchestratorMessage,
    groupWakePolicies: channelsActions.groupWakePolicies,
    setGroupWakePolicy: channelsActions.setGroupWakePolicy,
    async channelHistory() {
      const result = await call('channelHistory', {});
      if (!result.ok) throw new Error(result.error.message);
      return (result.value as { channels: ChannelHistoryItem[] }).channels;
    },
    async channelHistorySources(channelId, before) {
      const result = await call('channelHistorySources', {
        channelId,
        ...(before === undefined ? {} : { before }),
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value as { sources: PurgeSource[]; before?: string };
    },
    async channelPurgePreview(channelId, sourceEventIds) {
      const result = await call('channelPurgePreview', {
        channelId,
        sourceEventIds,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value as PurgePreview;
    },
    async channelPurgeConfirm(channelId, sourceEventIds, token) {
      const result = await call('channelPurgeConfirm', {
        channelId,
        sourceEventIds,
        token,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.value as { accepted: number; cleanupPending?: number };
    },
    deleteGroupChannel: channelsActions.deleteGroupChannel,
    createSection: rosterActions.actions.createSection,
    renameSection: rosterActions.actions.renameSection,
    removeSection: rosterActions.actions.removeSection,
    setChannelPinned: rosterActions.actions.setChannelPinned,
    reorderPinnedChannels: rosterActions.actions.reorderPinnedChannels,
    setChannelHidden: rosterActions.actions.setChannelHidden,
    setChannelMuted: rosterActions.actions.setChannelMuted,
    batchRoster: rosterActions.actions.batchRoster,
    movePinnedChannel: rosterActions.actions.movePinnedChannel,
    movePinnedChannelToFlat: rosterActions.actions.movePinnedChannelToFlat,
    assignChannel: rosterActions.actions.assignChannel,
    setSectionChannelOrder: rosterActions.actions.setSectionChannelOrder,
    moveChannel: rosterActions.actions.moveChannel,
    reorderSections: rosterActions.actions.reorderSections,
    reorderFlat: rosterActions.actions.reorderFlat,
    moveToFlat: rosterActions.actions.moveToFlat,
    ensureChannelPins: rosterActions.actions.ensureChannelPins,
    ensureFlatTopOrder: rosterActions.actions.ensureFlatTopOrder,
  };
  return actions;
}
