import { setBotAvatar as writeBotAvatar } from '@botharness/host-client/bot-control';
import { dmChannel, type ProfileBotRef } from './bot-profile';
import type { HostClient } from '@botharness/host-client/client';

export async function setBotAvatar(
  client: HostClient,
  bot: ProfileBotRef,
  avatar: string | null,
): Promise<void> {
  const channelId = await dmChannel(client, bot);
  await writeBotAvatar(client, { channelId, avatar });
  await client.refresh().catch(() => undefined);
}
