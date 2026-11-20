import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage, ChannelSummary } from './store.js';

type ElsewherePlace =
  | { kind: 'group'; name: string }
  | { kind: 'botDm'; peers: string }
  | { kind: 'unavailable' };

function elsewherePlace(
  channelId: string,
  actorSlug: string,
  channels: readonly ChannelSummary[],
  bots: readonly BotSummary[],
): ElsewherePlace {
  const channel = channels.find((candidate) => candidate.id === channelId);
  if (channel === undefined) return { kind: 'unavailable' };
  if (channel.type === 'group') return { kind: 'group', name: `#${channel.name}` };
  if (channel.remoteBot !== undefined)
    return { kind: 'botDm', peers: channel.remoteBot.displayName };
  const peers = channel.members
    .filter((slug) => slug !== actorSlug)
    .map((slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug);
  return { kind: 'botDm', peers: peers.join('、') };
}

export function elsewhereAction(
  action: 'posted' | 'memory',
  channelId: string,
  actorSlug: string,
  channels: readonly ChannelSummary[],
  bots: readonly BotSummary[],
  t: BotHarnessTranslate,
  count = 1,
): string {
  const place = elsewherePlace(channelId, actorSlug, channels, bots);
  if (place.kind === 'botDm') {
    if (action === 'memory') return t('memoryCommit.updatedMessaging', { name: place.peers });
    return count === 1
      ? t('dmTrace.messaged', { name: place.peers })
      : t('dmTrace.messagedMany', { name: place.peers, count });
  }
  const label = place.kind === 'group' ? place.name : t('dmTrace.place.unavailable');
  if (action === 'memory') return t('memoryCommit.updatedIn', { place: label });
  return count === 1
    ? t('dmTrace.posted', { place: label })
    : t('dmTrace.postedMany', { place: label, count });
}

export function BotChannelPostLine({
  posts,
  channels,
  bots,
  t,
  onOpen,
}: {
  posts: readonly ChannelMessage[];
  channels: readonly ChannelSummary[];
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  onOpen(channelId: string, messageId: string): void;
}): ReactElement {
  const latest = posts.at(-1)!;
  const post = latest.botChannelPost!;
  const slug = latest.author.kind === 'bot' ? latest.author.slug : '';
  const bot = bots.find((candidate) => candidate.slug === slug);
  const name = bot?.displayName ?? slug;
  const verb = elsewhereAction('posted', post.channelId, slug, channels, bots, t, posts.length);
  const preview = latest.botChannelPostPreview;
  return (
    <div className="bh-memory-commit-row">
      <button
        type="button"
        className="bh-memory-commit-line bh-dm-trace-line"
        data-message-id={latest.id}
        title={preview ?? t('dmTrace.unavailable')}
        onClick={() => onOpen(post.channelId, post.messageId)}
      >
        <span className="bh-bot-dm-action-bot">
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={slug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span>{verb}</span>
        <span className="bh-memory-commit-subject">
          {preview === null || preview === undefined ? t('dmTrace.unavailable') : preview}
        </span>
      </button>
    </div>
  );
}
