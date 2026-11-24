import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { chatBottom, chatKeyboardOffset } from '../src/ui/primitives/chat-keyboard';
import { space } from '../src/ui/design/tokens';
import { chatsListSegments } from '../src/ui/shell/chats-paging';

describe('the Composer over the tab island', () => {
  it('keeps the home indicator inset and its keyboard gap without an island', () => {
    expect(chatBottom(34, 0)).toEqual({ safe: 34, island: 0 });
    expect(chatKeyboardOffset(chatBottom(34, 0))).toBe(34 - space.x3);
  });

  it('lets the island own the bottom edge so the keyboard lifts the Composer only past it', () => {
    expect(chatBottom(34, 90)).toEqual({ safe: 0, island: 90 });
    expect(chatKeyboardOffset(chatBottom(34, 90))).toBe(90);
  });
});

describe('Chats stack depth', () => {
  it('treats only the Chats list as the paging page', () => {
    expect(chatsListSegments(['(tabs)', '(home)'])).toBe(true);
    expect(chatsListSegments(['(tabs)', '(home)', 'index'])).toBe(true);
    expect(chatsListSegments(['(tabs)', '(home)', 'dm', '[slug]'])).toBe(false);
    expect(chatsListSegments(['(tabs)', '(home)', 'session', '[id]'])).toBe(false);
    expect(chatsListSegments(['(tabs)', '(activity)', 'activity'])).toBe(false);
  });
});
