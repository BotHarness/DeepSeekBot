import { approvalCommand, approvalContent } from './requests';
import type { ChannelWireMessage, ToolApprovalOutcome } from '@botharness/host-protocol/wire';
import type { MessageCard, ConversationMessage } from './conversation-contract';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function cardOf(channelId: string, message: ChannelWireMessage): MessageCard | undefined {
  if (message.toolApprovalRequest !== undefined) {
    if (message.contentPurge !== undefined) return { kind: 'tool-approval', channelId };
    const content = approvalContent(message.toolApprovalRequest);
    const subject = text(field(message.toolApprovalRequest, 'toolName'));
    const input = text(field(message.toolApprovalRequest, 'input'));
    const command =
      subject === undefined || input === undefined ? undefined : approvalCommand(subject, input);
    return {
      kind: 'tool-approval',
      channelId,
      ...(content === undefined ? {} : { approvalContent: content }),
      ...(subject === undefined ? {} : { subject }),
      ...(command === undefined ? {} : { command }),
    };
  }
  if (message.userQuestionRequest !== undefined) {
    const questions = field(message.userQuestionRequest, 'questions');
    const subject = Array.isArray(questions) ? text(field(questions[0], 'question')) : undefined;
    return { kind: 'user-question', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.privateInputRequest !== undefined) {
    const subject = text(field(message.privateInputRequest, 'purpose'));
    return { kind: 'private-input', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.takeoverRequest !== undefined && message.author.kind === 'bot') {
    const target = field(message.takeoverRequest, 'target');
    const title = text(field(message.takeoverRequest, 'title'));
    const expiresAt = text(field(message.takeoverRequest, 'expiresAt'));
    if ((target === 'computer' || target === 'browser') && title !== undefined && expiresAt)
      return {
        kind: 'takeover',
        channelId,
        subject: message.body,
        takeover: { target, title, expiresAt },
      };
  }
  if (message.grantRequest === true)
    return {
      kind: 'grant',
      channelId,
      ...(message.grantRequestResolved === true ? { resolved: true as const } : {}),
    };
  return undefined;
}

const OUTCOMES = new Set<string>([
  'allowed-once',
  'allowed-always-tool',
  'allowed-always-exact',
  'allowed-always-all',
  'rejected',
]);

export function resolvesOf(message: ChannelWireMessage): ConversationMessage['resolves'] {
  const decision = message.toolApprovalDecision;
  const decided = text(field(decision, 'requestMessageId'));
  const outcome = field(decision, 'outcome');
  if (decided !== undefined && typeof outcome === 'string' && OUTCOMES.has(outcome))
    return {
      requestId: decided,
      resolution: { kind: 'tool-approval', outcome: outcome as ToolApprovalOutcome },
    };
  const resolution = message.userQuestionResolution;
  const answered = text(field(resolution, 'requestMessageId'));
  const state = field(resolution, 'state');
  if (answered !== undefined && (state === 'answered' || state === 'cancelled'))
    return { requestId: answered, resolution: { kind: 'user-question', state } };
  const granted = text(field(message.grantRequestResolution, 'requestMessageId'));
  if (granted !== undefined) return { requestId: granted, resolution: { kind: 'grant' } };
  const handed = text(field(message.takeoverResolution, 'requestMessageId'));
  const ended = field(message.takeoverResolution, 'outcome');
  if (
    handed !== undefined &&
    (ended === 'done' || ended === 'failed' || ended === 'cancelled' || ended === 'expired')
  )
    return { requestId: handed, resolution: { kind: 'takeover', outcome: ended } };
  const provided = text(field(message.privateInputResolution, 'requestMessageId'));
  if (provided !== undefined) return { requestId: provided, resolution: { kind: 'private-input' } };
  return undefined;
}
