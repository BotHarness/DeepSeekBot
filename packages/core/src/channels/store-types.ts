import type { ChannelQuote } from './quotes.js';
import type { ChannelPolicy } from '../team/channel-contract.js';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type { AcceptedQuestionReference } from './accepted-question-answer.js';
import type { HumanContext } from '../humans/context.js';
import type { ToolApprovalHistoryEntry, ToolApprovalHistoryPosition } from './approval-history.js';
import type { DatabaseSync } from 'node:sqlite';
import type { AllBotPreview } from './all-bot-mention.js';
import type { AttachmentMigrationResult } from '../attachments/legacy-migration.js';
import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';
import type { AttachmentStore } from '../attachments/store.js';
import type { MediaVersions } from '../attachments/media-versions.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type {
  RemoteBotParticipant,
  LocalHumanIdentity,
  HumanAvatar,
  BotCreateAction,
  ChannelMemoryCommit,
  ChannelMessage,
  ChannelMessageVoice,
  ChannelReaction,
  ChannelRecord,
  ChannelSessionLink,
  GroupInvitation,
  GroupJoinRequest,
  GroupWakePolicyActor,
  GroupWakePolicyView,
  BotMessageCausation,
} from './channel.js';
import type {
  ChannelFilesPage,
  ChannelFilesRequest,
  ChangedChannels,
  ChannelChangeCursor,
  ChannelChanges,
  ChannelChangesRequest,
  ChannelJournalPage,
  ChannelJournalRequest,
  ChannelTimelinePage,
  ChannelTimelineRequest,
} from './timeline.js';
import type { ChannelMessageQueryOptions, ChannelMessageQueryPage } from './store-query.js';

export interface ChannelStoreOptions {
  rootDir: string;
  attachments?: AttachmentStore;
  mediaVersions?: Pick<MediaVersions, 'describe'>;
  now?: () => Date;
  onCommitted?: (commit: ChannelMessageCommit) => void;
  onRecordChanged?: () => void;
  onAdmissionChanged?: (channelId: string, messageId: string, message: ChannelMessage) => void;
  onHumanReadChanged?: (channelId: string, humanId: string, revision: number) => void;
  onReactionChanged?: (channelId: string, messageId: string, reactions: ChannelReaction[]) => void;
  onVoiceChanged?: (channelId: string, messageId: string, message: ChannelMessage) => void;
  onAttachmentsChanged?: (channelId: string, messageId: string, message: ChannelMessage) => void;
  onSessionLinksChanged?: (channelId: string, messageId: string, message: ChannelMessage) => void;
  warn?: (message: string) => void;
  isBotActive?: (botSlug: string) => boolean;
  botDisplayName?: (botSlug: string) => string | undefined;
}

export interface ChannelMessageOrigin {
  sessionId: string;
  sourceEventId?: string;
}

export interface ChannelRequestProgress {
  state: 'working' | 'completed' | 'failed' | 'unknown';
  terminal: boolean;
  updatedAt: string;
}

export interface ChannelSendStatus {
  sourceEventId: string;
  state: string;
  progress: ChannelRequestProgress;
  replies: ChannelMessage[];
  assignmentId?: string;
}

export interface ChannelMessageCommit {
  channelId: string;
  message: ChannelMessage;
  revision: number;
  origin?: ChannelMessageOrigin;
}
export type ChannelAppendOnceResult =
  | { status: 'appended'; message: ChannelMessage }
  | { status: 'existing'; message: ChannelMessage }
  | { status: 'conflict' }
  | { status: 'missing' };

export interface ChannelReadPosition {
  messageId: string;
  revision: number;
  readAt: string;
}

export interface ChannelReadOptions {
  before?: string;
  limit?: number;
}

export interface HumanMessageSearchRequest {
  text: string;
  limit: number;
  cursor?: string;
  excludeChannelIds?: readonly string[];
}

export interface HumanMessageSearchHit {
  channelId: string;
  message: ChannelMessage;
  snippet: string;
}

export interface HumanMessageSearchPage {
  hits: HumanMessageSearchHit[];
  nextCursor?: string;
}

export interface CreateChannelGroupInput {
  id?: string;
  name: string;
  members: string[];
  ownerBotSlug?: string;
}

export interface ChannelStore {
  requireHumanPolicy?(human: HumanContext, id: string, key: keyof ChannelPolicy): void;
  bindHumanAccess?(access: {
    requireBotJoin?(slug: string, channelId: string): void;
    requireBotPost?(slug: string, channel: ChannelRecord): void;
    requireDm?(human: HumanContext, slug: string): void;
    searchText?(human: HumanContext, channelId: string, messageId: string, text: string): string;
    canRead(human: HumanContext, id: string): boolean;
    requirePost(human: HumanContext, id: string, all: boolean, message?: ChannelMessage): void;
    requirePolicy(human: HumanContext, id: string, key: keyof ChannelPolicy): void;
  }): void;
  getOrCreateHumanDm?(human: HumanContext, id: string, participants: string[]): ChannelRecord;

  genuiView?(
    human: HumanContext,
    channelId: string,
    messageId: string,
  ): import('./genui.js').GenuiPrivateView;
  saveGenuiView?(
    human: HumanContext,
    channelId: string,
    messageId: string,
    snapshotId: string,
    expectedVersion: number,
    state: unknown,
  ): import('./genui.js').GenuiPrivateView;
  rootDir: string;
  humanIdentity(human: HumanContext): LocalHumanIdentity;
  setHumanDefaultName(human: HumanContext, displayName: string | null): LocalHumanIdentity;
  humanNickname(human: HumanContext, id: string): string | null | undefined;
  setHumanNickname(human: HumanContext, id: string, nickname: string | null): void;
  setHumanAvatar(human: HumanContext, avatar: string | null): LocalHumanIdentity;
  finishHumanProfileSetup(human: HumanContext): LocalHumanIdentity;
  humanAvatars(human: HumanContext, humanIds: readonly string[]): HumanAvatar[];
  list(): ChannelRecord[];
  get(id: string): ChannelRecord | undefined;
  hasHumanMembership?(human: HumanContext, id: string): boolean;
  listHumanMembers(
    human: HumanContext,
    id: string,
  ): Array<{ humanId: string; displayName: string; avatarVersion?: string }>;

  latestHumanMessageId?(human: HumanContext, id: string): string | undefined;
  latestMessage(id: string): ChannelMessage | undefined;

  hasMessage(id: string, messageId: string): boolean;
  message(id: string, messageId: string): ChannelMessage | undefined;
  storedQuotes(id: string, messageId: string): ChannelQuote[] | undefined;
  humanSendStatus?(id: string, messageId: string): ChannelSendStatus | undefined;
  observeOutput(
    human: HumanContext,
    id: string,
    messageId: string,
  ): ChannelOutputObservation | undefined;
  outputCheckpoint(): number | undefined;
  assertAttachmentRefs(refs: readonly ChannelAttachmentRef[]): void;

  referencedAttachmentHashes(): ReadonlySet<string>;
  migrateAttachments?(
    signal?: AbortSignal,
    events?: DiagnosticEvents,
  ): Promise<AttachmentMigrationResult>;
  projectMessageAttachments?(sourceEventId: string, message: ChannelMessage): ChannelMessage;
  attachmentReference?(
    channelId: string,
    messageId: string,
    identity: string,
  ): ChannelAttachmentRef | undefined;
  getOrCreateDm(human: HumanContext, botSlug: string, botName?: string): ChannelRecord | undefined;
  getOrCreateBotDm(
    human: HumanContext,
    firstBotSlug: string,
    secondBotSlug: string,
    name: string,
  ): ChannelRecord | undefined;
  remoteHostKey?(hostId: string): string | undefined;
  trustRemoteHostKey?(
    hostId: string,
    key: string,
    membership?: RemoteBotParticipant['membership'],
  ): void;
  getOrCreateRemoteBotDm(localBotSlug: string, remote: RemoteBotParticipant): ChannelRecord;
  createGroup(human: HumanContext, input: CreateChannelGroupInput): ChannelRecord;

  inviteGroupBot(input: {
    invitationId?: string;
    channelId: string;
    inviterBotSlug?: string;
    inviterHuman?: true;
    targetBotSlug: string;
    targetBotCreatedAt: string;
    targetDmChannelId: string;
    botCausation?: BotMessageCausation;
  }): GroupInvitation;
  setGroupAvatar(human: HumanContext, channelId: string, avatar: string | null): ChannelRecord;

  respondToGroupInvite(input: {
    invitationId: string;
    targetBotSlug: string;
    targetBotCreatedAt: string;
    accept: boolean;
  }): {
    channel: ChannelRecord;
    invitation: GroupInvitation;
  };

  requestGroupJoin(input: {
    channelId: string;
    requesterBotSlug: string;
    requesterBotCreatedAt: string;
    ownerDmChannelId?: string;
    botCausation?: BotMessageCausation;
  }): GroupJoinRequest;

  decideGroupJoin(input: {
    channelId: string;
    requestId: string;
    accept: boolean;
    decidedBy: 'human' | string;
    requesterBotCreatedAt: string;
    requesterDmChannelId: string;
    botCausation?: BotMessageCausation;
  }): { channel: ChannelRecord; request: GroupJoinRequest; notified: boolean };

  cancelGroupInvite(channelId: string, invitationId: string): ChannelRecord;
  cancelInvitationsForBot(botSlug: string): void;
  removeBotFromGroups(botSlug: string, commit?: (database: DatabaseSync) => void): void;
  getGroupWakePolicy(channelId: string, botSlug: string): GroupWakePolicyView;
  setGroupWakePolicy(
    channelId: string,
    botSlug: string,
    policy: {
      mode: 'all' | 'mentions' | 'digest' | 'silent';
      count: number;
      intervalSeconds: number;
      inherit?: boolean;
    },
    actor?: GroupWakePolicyActor,
  ): ChannelRecord;
  removeGroupMember(
    channelId: string,
    botSlug: string,
    departureType?: 'left' | 'removed',
  ): ChannelRecord;

  deleteGroup(channelId: string): void;
  appendMemoryCommits(input: {
    botSlug: string;
    causeSourceEventId: string;
    commits: ReadonlyArray<Omit<ChannelMemoryCommit, 'botSlug'>>;
  }): ChannelMessage[];
  appendBotCreateAction?(input: {
    botSlug: string;
    causeSourceEventId: string;
    created: BotCreateAction;
  }): ChannelMessage | undefined;
  rename(human: HumanContext, id: string, name: string): ChannelRecord | undefined;
  previewAllBotMention(id: string): AllBotPreview;
  grantRequestResolution?(channelId: string, requestMessageId: string): ChannelMessage | undefined;
  appendMessageOnce(
    human: HumanContext,
    id: string,
    message: ChannelMessage,
    preview?: AllBotPreview,
    origin?: ChannelMessageOrigin,
    canCommit?: (database?: DatabaseSync) => boolean,
  ): Promise<ChannelAppendOnceResult>;
  readPosition(human: HumanContext, id: string): ChannelReadPosition | undefined;
  markRead(
    human: HumanContext,
    id: string,
    messageId: string,
  ): Promise<ChannelReadPosition | undefined>;
  setHumanReaction?(
    human: HumanContext,
    id: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): ChannelReaction[] | undefined;
  setBotReaction?(
    id: string,
    botSlug: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): ChannelReaction[] | undefined;
  appendMessage(
    human: HumanContext,
    id: string,
    message: ChannelMessage,
    origin?: ChannelMessageOrigin,
    beforeCommit?: () => boolean,
  ): Promise<ChannelMessage | undefined>;
  reconcileQuestionAnswer(
    human: HumanContext | undefined,
    channelId: string,
    request: AcceptedQuestionReference,
    answer: AskUserQuestionAnswer,
  ): Promise<ChannelMessage | undefined>;
  readMessages(id: string, options?: ChannelReadOptions): ChannelMessage[];
  queryMessages(id: string, options?: ChannelMessageQueryOptions): ChannelMessageQueryPage;
  searchHumanMessages?(
    human: HumanContext,
    id: string,
    options: Pick<ChannelMessageQueryOptions, 'text' | 'cursor' | 'limit'>,
  ): ChannelMessageQueryPage | undefined;
  searchAllHumanMessages?(
    human: HumanContext,
    request: HumanMessageSearchRequest,
  ): HumanMessageSearchPage;
  readTimeline(id: string, request?: ChannelTimelineRequest): ChannelTimelinePage | undefined;
  readHumanTimeline(
    human: HumanContext,
    id: string,
    request?: ChannelTimelineRequest,
  ): ChannelTimelinePage | undefined;
  readHumanJournalPage(
    human: HumanContext,
    id: string,
    request: ChannelJournalRequest,
  ): ChannelJournalPage | undefined;
  readHumanFilesPage(
    human: HumanContext,
    id: string,
    request: ChannelFilesRequest,
  ): ChannelFilesPage | undefined;
  readHumanChanges?(
    human: HumanContext,
    id: string,
    request: ChannelChangesRequest,
  ): ChannelChanges | undefined;
  changeCursor?(): ChannelChangeCursor;
  channelChangeHead?(id: string): ChannelChangeCursor | undefined;
  readChangedChannels?(request: Omit<ChannelChangesRequest, 'limit'>): ChangedChannels;
  recordAttachmentChange?(fileId: string): number;
  rotateChangeEpoch?(): ChannelChangeCursor;
  revision(id: string): number;
  messagesAfter(id: string, revision: number): ChannelMessageCommit[] | undefined;
  admissionChanged?(channelId: string, messageId: string): void;
  setMessageVoice?(
    channelId: string,
    messageId: string,
    voice: ChannelMessageVoice,
    attachment?: ChannelAttachmentRef,
  ): ChannelMessage | undefined;
  addMessageSessionLinks?(
    channelId: string,
    messageId: string,
    links: readonly ChannelSessionLink[],
  ): ChannelMessage | undefined;

  latestBotActivity?(human: HumanContext): ReadonlyMap<string, number>;
  privateInputRequests?(): Array<{ channelId: string; messageId: string }>;
  humanMessageCounts?(
    human: HumanContext,
    from: string,
    to: string,
  ): Array<{
    channelId: string;
    author: ChannelMessage['author'];
    count: number;
  }>;
  admissionActivity?(botSlug: string, sinceIso: string): Array<{ at: string; reason: string }>;
  toolApprovalHistory?(
    botSlug: string,
    page: { after?: ToolApprovalHistoryPosition; limit: number },
  ): ToolApprovalHistoryEntry[];
}

export interface ChannelOutputObservation {
  position?: number;
  channel: Pick<ChannelRecord, 'id' | 'type' | 'name' | 'botSlug' | 'members' | 'deletedAt'>;
  message: Pick<ChannelMessage, 'id' | 'author' | 'body'>;
  humanParticipant: boolean;
  canRead: boolean;
}
