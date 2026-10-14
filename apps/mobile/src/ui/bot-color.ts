import { resolveBotPrimaryColor } from '../../../../packages/core/src/bots/primary-color';
import type { RosterBot } from '../host/client';

export function botColor(bot: RosterBot): string {
  return resolveBotPrimaryColor({
    slug: bot.slug,
    displayName: bot.displayName,
    avatar: bot.avatarUrl,
    appearance: bot.appearance,
    avatarSeed: bot.avatarSeed,
    primaryColor: bot.primaryColor,
  }).color;
}
