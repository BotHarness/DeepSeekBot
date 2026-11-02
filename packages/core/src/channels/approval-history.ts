import type { ToolApprovalActor, ToolApprovalDecision } from '../workspaces/tool-approval.js';
import type { ChannelMessage } from './channel.js';

export interface ToolApprovalHistoryEntry {
  channelId: string;
  requestMessageId: string;
  decisionMessageId: string;
  requestedAt: string;
  decidedAt: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
  outcome: ToolApprovalDecision['outcome'];
  actor?: ToolApprovalActor;
}

export interface ToolApprovalHistoryPosition {
  decidedAt: string;
  decisionMessageId: string;
}

export function toolApprovalHistoryEntry(
  channelId: string,
  decision: ChannelMessage,
  request: ChannelMessage,
  botSlug: string,
): ToolApprovalHistoryEntry | undefined {
  const answer = decision.toolApprovalDecision;
  const card = request.toolApprovalRequest;
  if (
    answer === undefined ||
    card === undefined ||
    answer.requestMessageId !== request.id ||
    request.author.kind !== 'bot' ||
    request.author.slug !== botSlug
  )
    return undefined;
  return {
    channelId,
    requestMessageId: request.id,
    decisionMessageId: decision.id,
    requestedAt: request.at,
    decidedAt: decision.at,
    toolName: card.toolName,
    role: card.role,
    cwd: card.cwd,
    input: card.input,
    outcome: answer.outcome,
    ...(answer.actor === undefined ? {} : { actor: answer.actor }),
  };
}

export function compareToolApprovalHistory(
  left: ToolApprovalHistoryPosition,
  right: ToolApprovalHistoryPosition,
): number {
  if (left.decidedAt !== right.decidedAt) return left.decidedAt < right.decidedAt ? 1 : -1;
  if (left.decisionMessageId === right.decisionMessageId) return 0;
  return left.decisionMessageId < right.decisionMessageId ? 1 : -1;
}
