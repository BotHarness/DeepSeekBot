import type { AvatarRecipe } from '../../../../packages/core/src/bots/avatar-appearance';
import {
  setBotAppearance,
  setBotAvatar as writeBotAvatar,
} from '@botharness/host-client/bot-control';
import type { HostClient } from '@botharness/host-client/client';
import { dmChannel, type ProfileBotRef } from './bot-profile';

const pendingAvatars = new WeakMap<HostClient, Set<string>>();

async function updateAvatar(
  client: HostClient,
  bot: ProfileBotRef,
  write: (channelId: string) => Promise<unknown>,
): Promise<void> {
  const pending = pendingAvatars.get(client) ?? new Set<string>();
  if (pending.has(bot.slug)) throw new Error('Avatar change already in progress');
  pendingAvatars.set(client, pending);
  pending.add(bot.slug);
  try {
    await write(await dmChannel(client, bot));
    await client.refresh().catch(() => undefined);
  } finally {
    pending.delete(bot.slug);
  }
}

export function setBotAvatar(
  client: HostClient,
  bot: ProfileBotRef,
  avatar: string | null,
): Promise<void> {
  return updateAvatar(client, bot, (channelId) => writeBotAvatar(client, { channelId, avatar }));
}

export function setBotAvatarRecipe(
  client: HostClient,
  bot: ProfileBotRef,
  recipe: AvatarRecipe,
): Promise<void> {
  return updateAvatar(client, bot, (channelId) => setBotAppearance(client, { channelId, recipe }));
}
