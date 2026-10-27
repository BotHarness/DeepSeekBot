import { useState, type ReactElement } from 'react';

import { MessageReading } from './channel-delivery-receipt.js';
import type { BotHarnessTranslate } from './locale.js';
import { MessageReactionChips } from './message-reactions.js';
import type { BotSummary, ChannelReaction } from './store.js';

const NO_READERS: readonly string[] = [];

export function keptReactions(
  shown: readonly ChannelReaction[],
  current: readonly ChannelReaction[],
): readonly ChannelReaction[] {
  const byEmoji = new Map(current.map((reaction) => [reaction.emoji, reaction]));
  const kept = shown.map((reaction) => byEmoji.get(reaction.emoji) ?? reaction);
  const known = new Set(shown.map((reaction) => reaction.emoji));
  const next = [...kept, ...current.filter((reaction) => !known.has(reaction.emoji))];
  return next.length === shown.length && next.every((reaction, index) => reaction === shown[index])
    ? shown
    : next;
}

export function BubbleBadges({
  reactions,
  readers,
  mine,
  names,
  onReact,
  bots,
  t,
}: {
  reactions: readonly ChannelReaction[];
  readers: readonly string[];
  mine: boolean;
  names(actor: ChannelReaction['actors'][number]): string;
  onReact?: ((emoji: string, active: boolean) => void) | undefined;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [still] = useState(() => new Set(reactions.map((reaction) => reaction.emoji)));
  const [chips, setChips] = useState(reactions);
  const shownChips = keptReactions(chips, reactions);
  if (shownChips !== chips) setChips(shownChips);
  const [readingStill, setReadingStill] = useState(readers.length > 0);
  if (readingStill && readers.length === 0) setReadingStill(false);
  const [shownReaders, setShownReaders] = useState(readers);
  if (readers.length > 0 && readers.join('\n') !== shownReaders.join('\n'))
    setShownReaders(readers);
  if (shownChips.length === 0 && shownReaders.length === 0) return null;
  return (
    <div className="bh-bubble-badges">
      <MessageReactionChips
        reactions={shownChips}
        mine={mine}
        names={names}
        onReact={onReact}
        live={new Set(reactions.map((reaction) => reaction.emoji))}
        still={still}
        onLeft={(emoji) => {
          still.delete(emoji);
          setChips((current) => current.filter((reaction) => reaction.emoji !== emoji));
        }}
        t={t}
      />
      <MessageReading
        readers={shownReaders}
        bots={bots}
        motion={readers.length === 0 ? 'leave' : readingStill ? undefined : 'enter'}
        onLeft={() => setShownReaders(NO_READERS)}
        t={t}
      />
    </div>
  );
}
