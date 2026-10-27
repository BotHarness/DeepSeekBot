import { describe, expect, it } from 'vitest';

import type { ConversationReaction } from '../src/host/conversation';
import { shownReactions } from '../src/ui/chat/reaction-presence';

const reaction = (emoji: string, count = 1): ConversationReaction => ({
  emoji,
  actors: Array.from({ length: count }, (_, index) => ({ kind: 'bot', id: `bot-${index}` })),
});

describe('reaction chips leaving', () => {
  it('keeps a removed chip in place so it can scale out', () => {
    const thumbs = reaction('👍');
    const heart = reaction('❤️');
    expect(shownReactions([thumbs, heart], [heart])).toEqual([thumbs, heart]);
  });

  it('takes the latest count for chips that stay and appends new chips', () => {
    const shown = [reaction('👍'), reaction('❤️')];
    const later = reaction('👍', 2);
    const fire = reaction('🔥');
    expect(shownReactions(shown, [fire, later])).toEqual([later, shown[1], fire]);
  });

  it('returns the same list when nothing changed', () => {
    const shown = [reaction('👍')];
    expect(shownReactions(shown, shown)).toBe(shown);
  });
});
