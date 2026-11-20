import type { AssignmentExecutionWait } from '../runtime/assignment-approval-capacity.js';
import type { BotRuntime } from '../runtime/bot-runtime.js';
import type { ChannelToolApproval, ToolApprovalNotice } from './tool-approval.js';

type ApprovalReader = {
  runtime?: Pick<BotRuntime, 'getAssignment' | 'assignmentApprovalWait'>;
  toolApproval?: Pick<ChannelToolApproval, 'status' | 'expiresAt'>;
};

type ApprovalRef = Pick<
  ToolApprovalNotice,
  'botSlug' | 'messageId' | 'role' | 'sessionId' | 'callId'
>;

export function readToolApprovalState(
  { runtime, toolApproval }: ApprovalReader,
  { botSlug, messageId, role, sessionId, callId }: ApprovalRef,
) {
  const assignment = role === 'assignment' ? runtime?.getAssignment(botSlug, sessionId) : undefined;
  const execution: AssignmentExecutionWait | 'running' | 'settled' | 'needs-repair' | undefined =
    assignment === undefined
      ? undefined
      : assignment.activity === 'error'
        ? 'needs-repair'
        : assignment.activity === 'working'
          ? ((runtime?.assignmentApprovalWait === undefined
              ? assignment.executionWait
              : runtime.assignmentApprovalWait(sessionId, callId)) ?? 'running')
          : 'settled';
  const status = toolApproval?.status(botSlug, messageId) ?? 'expired';
  const expiresAt = status === 'pending' ? toolApproval?.expiresAt(botSlug, messageId) : undefined;
  return {
    status,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(execution === undefined ? {} : { execution }),
  };
}
