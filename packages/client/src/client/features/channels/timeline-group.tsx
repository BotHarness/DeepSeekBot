import type { TimelineWindow } from '../../timeline-window.js';
import type { ReactElement } from 'react';
import { ChannelDeliveryReceipt } from '../../channel-delivery-receipt.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { MessageGroup } from '../../message-groups.js';
import { MemoryCommitLine } from '../../memory-commit-line.js';
import { ModelSwitchLine } from '../../model-switch-line.js';
import { AutoApprovalLine, AutoApprovalPauseLine } from '../../approval-template-entry.js';
import { BotChannelPostLine, elsewhereAction } from '../../bot-channel-post-line.js';
import type { BotSummary, ChannelMessage, ChannelSummary } from '../../store.js';
import { TimelineUnreadDivider } from '../../timeline-unread-divider.js';
import { TurnStopLine } from '../../turn-stop-line.js';
import { VoiceCallRecordBubble } from '../../voice-call-record.js';
import type { InboxTarget } from './message-group-view.js';
import type { DmMemoryDisplay } from '../../dm-actions.js';

export interface TimelineGroupInputs {
  messageGroups: readonly MessageGroup[];
  timelineWindow: TimelineWindow;
  unreadAfter: string | undefined;
  channel: ChannelSummary | undefined;
  bots: readonly BotSummary[];
  channels: readonly ChannelSummary[];
  dmBotSlug: string | undefined;
  memoryDisplay: DmMemoryDisplay;
  switchToModel(botSlug: string): Promise<void>;
  onOpenInbox(target: InboxTarget): void;
  onOpenChannelMessage(channelId: string, messageId: string): void;
  onOpenMemoryCommit(commit: NonNullable<ChannelMessage['memoryCommit']>): void;
  renderBotCreateAction(
    first: ChannelMessage,
    action: NonNullable<ChannelMessage['botCreateAction']>,
  ): ReactElement;
  renderMessageGroup(group: MessageGroup): ReactElement;
  renderBotDmAction(
    first: ChannelMessage,
    dmAction: NonNullable<ChannelMessage['botDmAction']>,
  ): ReactElement;
  t: BotHarnessTranslate;
}

export function renderTimelineGroup(
  index: number,
  {
    messageGroups,
    timelineWindow,
    unreadAfter,
    channel,
    bots,
    channels,
    dmBotSlug,
    memoryDisplay,
    switchToModel,
    onOpenInbox,
    onOpenChannelMessage,
    onOpenMemoryCommit,
    renderBotCreateAction,
    renderMessageGroup,
    renderBotDmAction,
    t,
  }: TimelineGroupInputs,
): ReactElement {
  const group = messageGroups[index]!;
  const first = group.messages[0]!;
  const previous = messageGroups[index - 1]?.messages.at(-1);
  const firstDay = Number.isFinite(Date.parse(first.at))
    ? new Date(first.at).toDateString()
    : undefined;
  const previousDay =
    previous !== undefined && Number.isFinite(Date.parse(previous.at))
      ? new Date(previous.at).toDateString()
      : undefined;
  return (
    <div
      ref={timelineWindow.blockRef(group.key)}
      className="bh-message-block"
      data-group-key={group.key}
      data-follows={index > 0 ? '' : undefined}
    >
      {unreadAfter !== undefined && previous?.id === unreadAfter ? (
        <TimelineUnreadDivider label={t('messages.newDivider')} />
      ) : null}
      {firstDay !== undefined && firstDay !== previousDay ? (
        <div className="bh-message-day">
          {new Date(first.at).toLocaleDateString(t('main.date.locale'), {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      ) : null}
      {first.toolAutoApproval !== undefined ? (
        <AutoApprovalLine messageId={first.id} record={first.toolAutoApproval} bots={bots} t={t} />
      ) : first.toolAutoApprovalPause !== undefined ? (
        <AutoApprovalPauseLine
          messageId={first.id}
          record={first.toolAutoApprovalPause}
          bots={bots}
          t={t}
        />
      ) : first.voiceCallRecord !== undefined ? (
        <VoiceCallRecordBubble messageId={first.id} record={first.voiceCallRecord} t={t} />
      ) : first.modelSwitch !== undefined ? (
        <ModelSwitchLine messageId={first.id} record={first.modelSwitch} bots={bots} t={t} />
      ) : first.turnStop !== undefined ? (
        <TurnStopLine
          messageId={first.id}
          stop={first.turnStop}
          t={t}
          switchToModel={switchToModel}
        />
      ) : first.memberDeparture !== undefined ? (
        <div className="bh-member-departure" data-message-id={first.id}>
          <span>
            {t(
              first.memberDeparture.departureType === 'removed' ? 'member.removed' : 'member.left',
              { name: first.memberDeparture.displayName },
            )}
          </span>
          <ChannelDeliveryReceipt
            message={first}
            bots={bots}
            humanMembers={channel?.humanMembers ?? []}
            onOpenInbox={(target) => onOpenInbox({ ...target, messageId: first.id })}
            t={t}
          />
        </div>
      ) : first.botChannelPost !== undefined ? (
        <BotChannelPostLine
          posts={group.messages}
          channels={channels}
          bots={bots}
          t={t}
          onOpen={(channelId, messageId) => onOpenChannelMessage(channelId, messageId)}
        />
      ) : first.memoryCommit !== undefined ? (
        <MemoryCommitLine
          messageId={first.id}
          commit={first.memoryCommit}
          compact={
            dmBotSlug !== undefined &&
            first.noticeOrigin !== undefined &&
            memoryDisplay === 'compact'
          }
          bots={bots}
          action={
            first.noticeOrigin === undefined
              ? undefined
              : elsewhereAction(
                  'memory',
                  first.noticeOrigin.channelId,
                  first.memoryCommit.botSlug,
                  channels,
                  bots,
                  t,
                )
          }
          t={t}
          onOpen={() => onOpenMemoryCommit(first.memoryCommit!)}
        />
      ) : first.botCreateAction !== undefined ? (
        renderBotCreateAction(first, first.botCreateAction)
      ) : first.botDmAction === undefined ? (
        renderMessageGroup(group)
      ) : (
        renderBotDmAction(first, first.botDmAction)
      )}
    </div>
  );
}
