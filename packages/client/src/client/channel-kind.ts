import type { BotSummary, ChannelSummary } from './store.js';

export function isHumanReadOnlyDmChannel(channel: ChannelSummary | undefined): boolean {
  return (
    channel?.type === 'dm' &&
    channel.botSlug === undefined &&
    (hasChannelBots(channel) || (channel.humanMembers?.length ?? 0) === 0)
  );
}

export function hasChannelBots(channel: ChannelSummary | undefined): boolean {
  return (
    channel !== undefined &&
    (channel.botSlug !== undefined || channel.remoteBot !== undefined || channel.members.length > 0)
  );
}

export function isBotDmChannel(channel: ChannelSummary | undefined): boolean {
  return (
    channel?.type === 'dm' &&
    channel.botSlug === undefined &&
    (channel.remoteBot === undefined ? channel.members.length === 2 : channel.members.length === 1)
  );
}

export function botDmTitle(channel: ChannelSummary, bots: readonly BotSummary[]): string {
  const names = channel.members.map(
    (slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug,
  );
  if (channel.remoteBot !== undefined) names.push(channel.remoteBot.displayName);
  return names.join(' ↔ ');
}
