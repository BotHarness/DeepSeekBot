import type { ReactElement } from 'react';
import type { RosterBot, RosterView } from '../../../../apps/mobile/src/host/client.js';
import { isAvatarAppearance } from '../../../core/src/bots/avatar-appearance.js';
import { PersonaBotAvatar } from './avatar.js';
import { GroupChannelIcon, type GroupAvatarBot } from './group-avatar-stack.js';
import type { BotHarnessTranslate } from './locale.js';
import type { RemoteConversationTarget } from './remote-hosts.js';

function avatarBot(bot: RosterBot, avatars: ReadonlyMap<string, string>): GroupAvatarBot {
  const avatar = bot.avatarUrl === undefined ? undefined : avatars.get(bot.avatarUrl);
  return {
    slug: bot.slug,
    displayName: bot.displayName,
    ...(avatar === undefined ? {} : { avatar }),
    ...(isAvatarAppearance(bot.appearance) ? { appearance: bot.appearance } : {}),
    ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
  };
}

export function RemoteAvatar({
  roster,
  avatars,
  target,
  size,
  t,
}: {
  roster: RosterView | undefined;
  avatars: ReadonlyMap<string, string>;
  target: Pick<RemoteConversationTarget, 'botSlug' | 'channelId' | 'title'>;
  size: number;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (target.channelId !== undefined) {
    const channel = roster?.channels.find((entry) => entry.id === target.channelId);
    if (channel === undefined) return null;
    return (
      <GroupChannelIcon
        channel={channel}
        bots={new Map((roster?.bots ?? []).map((bot) => [bot.slug, avatarBot(bot, avatars)]))}
        preview
        className="bh-channel-slot"
        groupClassName="bh-group-channel-slot"
        size={size}
        hashSize={18}
        t={t}
      />
    );
  }
  if (target.botSlug === undefined) return null;
  const bot = roster?.bots.find((entry) => entry.slug === target.botSlug);
  const portrait = bot === undefined ? undefined : avatarBot(bot, avatars);
  return (
    <PersonaBotAvatar
      personaBotId={target.botSlug}
      preview
      name={portrait?.displayName ?? target.title}
      src={portrait?.avatar}
      appearance={portrait?.appearance}
      avatarSeed={portrait?.avatarSeed}
      size={size}
      indicator={false}
      t={t}
    />
  );
}
