import type { ActivityItem } from '../../host/activity-sources';
import type { RosterBot } from '../../host/client';

export type ActivityAvatarKind =
  | { kind: 'group'; avatar: string | undefined }
  | { kind: 'bot'; bot: RosterBot }
  | { kind: 'initial'; initial: string };

export function activityAvatar(item: ActivityItem, bot: RosterBot | undefined): ActivityAvatarKind {
  if (item.kind === 'channel-unread' && !item.channelId?.startsWith('dm-'))
    return {
      kind: 'group',
      avatar: item.activitySource?.roster?.channels.find((channel) => channel.id === item.channelId)
        ?.avatar,
    };
  if (bot !== undefined) return { kind: 'bot', bot };
  return {
    kind: 'initial',
    initial: (Array.from(item.botSlug.trim())[0] ?? '#').toLocaleUpperCase(),
  };
}
