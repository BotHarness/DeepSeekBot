import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { TobCliWriteProposal } from './cli-broker.js';
import { TobError } from './service.js';

export async function approveTobCliOperation(options: {
  execution: ToolExecution;
  operation: TobCliWriteProposal;
  signal: AbortSignal;
  authorize: () => void;
  approval: ApprovalService | undefined;
  channelApproval: ChannelToolApproval | undefined;
  fullAccess: () => boolean;
}): Promise<() => void> {
  const { execution, operation, signal, channelApproval, approval, authorize } = options;
  const actor = execution.agent;
  const command = 'command' in operation ? operation.command : 'settings-set';
  const requireHumanReview = [
    'release-install',
    'release-restart',
    'bot-delete-confirm',
    'bot-delete-retry',
  ].includes(command);
  const scope =
    'target' in operation &&
    (command.startsWith('model-plan-') ||
      command === 'model-preset-apply' ||
      command.startsWith('bot-') ||
      ['update', 'pause', 'resume'].includes(command))
      ? `bot:${operation.target}`
      : 'global';
  authorize();
  if (!actor || signal.aborted) throw new TobError('agent-context-expired');
  if (!requireHumanReview && options.fullAccess())
    return () => {
      authorize();
      if (signal.aborted || !options.fullAccess()) throw new TobError('approval-authority-changed');
    };
  const call = {
    ...execution,
    name: 'deepseekbot ' + command,
    callId: ToolCallId(`${execution.callId}:cli:${randomUUID()}`),
    arguments: Object.freeze({
      parentShellCallId: execution.callId,
      scope,
      ...operation,
    }),
    signal,
  };
  const untrack = channelApproval?.track(call, 'operation', false, undefined, undefined, {
    requireHumanReview,
  });
  if (!untrack || !approval || !channelApproval) {
    untrack?.();
    throw new TobError('approval-unavailable');
  }
  try {
    const outcome = await approval.request({
      agent: actor,
      toolName: call.name,
      callId: call.callId,
      reason:
        'Review the actual CLI target, previousValue, patch and expectedRevision. Restart interrupts running work and deletion may erase Memory; approve only the requested operation.',
      signal,
    });
    if (outcome !== 'allowed-once')
      throw new TobError(
        outcome === 'rejected'
          ? 'approval-denied'
          : outcome === 'cancelled'
            ? 'approval-cancelled'
            : 'approval-unavailable',
      );
    const guard = channelApproval.executionGuard(actor, call.callId);
    const check = () => {
      authorize();
      if (signal.aborted || !guard?.(call.name, call.arguments))
        throw new TobError('approval-authority-changed');
    };
    check();
    return check;
  } finally {
    untrack();
  }
}
