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

export interface ChannelWireMessage extends WireMessage {
  author: WireAuthor;
  attachments?: readonly unknown[];
  bridgeMedia?: { items: readonly unknown[] };
  toolApprovalRequest?: unknown;
  userQuestionRequest?: unknown;
  privateInputRequest?: unknown;
  sessionFailure?: unknown;
  grantRequest?: true;
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

export type ChannelNotification =
  | { kind: 'admission'; channelId: string; messageId: string }
  | { kind: 'human-read'; channelId: string; humanId: string; revision: number }
  | { kind: 'draft-baseline'; channelId: string; revision: number; drafts: WireDraft[] }
  | { kind: 'draft'; draft: WireDraft }
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
  paused?: boolean;
  deleted?: boolean;
  aggregateState: AggregatedState;
}

export interface ChannelListItem {
  id: string;
  type: 'dm' | 'group' | (string & {});
  name: string;
  members: string[];
  botSlug?: string;
  deletedAt?: string;
  latestMessage?: WireMessage;
}

export type RosterLiveFrame =
  | { type: 'baseline'; placements: unknown[] }
  | { type: 'changed' }
  | { type: 'latest'; channelId: string; message: WireMessage }
  | { type: 'purged'; placements: unknown[] };

export interface ActivitySnapshot {
  generation: string;
  revision: number;
  bots: readonly { slug: string; state: AggregatedState }[];
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
}

export interface HumanAttentionPage {
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
