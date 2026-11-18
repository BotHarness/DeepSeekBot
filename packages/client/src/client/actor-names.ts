import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelHumanMember, ChannelMessage, ChannelSummary } from './store.js';

export function channelHumanName(
  channel: Pick<ChannelSummary, 'humanMembers'> | undefined,
): string {
  return (
    channel?.humanMembers?.find((member) => member.humanId === 'local-human')?.displayName ??
    'Human'
  );
}

export function humanLabel(name: string, t: BotHarnessTranslate): string {
  return name === 'Human' ? t('channelActivity.human') : name;
}

export function humanAuthorName(
  author: Extract<ChannelMessage['author'], { kind: 'human' }>,
  channel: Pick<ChannelSummary, 'humanMembers'> | undefined,
  t: BotHarnessTranslate,
): string {
  if (author.deleted === true) return t('team.deletedMember');
  const humanId = author.humanId ?? 'local-human';
  const current = channel?.humanMembers?.find((member) => member.humanId === humanId);
  if (current !== undefined) return humanLabel(current.displayName, t);
  return author.displayName ?? humanLabel(channelHumanName(channel), t);
}

export function currentMentionLabel(
  mention:
    | NonNullable<ChannelMessage['mentions']>[number]
    | NonNullable<ChannelMessage['humanMentions']>[number],
  bots: readonly BotSummary[],
  humans: readonly ChannelHumanMember[],
): string {
  return 'humanId' in mention
    ? (humans.find((member) => member.humanId === mention.humanId)?.displayName ?? mention.label)
    : (bots.find((bot) => bot.slug === mention.botSlug)?.displayName ?? mention.label);
}
