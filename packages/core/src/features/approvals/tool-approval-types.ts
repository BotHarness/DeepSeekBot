import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import type { ChannelMessage } from '../../channels/channel.js';
import type { ApprovalDecider } from '../../team/approval-contract.js';
import type {
  ApprovalExcerptLimits,
  ApprovalReview,
  ApprovalReviewRequest,
  ApprovalReviewResult,
} from '../../workspaces/approval-reviewer.js';
import type { ToolApprovalActor } from '../../workspaces/tool-approval-actor.js';
import type { ToolEffects } from '../../workspaces/tool-effects.js';

export type ToolApprovalOriginQuery = {
  sessionId: Agent['session']['id'];
  callId: ToolExecution['callId'];
};

export type ToolApprovalOrigin = {
  kind: 'turn' | 'direct';
  channelId: string;
};

export interface BotCreatePreview {
  memoryFolder: string;
  defaultLocation: boolean;
  avatar?: string;
  avatarError?: string;
}

export type ToolApprovalReview =
  | { kind: 'template-unavailable'; reason: string }
  | { kind: 'review'; template: string; version: string; reason: string; fallback?: string };

export interface ToolApprovalRequestCard {
  effects?: ToolEffects;
  approvalReview?: ToolApprovalReview;
  opaque?: boolean;
  decidedBy?: ApprovalDecider;
  sessionId: string;
  callId: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
  externalDecision?: 'operation' | 'web-only' | 'each-use';
  botCreatePreview?: BotCreatePreview;
  allowAlways?: boolean;
}

export interface ToolApprovalNotice extends ToolApprovalRequestCard {
  botSlug: string;
  channelId: string;
  groupName?: string;
  messageId: string;
  expiresAt: string;
}

export interface ToolApprovalDecision {
  requestMessageId: string;
  actor?: ToolApprovalActor;
  decidedBy?: ApprovalDecider;
  outcome:
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected';
}

export interface ToolAutoApproval {
  template(botSlug: string): { name: string; text: string } | undefined;
  templateInUse?(template: string): boolean;
  review(request: ApprovalReviewRequest): Promise<ApprovalReviewResult>;
  excerptLimits?(botSlug: string): ApprovalExcerptLimits;
  log(entry: {
    botSlug: string;
    template: string;
    templateVersion?: string;
    toolName: string;
    outcome: ApprovalReview['outcome'];
    latencyMs: number;
    model?: string;
    reviewSession?: string;
    fallback?: string;
  }): void;
}

export type TrackedCall = ToolApprovalRequestCard &
  ToolApprovalOriginQuery & {
    botSlug: string;
    agent: Agent;
    scopeKey: string;
    automatic?: boolean;
    requireExplicitApproval?: boolean;
    humanReviewed?: boolean;
    reviewerApproved?: boolean;
    authorizationScope?: () => string;
    rememberable?: boolean;
    remembered?: boolean;
    execution: ToolExecution;

    authorized?: () => boolean;
    device?: 'computer' | 'browser';
  };
export type Pending = {
  botSlug: string;
  channelId: string;
  resolve(outcome: ApprovalOutcome): void;
  signal?: AbortSignal;
  sessionId: string;
  callId: string;
  abort(): void;
  deciding: boolean;
  committed: boolean;
  notice: ToolApprovalNotice;
  timer: ReturnType<typeof setTimeout>;
};

export type AutoRejectionOverrideResult =
  | { ok: true; message: ChannelMessage }
  | { ok: false; code: 'not-rejected' | 'already-overridden' | 'unavailable' };
