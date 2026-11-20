import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type { ChannelMessage, LocalHumanIdentity } from './channel.js';

export interface AcceptedQuestionReference {
  messageId: string;
  sessionId: string;
  callId: string;
}

export function acceptedQuestionAnswer(
  request: ChannelMessage | undefined,
  reference: AcceptedQuestionReference,
  answer: AskUserQuestionAnswer,
  human?: LocalHumanIdentity,
): ChannelMessage | undefined {
  if (
    !request ||
    Reflect.get(request, 'contentPurge') !== undefined ||
    request.author.kind !== 'bot' ||
    request.id !== reference.messageId ||
    request.userQuestionRequest?.sessionId !== reference.sessionId ||
    request.userQuestionRequest.callId !== reference.callId
  )
    return undefined;
  return {
    id: request.id + ':accepted-answer',
    at: new Date().toISOString(),
    author: human
      ? { kind: 'human', humanId: human.humanId, displayName: human.displayName }
      : { kind: 'system' },
    body: answer.answers.map((item) => item.custom ?? item.selected.join(', ')).join('\n'),
    replyTo: request.id,
    userQuestionResolution: {
      requestMessageId: request.id,
      state: 'answered',
      answers: answer.answers,
      ...(human ? { decidedBy: { humanId: human.humanId, displayName: human.displayName } } : {}),
    },
  };
}
