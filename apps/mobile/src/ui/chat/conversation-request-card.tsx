import { memo, useMemo } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import {
  type CardResolution,
  type ConversationMessage,
  type MessageCard,
} from '@botharness/host-client/conversation';
import type { Inbox } from '@botharness/host-client/inbox';
import {
  answerQuestion,
  decideApproval,
  handledHere,
  grantRequestPort,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '@botharness/host-client/requests';
import { ApprovalCard } from './approval-card';
import { GrantRequestCard } from './grant-request-card';
import { PrivateInputCard } from './private-input-card';
import { TakeoverCard } from './takeover-card';
import { type BubbleGroup } from './bubble-shape';
import { QuestionCard } from './question-card';

export const REQUEST_CARDS: ReadonlySet<string> = new Set([
  'tool-approval',
  'user-question',
  'grant',
  'takeover',
  'private-input',
]);

export const RequestCard = memo(function RequestCard({
  client,
  inbox,
  message,
  card,
  botSlug,
  botName,
  resolution,
  focused,
  replyInChat,
  answeredHere,
  group,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
  message: ConversationMessage;
  card: MessageCard;
  botSlug: string;
  botName: string;
  resolution: CardResolution | undefined;
  focused: boolean;
  replyInChat: boolean;
  answeredHere: boolean;
  group: BubbleGroup;
}) {
  const ref = useMemo<RequestRef>(
    () => ({ channelId: card.channelId, messageId: message.id, botSlug }),
    [card.channelId, message.id, botSlug],
  );
  const approval = useMemo(
    () => ({
      load: () => loadApproval(client, ref),
      decide: async (outcome: Parameters<typeof decideApproval>[2]) => {
        const result = await decideApproval(client, ref, outcome);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const question = useMemo(
    () => ({
      load: () => loadQuestion(client, ref),
      answer: async (answer: Parameters<typeof answerQuestion>[2]) => {
        const result = await answerQuestion(client, ref, answer);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const grant = useMemo(
    () => grantRequestPort(client, ref, () => void inbox?.refresh()),
    [client, inbox, ref],
  );

  const subject = card.subject === undefined ? {} : { subject: card.subject };
  if (card.kind === 'takeover' && card.takeover !== undefined)
    return (
      <TakeoverCard
        client={client}
        target={ref}
        takeover={card.takeover}
        sentence={card.subject ?? message.body}
        outcome={resolution?.kind === 'takeover' ? resolution.outcome : undefined}
        focused={focused}
        group={group}
      />
    );
  if (card.kind === 'private-input')
    return (
      <PrivateInputCard
        target={ref}
        botName={botName}
        purpose={card.subject}
        resolved={resolution?.kind === 'private-input'}
        focused={focused}
        group={group}
      />
    );
  if (card.kind === 'grant')
    return (
      <GrantRequestCard
        port={grant}
        botName={botName}
        resolved={card.resolved === true || resolution?.kind === 'grant'}
        decidedHere={handledHere(ref)}
        focused={focused}
        group={group}
      />
    );
  if (card.kind === 'tool-approval')
    return (
      <ApprovalCard
        port={approval}
        contentCleared={message.source?.message.contentPurge !== undefined}
        {...(card.approvalContent === undefined ? {} : { content: card.approvalContent })}
        {...subject}
        {...(card.command === undefined ? {} : { command: card.command })}
        {...(resolution?.kind === 'tool-approval' ? { resolution } : {})}
        decidedHere={handledHere(ref)}
        focused={focused}
        group={group}
      />
    );
  return (
    <QuestionCard
      port={question}
      botName={botName}
      {...subject}
      {...(resolution?.kind === 'user-question' ? { resolution } : {})}
      focused={focused}
      group={group}
      replyInChat={replyInChat}
      expandInput
      answeredHere={answeredHere || handledHere(ref)}
    />
  );
});
