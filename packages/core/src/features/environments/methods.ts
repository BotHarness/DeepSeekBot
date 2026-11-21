import type { ChannelRecord } from '../../channels/channel.js';
import { networkBotId } from '../../runtime/bot-contact-discovery.js';
import type { BotRuntime } from '../../runtime/bot-runtime.js';

export function remoteChannelContact(runtime: BotRuntime | undefined, channel: ChannelRecord) {
  const remoteContact =
    channel.remoteBot === undefined || channel.members[0] === undefined
      ? undefined
      : runtime?.botContacts?.(channel.members[0], {
          botId: networkBotId(channel.remoteBot.hostId, channel.remoteBot.botSlug),
        }).contacts[0];
  return remoteContact;
}

export function remoteChannelAvailability(
  runtime: BotRuntime | undefined,
  remoteBot: NonNullable<ChannelRecord['remoteBot']>,
) {
  return runtime?.networkBotAvailability?.(remoteBot.hostId, remoteBot.botSlug) ?? 'unavailable';
}
