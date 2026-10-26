import { describe, expect, it } from 'vitest';
import { botNameColor } from '../src/client/bot-name-color.js';
import { visibleDmMessages } from '../src/client/dm-actions.js';
import type { ChannelMessage } from '../src/shared/types.js';

const messages: ChannelMessage[] = [
  { id: 'm1', at: '2026-10-26T10:00:00.000Z', author: { kind: 'human' }, body: 'hi' },
  { id: 'm2', at: '2026-10-26T10:01:00.000Z', author: { kind: 'bot', slug: 'ada' }, body: 'hello' },
];

describe('timeline render stability (#2413)', () => {
  it('keeps the message array identity when nothing is hidden', () => {
    expect(visibleDmMessages(messages, [])).toBe(messages);
    expect(visibleDmMessages(messages, ['posts'])).not.toBe(messages);
  });

  it('returns the same Bot name colour from the cache', () => {
    const first = botNameColor('#ff6600', '#ffffff');
    expect(botNameColor('#ff6600', '#ffffff')).toBe(first);
    expect(botNameColor('#ff6600', '#151517')).not.toBe(first);
  });
});
