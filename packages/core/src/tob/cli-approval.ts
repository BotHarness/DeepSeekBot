import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { TobCliWriteProposal } from './cli-broker.js';
import { TobError } from './service.js';
import { toolApprovalRequired } from '../workspaces/tool-effects.js';
import { canonicalCliCommandName } from '../bots/cli-command-names.js';

export const ALWAYS_ASK_CLI_COMMANDS: ReadonlySet<string> = new Set([
  'release-install',
  'release-restart',
  'pause',
  'bot-delete-confirm',
  'bot-delete-retry',
  'bot-delete-memory-folder',
  'channel-purge-confirm',
  'data-reset-confirm',
  'group-delete',
  'marketplace-delete',
  'marketplace-avatar-delete',
  'memory-save',
  'memory-restore',
  'memory-restore-commit',
  'memory-repair',
  'profile-backup-restore',
  'profile-backup-activate',
  'profile-backup-recovery',
  'secret-put',
  'secret-unset',
  'im-credentials',
  'ask-secret-replace',
  'ask-secret-revoke',
  'ask-secret-submit',
  'connect-account-revoke',
  'connector-key-set',
  'connector-key-clear',
  'connector-connect',
  'connector-reconnect',
  'connector-grant',
  'connector-remove',
  'device-offer',
  'device-pair',
  'device-account-pair',
  'device-revoke',
  'pairing-review',
  'messaging-revoke',
]);

export function alwaysAsksHuman(command: string): boolean {
  return ALWAYS_ASK_CLI_COMMANDS.has(canonicalCliCommandName(command));
}

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
  const requireExplicitApproval = alwaysAsksHuman(command);
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
  const untrack = channelApproval?.track(call, 'operation', false, undefined, undefined, {
    requireExplicitApproval,
    ...(options.approvalChannelId === undefined
      ? {}
      : { origin: { kind: 'turn', channelId: options.approvalChannelId } }),
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
      reason: generic
        ? 'This Bot wants to run this exact deepseekbot command on this Host as you. Review patch.argv (and the stdin size and hash, if any); approve only if it is what you asked for.'
        : command.startsWith('memory-')
          ? `This Bot wants to change the Memory of ${'target' in operation ? operation.target : 'a Bot'}. Review patch.diff against previousValue.revision, the base commit it applies to; patch.takesEffect says when Sessions see it. If Memory changes before you decide, nothing is written.`
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
