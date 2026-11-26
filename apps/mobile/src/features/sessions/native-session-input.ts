import { MethodRefused } from '@botharness/host-client/client';
import type { HostCall } from '@botharness/host-client/host-answer';
import {
  answerHostSessionApproval,
  answerHostSessionQuestion,
} from '@botharness/host-client/host-sessions';
import { savedHostIdentity, type SavedHost } from '@botharness/host-client/hosts';
import type {
  ApprovalChoice,
  ApprovalRequest,
  DecisionResult,
  QuestionRequest,
} from '@botharness/host-client/requests';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type {
  HostSessionApprovalDecision,
  HostSessionPendingInput,
} from '@botharness/host-protocol/host-sessions';
import type { QuestionAnswer } from '@botharness/host-protocol/wire';

export type NativeApprovalInput = Extract<HostSessionPendingInput, { kind: 'approval' }>;
export type NativeQuestionInput = Extract<HostSessionPendingInput, { kind: 'question' }>;

export function nativeSessionControls({
  native,
  host,
  running,
}: {
  native: boolean;
  host: SavedHost | null | undefined;
  running: boolean;
}): { answer: boolean; stop: boolean; archive: boolean } {
  const owner = native && host != null && savedHostIdentity(host).kind === 'owner';
  return { answer: owner, stop: owner && running, archive: owner && !running };
}

export function pendingInputKey(pending: readonly HostSessionPendingInput[] | undefined): string {
  return (pending ?? []).map((item) => `${item.kind}:${item.requestId}`).join('\n');
}

export function shownPendingInput(
  pending: readonly HostSessionPendingInput[] | undefined,
  handled: ReadonlySet<string>,
): HostSessionPendingInput[] {
  return (pending ?? []).filter((item) => !handled.has(item.requestId));
}

const NATIVE_REF = { channelId: '', messageId: '', botSlug: '' };

export function nativeApprovalRequest(
  input: NativeApprovalInput,
  context: { cwd?: string | undefined; items?: readonly SessionTranscriptItem[] },
): ApprovalRequest {
  const tool =
    input.callId === undefined
      ? undefined
      : context.items?.find((item) => item.kind === 'tool' && item.id === input.callId);
  const detail = tool?.kind === 'tool' ? tool.detail : undefined;
  return {
    ...NATIVE_REF,
    toolName: input.toolName,
    role: 'orchestrator',
    cwd: context.cwd ?? '',
    input: detail ?? input.reason ?? '',
    allowAlways: false,
    status: 'pending',
  };
}

export function nativeQuestionRequest(input: NativeQuestionInput): QuestionRequest {
  return { ...NATIVE_REF, questions: input.questions, status: 'pending' };
}

export function nativeApprovalDecision(choice: ApprovalChoice): HostSessionApprovalDecision {
  if (choice === 'allowed-once' || choice === 'rejected') return choice;
  throw new Error('Native Sessions accept Allow once or Reject only.');
}

function notPending(error: unknown): boolean {
  return error instanceof MethodRefused && error.code === 'session-input-not-pending';
}

async function settle(answer: () => Promise<unknown>): Promise<DecisionResult> {
  try {
    await answer();
    return 'accepted';
  } catch (error) {
    if (!notPending(error)) throw error;
    return 'decided';
  }
}

export function nativeApprovalPort(
  host: HostCall,
  sessionId: string,
  requestId: string,
  request: ApprovalRequest,
  onSettled: (result: DecisionResult) => void,
) {
  let status: ApprovalRequest['status'] = 'pending';
  return {
    load: () => Promise.resolve({ ...request, status }),
    async decide(choice: ApprovalChoice): Promise<DecisionResult> {
      const decision = nativeApprovalDecision(choice);
      const result = await settle(() =>
        answerHostSessionApproval(host, { sessionId, requestId, decision }),
      );
      status = 'decided';
      onSettled(result);
      return result;
    },
  };
}

export function nativeQuestionPort(
  host: HostCall,
  sessionId: string,
  input: NativeQuestionInput,
  onSettled: (result: DecisionResult) => void,
) {
  let status: QuestionRequest['status'] = 'pending';
  return {
    load: () => Promise.resolve({ ...nativeQuestionRequest(input), status }),
    async answer(answer: QuestionAnswer): Promise<DecisionResult> {
      const result = await settle(() =>
        answerHostSessionQuestion(host, { sessionId, requestId: input.requestId, answer }),
      );
      status = 'decided';
      onSettled(result);
      return result;
    },
  };
}
