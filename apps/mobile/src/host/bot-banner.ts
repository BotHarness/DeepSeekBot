import type { HostClient } from '@botharness/host-client/client';
import { readChangedBot } from '@botharness/host-client/bots';
import { dmChannel, type ProfileBotRef } from './bot-profile';

export async function setBotBanner(
  client: HostClient,
  bot: ProfileBotRef,
  image: string | null,
): Promise<void> {
  const channelId = await dmChannel(client, bot);
  const banner = image === null ? null : { image };
  readChangedBot(await client.call('botBannerSet', { channelId, banner }), 'botBannerSet');
  await client.refresh().catch(() => undefined);
}
