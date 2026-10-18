import type { BotPrimaryColor } from '../../../../packages/core/src/bots/primary-color';

export type AggregatedState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

export interface WireMessage {
  id: string;
  at: string;
  body: string;
}

export type WireAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string }
  | { kind: 'system' };

export interface WireReaction {
  emoji: string;
  actors: { kind: 'human' | 'bot'; id: string }[];
}

export interface WireMention {
  botSlug: string;
  label: string;
  start: number;
  end: number;
}

export interface WireAllBotPreview {
  revision: string;
  recipients: { botSlug: string; label: string }[];
}

export interface WireAllBotMention {
  start: number;
  end: number;
  label: string;
  preview: WireAllBotPreview;
}

export interface ChannelWireMessage extends WireMessage {
  author: WireAuthor;
  mentions?: WireMention[];
  reactions?: WireReaction[];
  attachments?: readonly AttachmentRef[];
  bridgeMedia?: { items: readonly BridgeMediaItem[] };
  bridgeOrigin?: { sourceEventId: string };
  toolApprovalRequest?: unknown;
  userQuestionRequest?: unknown;
  privateInputRequest?: unknown;
  sessionFailure?: unknown;
  grantRequest?: true;
  toolApprovalDecision?: unknown;
  userQuestionResolution?: unknown;
  onboardingWelcome?: unknown;
  botDmAction?: unknown;
  botChannelPost?: unknown;
  botChannelPostPreview?: unknown;
  memoryCommit?: unknown;
  noticeOrigin?: unknown;
  botCreateAction?: unknown;
  memberDeparture?: unknown;
  turnStop?: unknown;
}

export interface BridgeMediaItem {
  id: string;
  kind: 'image' | 'file' | 'audio';
  name: string;
  sizeBytes?: number;
}

export interface AttachmentRef {
  name: string;
  mime: string;
  size: number;
  fileId?: string;
  hash?: string;
}

export interface JournalEntry {
  channelId: string;
  message: ChannelWireMessage;
  revision: number;
}

export interface JournalPage {
  entries: JournalEntry[];
  olderCursor: string | null;
  hasOlder: boolean;
}

export interface WireDraft {
  channelId: string;
  draftId: string;
  attemptId: string;
  botSlug: string;
  body: string;
  revision: number;
}

export interface WireDraftAppend {
  draftId: string;
  revision: number;
  base: number;
  offset: number;
  append: string;
}

export type ChannelNotification =
  | { kind: 'admission'; channelId: string; messageId: string }
  | { kind: 'human-read'; channelId: string; humanId: string; revision: number }
  | { kind: 'reaction'; channelId: string; messageId: string; reactions: WireReaction[] }
  | { kind: 'draft-baseline'; channelId: string; revision: number; drafts: WireDraft[] }
  | { kind: 'draft'; draft: WireDraft }
  | { kind: 'draft-append'; append: WireDraftAppend }
  | {
      kind: 'draft-settled' | 'draft-abandoned';
      event: { channelId: string; draftId: string; attemptId: string; revision: number };
    };

export type ChannelLiveFrame =
  | { type: 'opened'; cursor: number; page?: JournalPage }
  | { type: 'entry'; entry: JournalEntry }
  | { type: 'notification'; notification: ChannelNotification };

export interface SendStatus {
  sourceEventId: string;
  state: string;
  replies: ChannelWireMessage[];
}

export interface PersonaBotSummary {
  slug: string;
  displayName: string;
  avatar?: string;
  appearance?: unknown;
  avatarSeed?: 2;
  primaryColor?: BotPrimaryColor;
  roles?: string[];
  description?: string;
  computerAccess?: boolean;
  browserAccess?: boolean;
  paused?: boolean;
  deleted?: boolean;
  aggregateState: AggregatedState;
}

export interface MemoryStanding {
  path: string;
  role: 'soul' | 'coreMemory';
  chars: number;
  limit: number;
}

export interface MemorySnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
  standing: MemoryStanding[];
}

export interface MemoryFile {
  path: string;
  body: string;
  head: string;
  binary?: boolean;
}

export type ScheduleTrigger =
  | { kind: 'every'; everySeconds: number }
  | { kind: 'daily'; time: string; timeZone: string }
  | { kind: 'weekly'; time: string; timeZone: string; weekdays: number[] }
  | { kind: 'once'; date: string; time: string; timeZone: string }
  | { kind: 'cron'; expression: string; timeZone: string };

export type ScheduleFiringState = 'pending' | 'observed' | 'handled' | 'coalesced' | 'skipped';

export interface BotScheduleFiring {
  id: string;
  scheduleId: string;
  trigger: 'planned' | 'manual';
  occurrenceAt: string;
  firedAt: string;
  state: ScheduleFiringState;
}

export interface BotScheduleSummary {
  id: string;
  title: string;
  prompt?: string;
  trigger: ScheduleTrigger;
  enabled: boolean;
  nextRunAt?: string;
  lastFiring?: BotScheduleFiring;
}

export interface WorkspaceGrantSummary {
  id: string;
  workspacePath: string;
  workspaceTitle: string;
  revokedAt?: string;
  orchestratorWrite?: boolean;
}

export interface ProfileActivityDay {
  day: string;
  count: number;
}

export interface ProfileActivityReasonDay extends ProfileActivityDay {
  reason: string;
}

export interface ProfileTokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProfileActivityTokensDay extends ProfileTokenBuckets {
  day: string;
}

export interface ProfileModelUsageRow {
  partial?: boolean;
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}

export interface ProfileActivity {
  weeks: number;
  before?: string;
  createdDay?: string;
  today: string;
  events: ProfileActivityReasonDay[];
  memoryCommits: ProfileActivityDay[];
  tokens: ProfileActivityTokensDay[];
  modelUsageRows: ProfileModelUsageRow[];
  modelUsageStatus: 'ready' | 'unavailable';
}

export interface ChannelListItem {
  id: string;
  type: 'dm' | 'group' | (string & {});
  name: string;
  members: string[];
  botSlug?: string;
  avatar?: string;
  ownerBotSlug?: string;
  invitations?: WireGroupInvitation[];
  joinRequests?: WireGroupJoinRequest[];
  deletedAt?: string;
  latestMessage?: WireMessage;
}

export interface WireGroupInvitation {
  id: string;
  targetBotSlug: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

export interface WireGroupJoinRequest {
  id: string;
  requesterBotSlug: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

export type RosterLiveFrame =
  | { type: 'baseline'; placements: unknown[] }
  | { type: 'changed' }
  | { type: 'latest'; channelId: string; message: WireMessage }
  | { type: 'purged'; placements: unknown[] };

export interface WireToolActivity {
  effect: 'thinking-dots' | 'searching' | 'coding' | 'executing' | 'generic-working';
  toolName?: string;
  publicDetail?: string;
  activeToolCount: number;
}

export interface WireSessionActivity {
  id: string;
  role: 'orchestrator' | 'assignment' | 'subagent';
  name?: string;
  state: Exclude<AggregatedState, 'idle'>;
  activity?: WireToolActivity;
}

export interface WireBotActivity {
  slug: string;
  state: AggregatedState;
  activity?: WireToolActivity;
  sessions?: readonly WireSessionActivity[];
}

export interface ActivitySnapshot {
  generation: string;
  revision: number;
  bots: readonly WireBotActivity[];
}

export type ActivityLiveFrame =
  | { type: 'baseline'; snapshot: ActivitySnapshot }
  | { type: 'changed'; snapshot: ActivitySnapshot };

export interface ClientRequest {
  type: 'client-request';
  rpcId: string;
  method: string;
  payload: { args: Record<string, unknown> };
}

export type MuxClientFrame =
  | { type: 'open'; streamId: string; endpoint: string; payload: { args: Record<string, unknown> } }
  | { type: 'cancel'; streamId: string };

export type MuxServerFrame =
  | { type: 'item'; streamId: string; value?: unknown }
  | {
      type: 'error';
      streamId: string;
      error: { code: string; message: string; details: object };
    }
  | { type: 'end'; streamId: string };

export const REMOTE_STREAM_MUX_PATH = '/api/remote.mux';

export type HumanAttentionCategory = 'action' | 'info' | 'unread' | 'replies' | 'handled';

export interface HumanAttentionItem {
  id: string;
  category: HumanAttentionCategory;
  kind: string;
  createdAt: string;
  channelId?: string;
  channelName?: string;
  botSlug: string;
  summary: string;
  messageId?: string;
  responseMessageId?: string;
  unreadCount?: number;
  isUnread?: boolean;
}

export interface HumanAttentionPage {
  queryVersion?: number;
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface ToolApprovalRequestCard {
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
}

export type ToolApprovalOutcome =
  | 'allowed-once'
  | 'allowed-always-exact'
  | 'allowed-always-all'
  | 'rejected';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

export interface QuestionAnswerItem {
  id: string;
  selected: string[];
  custom?: string;
}

export interface QuestionAnswer {
  answers: QuestionAnswerItem[];
}

export interface TimelineMessage {
  id: string;
  body: string;
  toolApprovalRequest?: ToolApprovalRequestCard;
  toolApprovalDecision?: { requestMessageId: string; outcome: ToolApprovalOutcome };
  userQuestionRequest?: { questions: QuestionItem[] };
  userQuestionResolution?: { requestMessageId: string; state: 'answered' | 'cancelled' };
}

export interface TimelinePage {
  entries: TimelineMessage[];
}

export type ToolApprovalStatus = 'pending' | 'expired';
export type UserQuestionStatus = 'pending' | 'submitted' | 'answered' | 'expired';

export type UsagePeriod = 'today' | 'week' | 'month' | 'quarter';

export interface UsageBuckets {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  partial?: boolean;
}

export interface UsageBot extends UsageBuckets {
  slug: string;
  displayName: string;
  current: boolean;
  primaryColor: string;
}

export interface OverviewUsage {
  period: UsagePeriod;
  start: string;
  end: string;
  timezone: string;
  nextRefreshAt: string;
  totals: UsageBuckets;
  days: (UsageBuckets & { day: string })[];
  bots: UsageBot[];
  nextCursor?: string;
  freshness: 'ready' | 'reconciling' | 'degraded';
  readAt: string;
  reconciledAt: string | null;
  legacyBaseline: boolean;
}

export type MemoryActivityBot = { slug: string; displayName: string } & (
  | { state: 'ready'; total: number; counts: number[]; dirty: boolean }
  | { state: 'unavailable' }
);

export interface OverviewMemory {
  start: string;
  end: string;
  days: string[];
  timezone: string;
  readAt: string;
  nextRefreshAt: string;
  bots: MemoryActivityBot[];
  nextCursor?: string;
}
