import type { Session } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import type { ClaudeStatus } from './claude-status.js';
import type { CodexStatus } from './codex-status.js';
import type { EngineId } from './engine-session.js';
import type { EngineRole } from './engine-store.js';

export const ENGINE_GATEWAY_TOOLS: ReadonlySet<string> = new Set([
  'bot_send_message',
  'channel_read',
  'inbox_resolve',
  'tool_search',
  'tool_call',
  'report_to_orchestrator',
]);

export interface EngineTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface EngineTurnRequest {
  botSlug: string;
  role?: EngineRole;
  cwd?: string;
  sessionId: string;
  channelId: string | undefined;
  input: string;
  instructions: string;
  tools: readonly EngineTool[];
  execute(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: EngineToolContext,
  ): Promise<unknown>;
  signal: AbortSignal;
}

export interface EngineTurnOutcome {
  turn?: number;
  endSeq?: number;
  text?: string;
}

export interface EngineToolApproval {
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
  device?: { kind: 'computer' | 'browser'; authorizationScope?: () => string };
}

export interface EngineToolContext {
  session: Session;
  readonly assignmentInputRevision?: number | undefined;
  ask(request: EngineToolApproval): Promise<ApprovalOutcome>;
}

export type EngineSessionState = 'starting' | 'running' | 'waiting-approval' | 'idle';

export interface EngineApprovalRequest {
  botSlug: string;
  sessionId: string;
  session: Session;
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
  device?: EngineToolApproval['device'];
  signal: AbortSignal;
}

export interface EngineSessionDescription {
  engine: EngineId;
  account?: string;
  state: EngineSessionState;
  quota?: EngineQuotaView;
}

export interface EngineQuotaView {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export interface EngineStatusReport {
  displayName: string;
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'] | ClaudeStatus['login'];
  quota?: EngineQuotaView;
}
