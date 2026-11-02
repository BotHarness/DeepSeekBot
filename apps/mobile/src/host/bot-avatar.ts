import { dmChannel, type ProfileBotRef } from './bot-profile';
import type { HostClient } from './client';

export async function setBotAvatar(
  client: HostClient,
  bot: ProfileBotRef,
  avatar: string | null,
): Promise<void> {
  const channelId = await dmChannel(client, bot);
  await client.call('botAvatarSet', { channelId, avatar });
  await client.refresh().catch(() => undefined);
}
