import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import type { RoutingGroupEngineMember } from '@botharness/host-protocol/subscription-engine';

import type { Session } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import type { ClaudeQueryFactory } from './claude-engine.js';
import type { CodexProcessOptions, CodexTransport } from './codex-engine.js';
import type { EngineSessionPersistence, EngineSessionStore } from './engine-dsh-session.js';
import type { EngineGateway } from './engine-gateway.js';
import type { ClaudeStatus, startClaudeLogin } from './claude-status.js';
import type { CodexStatus } from './codex-status.js';
import type { EngineContextRecord } from './engine-context.js';
import type { EngineQuotaView } from './engine-quota.js';
import type { EngineId, EngineWorkspaceMode } from './engine-session.js';
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

export interface EngineHostOptions {
  root: string;
  local: boolean;
  codexCommand?: string;
  claudeCommand?: string;
  env?: Readonly<Record<string, string | undefined>>;
  gateway: EngineGateway;
  requireAccountGrant?(botSlug: string, accountId: string): void;
  routingGroupEffort?(botSlug: string): string | undefined;
  sessions(): EngineSessionStore | undefined;
  persistence(): EngineSessionPersistence | undefined;
  sessionIdsForBot?(botSlug: string): readonly string[];
  observeTurnTarget?(sessionId: string, turn: number, target: TurnTarget): void;
  changed?(): void;
  accountsChanged?(): void;
  accountUses?(id: string): readonly string[];
  observe?(botSlug: string, sessionId: string, state: EngineSessionState, role: EngineRole): void;
  approve?(request: EngineApprovalRequest): Promise<ApprovalOutcome>;
  idleMs?: number;
  releaseGraceMs?: number;
  now?: () => number;
  openCodex?(options: CodexProcessOptions): CodexTransport;
  detectCodex?(options: { command: string; home: string }): Promise<CodexStatus>;
  startCodexLogin?(options: {
    command: string;
    home: string;
    signal: AbortSignal;
    onExit(): void;
  }): Promise<{ url?: string }>;
  openClaude?: ClaudeQueryFactory;
  detectClaude?(options: { command: string; home: string }): Promise<ClaudeStatus>;
  startClaudeLogin?: typeof startClaudeLogin;
}

export interface EngineTurnRequest {
  botSlug: string;
  role?: EngineRole;
  target?: RoutingGroupEngineMember;
  groupEffort?: string | null;
  observeTurnTarget?(turn: number, step: number, target: TurnTarget): void;
  continuingFromNativeRoute?: true;
  cwd?: string;
  sessionCwd?: string;
  workspaceMode?(): EngineWorkspaceMode;
  releaseNativeSession?(): Promise<boolean>;
  sessionId: string;
  channelId: string | undefined;
  canUseChannel?(channelId: string): boolean;
  priorReplies?(): ReadonlySet<string>;
  input: string;
  instructions: string;
  readRecoveryContext?(): readonly EngineContextRecord[] | undefined;
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
  readonly priorReplies?: ReadonlySet<string> | undefined;
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
  accountId?: string;
  state: EngineSessionState;
  quota?: EngineQuotaView;
}

export type { EngineQuotaView } from './engine-quota.js';

export interface EngineStatusReport {
  displayName: string;
  accountId?: string;
  accountName?: string;
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'] | ClaudeStatus['login'];
  quota?: EngineQuotaView;
}
