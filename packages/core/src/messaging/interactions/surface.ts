import { isMessagingPlatform, messagingPlatform } from '../platforms/index.js';
import {
  MessagingProviderError,
  type MessagingProvider,
  type MessagingReceipt,
  type MessagingReplyRoute,
} from '../provider.js';
import { approvalReference, renderApprovalText } from './text-approvals.js';
import { renderQuestionText } from './text-answers.js';

type ApprovalSend = NonNullable<MessagingProvider['approvalCard']>;
type QuestionSend = NonNullable<MessagingProvider['questionCard']>;
interface SurfaceContext {
  provider: MessagingProvider;
  identity: { platform: string };
  paired?: { actorId: string };
}

const cards = (context: SurfaceContext) =>
  isMessagingPlatform(context.identity.platform) &&
  !!messagingPlatform(context.identity.platform).features.cards;

const replyRoute = (
  route: MessagingReplyRoute | MessagingReceipt,
  actorId: string,
): MessagingReplyRoute =>
  'actorId' in route
    ? route
    : { messageId: route.messageId, conversationId: route.conversationId, actorId };

async function sendText(
  context: SurfaceContext,
  input: Parameters<ApprovalSend>[0] | Parameters<QuestionSend>[0],
  text: string,
): Promise<{ sent?: true; updated?: true; receipt?: MessagingReceipt }> {
  if (!input.beforeSend()) throw new MessagingProviderError('request-expired', 'not-started');
  const result = await context.provider.reply!({
    accountRef: input.accountRef,
    fingerprint: input.fingerprint,
    route: replyRoute(input.route, context.paired?.actorId ?? ''),
    text,
    signal: input.signal,
    beforeSend: input.beforeSend,
  });
  if (input.update) return { updated: true };
  if (!result.receipt) throw new MessagingProviderError('provider-result-unknown', 'unknown');
  return { sent: true, receipt: result.receipt };
}

const settled = (detail: string, reference: string) => `${detail.split('\n')[0]}\n#${reference}`;

export function approvalSurface(context: SurfaceContext): ApprovalSend | undefined {
  const card = context.provider.approvalCard;
  if (card && cards(context)) return (input) => card.call(context.provider, input);
  if (!context.provider.reply) return undefined;
  return async (input) => {
    if (input.card.kind === 'pairing')
      throw new MessagingProviderError('capability-unavailable', 'not-started');
    const reference = approvalReference(input.card.requestId);
    if (input.update && input.card.status === 'pending') return { updated: true };
    return sendText(
      context,
      input,
      input.update
        ? settled(input.card.detail, reference)
        : renderApprovalText(input.card, reference),
    );
  };
}

const QUESTION_STATUS = {
  pending: '',
  answered: 'Answered / 已回答',
  cancelled: 'Cancelled / 已取消',
  expired: 'Expired / 已过期',
  'web-required': 'Answer not confirmed; check in Web / 回答结果未确认，请在 Web 核对',
} as const;

export function questionSurface(context: SurfaceContext): QuestionSend | undefined {
  const card = context.provider.questionCard;
  if (card && cards(context)) return (input) => card.call(context.provider, input);
  if (!context.provider.reply) return undefined;
  return async (input) => {
    if (input.update && input.card.status === 'pending') return { updated: true };
    return sendText(
      context,
      input,
      input.update
        ? [
            QUESTION_STATUS[input.card.status],
            ...(input.card.status === 'answered' ? [input.card.detail] : []),
            `#${input.card.reference}`,
          ].join('\n')
        : renderQuestionText(input.card.questions, input.card.reference),
    );
  };
}
