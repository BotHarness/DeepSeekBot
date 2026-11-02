import type { ChannelActivity } from '../../host/channel-activity';
import type { RosterView } from '../../host/client';
import type { ConversationMessage } from '../../host/conversation';
import { t } from '../strings';

export type ActivityTarget =
  | { pathname: '/channel/[id]'; params: { id: string; focus: string; focusWindow: 'latest' } }
  | { pathname: '/bot/[slug]/memory'; params: { slug: string } }
  | { pathname: '/dm/[slug]'; params: { slug: string } };

export interface ActivityText {
  botSlug?: string;
  name: string;
  verb: string;
  detail?: string;
  target?: ActivityTarget;
}

export function activityPeer(
  activity: ChannelActivity,
  actor: string | undefined,
  roster: RosterView | undefined,
): string | undefined {
  if (activity.kind === 'dm-action') return activity.recipientBotSlug;
  const channelId =
    activity.kind === 'channel-post'
      ? activity.channelId
      : activity.kind === 'memory'
        ? activity.noticeOrigin?.channelId
        : undefined;
  const channel = roster?.activityChannels?.find((entry) => entry.id === channelId);
  return channel?.type === 'dm' ? channel.members.find((slug) => slug !== actor) : undefined;
}

export function activityText(
  message: ConversationMessage,
  activity: ChannelActivity,
  roster: RosterView | undefined,
  count = 1,
  copy = t.activityRow,
): ActivityText {
  const botName = (slug: string, fallback = copy.unavailableBot) =>
    roster?.bots.find((bot) => bot.slug === slug)?.displayName ?? fallback;
  const actor = message.bot;
  const sender = {
    ...(actor === undefined ? {} : { botSlug: actor }),
    name: actor === undefined ? copy.human : botName(actor),
  };
  const elsewhere = (kind: 'post' | 'memory', channelId: string, botSlug: string) => {
    const channel = roster?.activityChannels?.find((entry) => entry.id === channelId);
    if (channel?.type === 'dm') {
      const peers = channel.members
        .filter((slug) => slug !== botSlug)
        .map((slug) => botName(slug))
        .join('、');
      return kind === 'memory' ? copy.memoryMessaging(peers) : copy.messaged(peers, count);
    }
    const group =
      channel?.type === 'group'
        ? channel
        : roster?.channels.find((entry) => entry.id === channelId);
    const place = group === undefined ? copy.unavailablePlace : `#${group.name}`;
    return kind === 'memory' ? copy.memoryIn(place) : copy.posted(place, count);
  };
  switch (activity.kind) {
    case 'dm-action':
      return {
        ...sender,
        verb: copy.dm(botName(activity.recipientBotSlug)),
        target: {
          pathname: '/channel/[id]',
          params: { id: activity.channelId, focus: activity.messageId, focusWindow: 'latest' },
        },
      };
    case 'channel-post':
      return {
        ...sender,
        verb: elsewhere('post', activity.channelId, actor ?? ''),
        detail: activity.preview ?? copy.unavailable,
        target: {
          pathname: '/channel/[id]',
          params: { id: activity.channelId, focus: activity.messageId, focusWindow: 'latest' },
        },
      };
    case 'bot-create':
      return {
        ...sender,
        verb: copy.created(
          roster?.bots.find((bot) => bot.slug === activity.botSlug)?.displayName ??
            activity.displayName,
        ),
        target: { pathname: '/dm/[slug]', params: { slug: activity.botSlug } },
      };
    case 'memory': {
      const { commit } = activity;
      const changed = (file: (typeof commit.files)[number]) =>
        (file.added ?? 0) + (file.deleted ?? 0);
      const main = commit.files.reduce<(typeof commit.files)[number] | undefined>(
        (best, file) => (best === undefined || changed(file) > changed(best) ? file : best),
        undefined,
      );
      const more = commit.files.length - 1 + commit.moreFiles;
      const file =
        main === undefined
          ? undefined
          : [
              main.path.split('/').at(-1),
              main.added ? `+${main.added}` : undefined,
              main.deleted ? `−${main.deleted}` : undefined,
            ]
              .filter((part) => part !== undefined)
              .join(' ');
      return {
        botSlug: commit.botSlug,
        name: botName(commit.botSlug, commit.authorName || copy.unavailableBot),
        verb:
          activity.noticeOrigin === undefined
            ? copy.memory
            : elsewhere('memory', activity.noticeOrigin.channelId, commit.botSlug),
        detail: [
          commit.subject,
          commit.sha.slice(0, 7),
          file,
          more > 0 ? copy.moreFiles(more) : undefined,
        ]
          .filter((part) => part !== undefined && part !== '')
          .join(' · '),
        target: { pathname: '/bot/[slug]/memory', params: { slug: commit.botSlug } },
      };
    }
    case 'departure':
      return {
        ...(activity.memberKind === 'bot' ? { botSlug: activity.memberId } : {}),
        name: activity.displayName,
        verb: activity.departureType === 'removed' ? copy.removed : copy.left,
      };
    case 'turn-stop':
      return { name: activity.humanName, verb: copy.stopped(activity.botName) };
  }
}
