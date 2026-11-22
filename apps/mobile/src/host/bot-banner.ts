import type { HostClient } from '@botharness/host-client/client';
import { setBotBanner as writeBotBanner } from '@botharness/host-client/bot-control';
import { dmChannel, type ProfileBotRef } from './bot-profile';

export async function setBotBanner(
  client: HostClient,
  bot: ProfileBotRef,
  image: string | null,
): Promise<void> {
  const channelId = await dmChannel(client, bot);
  const banner = image === null ? null : { image };
  await writeBotBanner(client, { channelId, banner });
  await client.refresh().catch(() => undefined);
}
