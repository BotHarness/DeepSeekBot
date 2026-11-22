import * as stylex from '@stylexjs/stylex';
import { useTeamMember } from '../../team-state.js';
import type { ConversationStateView, BotSummary, ChannelSummary } from '../../store.js';
import { PanelEmptyState } from '../../ds/empty-state.js';
import type { ReactElement } from 'react';
import { isHumanDmChannel } from '../../channel-kind.js';
import type { BotHarnessTranslate } from '../../locale.js';

const messageStyles = stylex.create({
  emptyContainer: { display: 'flex', flexDirection: 'column', flexGrow: 1 },
});

export function Welcome({
  state,
  t,
}: {
  state: ConversationStateView;
  t: BotHarnessTranslate;
}): ReactElement {
  const member = useTeamMember();
  return (
    <div className="bh-root bh-main">
      <div className="bh-content" {...stylex.props(messageStyles.emptyContainer)}>
        <PanelEmptyState icon="messages-circle">
          {t(
            member
              ? 'team.firstRun.main'
              : state.bots.length === 0
                ? 'main.welcome.empty'
                : 'main.welcome.hint',
          )}
        </PanelEmptyState>
      </div>
    </div>
  );
}
export function EmptyConversation({
  channel,
  bot,
  t,
}: {
  channel: ChannelSummary | undefined;
  bot: BotSummary | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const member = useTeamMember();
  return (
    <div className="bh-chat-empty" {...stylex.props(messageStyles.emptyContainer)}>
      <PanelEmptyState icon="messages-circle">
        {isHumanDmChannel(channel)
          ? t('main.humanChat.hint')
          : channel?.type === 'group'
            ? `${channel.name} · ${t(member ? 'main.group.memberNote' : 'main.group.note')}`
            : `${bot === undefined ? t('main.localChat') : t('main.localChat.with', { name: bot.displayName })} · ${t('main.localChat.hint')}`}
      </PanelEmptyState>
    </div>
  );
}
