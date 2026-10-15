import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) => {
      const attributes: Record<string, string> = {};
      for (const key of ['accessibilityLabel', 'accessibilityRole'])
        if (props[key] !== undefined) attributes[`data-${key.toLowerCase()}`] = String(props[key]);
      const content =
        typeof children === 'function' ? (children as (s: object) => unknown)({}) : children;
      return (
        <div data-native={name} {...attributes}>
          {content as never}
        </div>
      );
    };
    return Component;
  };
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

const { atLatest, unseenSince } = await import('../src/ui/chat/follow-latest');
const { JumpToLatest } = await import('../src/ui/chat/jump-to-latest');
const { t } = await import('../src/ui/strings');

function message(id: string, author: ConversationMessage['author']): ConversationMessage {
  return {
    id,
    at: '2026-10-15T07:00:00Z',
    author,
    body: id,
    attachments: [],
    delivery: 'committed',
  };
}

describe('following the latest message', () => {
  it('treats the first few points of the inverted list as the latest', () => {
    expect(atLatest(0)).toBe(true);
    expect(atLatest(-12)).toBe(true);
    expect(atLatest(40)).toBe(true);
    expect(atLatest(41)).toBe(false);
  });

  it('counts the Bot messages that arrived after the Human left the latest', () => {
    const messages = [
      message('a', 'bot'),
      message('b', 'human'),
      message('c', 'bot'),
      message('d', 'human'),
      message('e', 'system'),
    ];
    expect(unseenSince(messages, 'b')).toBe(2);
    expect(unseenSince(messages, 'e')).toBe(0);
    expect(unseenSince(messages, undefined)).toBe(3);
    expect(unseenSince(messages, 'gone')).toBe(0);
  });

  it('shows the unseen count on the jump button and names it for screen readers', () => {
    const quiet = renderToStaticMarkup(<JumpToLatest unseen={0} onPress={() => {}} />);
    expect(quiet).toContain(`data-accessibilitylabel="${t.jumpToLatest}"`);
    expect(quiet).not.toContain('data-native="Text"');

    const three = renderToStaticMarkup(<JumpToLatest unseen={3} onPress={() => {}} />);
    expect(three).toContain(`data-accessibilitylabel="${t.unseenLatest(3)}"`);
    expect(three).toContain('>3<');

    expect(renderToStaticMarkup(<JumpToLatest unseen={120} onPress={() => {}} />)).toContain(
      '>99+<',
    );
  });
});
