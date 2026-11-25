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

const cardOrText =
  <I extends { card: object }, R>(
    card: (input: I) => Promise<R>,
    text: ((input: I) => Promise<R>) | undefined,
  ) =>
  async (input: I): Promise<R> => {
    try {
      return await card(input);
    } catch (error) {
      if (
        !text ||
        ('kind' in input.card && input.card.kind === 'pairing') ||
        !(error instanceof MessagingProviderError) ||
        error.code !== 'capability-unavailable' ||
        error.disposition !== 'not-started'
      )
        throw error;
      return text(input);
    }
  };

const settled = (detail: string, reference: string) => `${detail.split('\n')[0]}\n#${reference}`;

export function approvalSurface(context: SurfaceContext): ApprovalSend | undefined {
  const card = context.provider.approvalCard;
  const text = approvalText(context);
  if (card && cards(context))
    return cardOrText<Parameters<ApprovalSend>[0], Awaited<ReturnType<ApprovalSend>>>(
      (input) => card.call(context.provider, input),
      text,
    );
  return text;
}

function approvalText(context: SurfaceContext): ApprovalSend | undefined {
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

type QuestionSurface = (
  input: Parameters<QuestionSend>[0] & { notice?: true },
) => ReturnType<QuestionSend>;

export function questionSurface(context: SurfaceContext): QuestionSurface | undefined {
  const card = context.provider.questionCard;
  const text = questionText(context);
  if (card && cards(context))
    return cardOrText<Parameters<QuestionSurface>[0], Awaited<ReturnType<QuestionSend>>>(
      ({ notice: _notice, ...input }) => card.call(context.provider, input),
      text,
    );
  return text;
}

function questionText(context: SurfaceContext): QuestionSurface | undefined {
  if (!context.provider.reply) return undefined;
  return async ({ notice, ...input }) => {
    if (input.update && input.card.status === 'pending' && !notice) return { updated: true };
    return sendText(
      context,
      input,
      input.update
        ? [
            ...(input.card.status === 'pending' ? [] : [QUESTION_STATUS[input.card.status]]),
            ...(input.card.status === 'answered' || input.card.status === 'pending'
              ? [input.card.detail]
              : []),
            `#${input.card.reference}`,
          ].join('\n')
        : renderQuestionText(input.card.questions, input.card.reference),
    );
  };
}
