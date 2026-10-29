import { expect, it } from 'vitest';
import { conversationTarget, swipeChatTarget } from '../src/ui/shell/swipe-chat-target';
const a = { id: 'a', title: 'A', href: '/dm/a?hostId=h1' };
const b = { id: 'b', title: 'B', href: '/channel/b?hostId=h1' };
it('uses the last available chat or the first visible one, and none for an empty list', () => {
  expect(swipeChatTarget([b, a], [a, b])).toBe(b);
  expect(swipeChatTarget([], [a, b])).toBe(a);
  expect(swipeChatTarget([{ ...b, href: '/channel/b?hostId=removed' }], [a, b])).toBe(a);
  expect(swipeChatTarget([b], [])).toBeUndefined();
});
it('requires a scoped conversation and decodes its identity without reusing another Host', () => {
  expect(conversationTarget('/dm/a%20b?hostId=h1')).toEqual({
    hostId: 'h1',
    place: { kind: 'dm', slug: 'a b' },
  });
  expect(conversationTarget(b.href)).toEqual({
    hostId: 'h1',
    place: { kind: 'channel', channelId: 'b' },
  });
  for (const href of [undefined, '/dm/a', '/settings?hostId=h1', '/dm/%ZZ?hostId=h1'])
    expect(conversationTarget(href)).toBeUndefined();
});
