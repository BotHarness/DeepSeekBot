import type { ActivityListSource } from './activity-list-view.js';
import type { ClientState, HumanAttentionItem } from '../../store.js';
import type { BotHarnessTranslate } from '../../locale.js';

export const categoryCopy = {
  unread: { title: 'activityList.unread', empty: 'activityList.empty.unread' },
  replies: {
    title: 'activityList.replies',
    empty: 'activityList.empty.replies',
  },
  action: { title: 'activityList.action', empty: 'activityList.empty.action' },
  info: { title: 'activityList.info', empty: 'activityList.empty.info' },
  handled: {
    title: 'activityList.handled',
    empty: 'activityList.empty.handled',
  },
} as const;

export function activityItemTitle(
  item: HumanAttentionItem,
  state: Pick<ClientState, 'channels'>,
  sourceFor: (item: HumanAttentionItem) => ActivityListSource | undefined,
  botName: (slug: string, item?: HumanAttentionItem) => string,
  t: BotHarnessTranslate,
): string {
  return item.kind === 'channel-unread'
    ? (
        sourceFor(item) === undefined
          ? state.channels.find((channel) => channel.id === item.channelId)?.type === 'dm'
          : sourceFor(item)!.isDirect(item.channelId)
      )
      ? botName(item.botSlug, item)
      : (item.channelName ?? botName(item.botSlug, item))
    : item.kind === 'group-join-request'
      ? t('activityList.groupJoin', {
          bot: botName(item.botSlug, item),
          channel: item.channelName ?? '',
        })
      : item.kind === 'private-input'
        ? t('activityList.privateInput', { bot: botName(item.botSlug, item) })
        : item.kind === 'takeover-request'
          ? t('activityList.takeover', { bot: botName(item.botSlug, item) })
          : item.kind === 'user-question'
            ? t('activityList.question', { bot: botName(item.botSlug, item) })
            : item.kind === 'tool-approval'
              ? t('activityList.approval', {
                  bot: botName(item.botSlug, item),
                })
              : item.kind === 'auto-rejection'
                ? t('activityList.autoRejection', {
                    bot: botName(item.botSlug, item),
                  })
                : item.kind === 'pairing-request'
                  ? t(
                      item.summary.startsWith('conversation')
                        ? 'activityList.pairingConversation'
                        : 'activityList.pairingManagement',
                      {
                        bot: botName(item.botSlug, item),
                        name: item.summary.split(' · ')[1] || t('pairing.unknownName'),
                      },
                    )
                  : item.kind === 'workspace-grant-request'
                    ? t('activityList.grant', {
                        bot: botName(item.botSlug, item),
                      })
                    : item.kind === 'assignment-waiting-human'
                      ? t('activityList.assignmentWaiting', {
                          bot: botName(item.botSlug, item),
                        })
                      : item.kind === 'assignment-blocked'
                        ? t('activityList.assignmentBlocked', {
                            bot: botName(item.botSlug, item),
                          })
                        : item.kind === 'assignment-report'
                          ? t('activityList.assignmentReport', {
                              bot: botName(item.botSlug, item),
                            })
                          : item.kind === 'bot-message-needs-repair'
                            ? t('activityList.repair', {
                                bot: botName(item.botSlug, item),
                              })
                            : botName(item.botSlug, item);
}
