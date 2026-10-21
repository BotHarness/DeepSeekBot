import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { ConversationMessage } from '../../../../apps/mobile/src/host/conversation.js';
import { messageForDisplay } from '../../../../apps/mobile/src/host/message-display.js';
import { parseStoredChannelMessage } from './bridge.js';
import { ChannelMessageBody, GrantRequestCard } from './channel-message-body.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMessageHost } from './message-host.js';
import { PrivateInputCard } from './private-input-card.js';
import { remoteMessageActions } from './remote-message-actions.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';

export function RemoteMessageBody({
  message,
  messages,
  t,
}: {
  message: ConversationMessage;
  messages: readonly ConversationMessage[];
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const actions = useMemo(
    () => (host === undefined ? undefined : remoteMessageActions(host, message.bot ?? '')),
    [host, message.bot],
  );
  const stored = useMemo(() => parseStoredChannelMessage(messageForDisplay(message)), [message]);
  if (stored === undefined || host === undefined) return <span>{message.body}</span>;
  const channelId = message.source?.channelId;
  const resolution = messages.find((entry) => entry.resolves?.requestId === message.id)?.resolves
    ?.resolution;
  let card: ReactNode;
  if (actions !== undefined && channelId !== undefined && !stored.contentPurged) {
    if (stored.toolApprovalRequest !== undefined)
      card = (
        <ToolApprovalCard
          message={stored}
          channelId={channelId}
          actions={actions}
          decision={resolution?.kind === 'tool-approval' ? resolution.outcome : undefined}
          t={t}
        />
      );
    else if (stored.userQuestionRequest !== undefined)
      card = (
        <UserQuestionCard
          message={stored}
          channelId={channelId}
          actions={actions}
          resolution={resolution?.kind === 'user-question' ? resolution.state : undefined}
          t={t}
        />
      );
    else if (stored.privateInputRequest !== undefined)
      card = <PrivateInputCard message={stored} channelId={channelId} actions={actions} t={t} />;
    else if (stored.grantRequest === true)
      card = (
        <GrantRequestCard
          message={stored}
          channelId={channelId}
          actions={actions}
          resolved={stored.grantRequestResolved === true || resolution?.kind === 'grant'}
          t={t}
        />
      );
  }
  return <ChannelMessageBody message={stored} channelId={channelId} requestCard={card} t={t} />;
}
