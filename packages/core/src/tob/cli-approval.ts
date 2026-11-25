import { cliEffects } from '../bots/cli-effects.js';
import { canonicalCliCommandName } from '../bots/cli-command-names.js';
import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { TobCliWriteProposal } from './cli-broker.js';
import { TobError } from './service.js';
import { toolApprovalRequired } from '../workspaces/tool-effects.js';

export async function approveTobCliOperation(options: {
  execution: ToolExecution;
  operation: TobCliWriteProposal;
  signal: AbortSignal;
  authorize: () => void;
  approvalChannelId?: string | undefined;
  approval: ApprovalService | undefined;
  channelApproval: ChannelToolApproval | undefined;
  fullAccess: () => boolean;
}): Promise<() => void> {
  const { execution, operation, signal, channelApproval, approval, authorize } = options;
  const actor = execution.agent;
  const command = 'command' in operation ? operation.command : 'settings-set';
  const generic = 'via' in operation && operation.via === 'cli';
  const argv =
    generic &&
    typeof operation.patch === 'object' &&
    operation.patch !== null &&
    'argv' in operation.patch &&
    Array.isArray(operation.patch.argv)
      ? operation.patch.argv.filter((arg): arg is string => typeof arg === 'string')
      : [command];
  const canonical = canonicalCliCommandName(command);
  const requireExplicitApproval =
    [
      'bot-delete-confirm',
      'bot-delete-retry',
      'pause',
      'profile-backup-restore',
      'memory-save',
      'memory-restore-commit',
      'profile-backup-activate',
      'group-delete',
      'session-archive',
      'session-archive-set',
      'channel-purge-confirm',
      'data-reset-confirm',
    ].includes(canonical) ||
    (canonical === 'bots' && argv.includes('delete')) ||
    (canonical === 'engine' && ['login', 'account-remove'].includes(argv[1] ?? '')) ||
    cliEffects(argv)?.secrets === true ||
    /credential|password|pair|engine-(?:login|account-remove)/.test(canonical);
  const scope =
    !generic &&
    'target' in operation &&
    (command.startsWith('model-plan-') ||
      command === 'model-preset-apply' ||
      command.startsWith('bot-') ||
      command.startsWith('memory-') ||
      command === 'voice-set' ||
      command === 'voice-asr-set' ||
      ['update', 'pause', 'resume'].includes(command))
      ? `bot:${operation.target}`
      : 'global';
  authorize();
  if (!actor || signal.aborted) throw new TobError('agent-context-expired');
  if (
    !requireExplicitApproval &&
    !toolApprovalRequired('deepseekbot ' + command, operation, false) &&
    options.fullAccess()
  )
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
  const untrack = channelApproval?.track(
    call,
    requireExplicitApproval ? 'each-use' : 'operation',
    !requireExplicitApproval,
    undefined,
    undefined,
    {
      requireExplicitApproval,
      ...(options.approvalChannelId === undefined
        ? {}
        : { origin: { kind: 'turn', channelId: options.approvalChannelId } }),
    },
  );
  if (!untrack || !approval || !channelApproval) {
    untrack?.();
    throw new TobError('approval-unavailable');
  }
  try {
    const outcome = await approval.request({
      agent: actor,
      toolName: call.name,
      callId: call.callId,
      reason: generic
        ? 'Tob wants to run this exact deepseekbot command on this Host as you. Review patch.argv (and the stdin size and hash, if any); approve only if it is what you asked for.'
        : command.startsWith('memory-')
          ? `Tob wants to change the Memory of ${'target' in operation ? operation.target : 'a Bot'}. Review patch.diff against previousValue.revision, the base commit it applies to; patch.takesEffect says when Sessions see it. If Memory changes before you decide, nothing is written.`
          : 'Review the actual CLI target, previousValue, patch and expectedRevision. Restart interrupts running work and deletion may erase Memory; approve only the requested operation.',
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
    const guard = channelApproval.approvedExecutionGuard(actor, call.callId);
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
