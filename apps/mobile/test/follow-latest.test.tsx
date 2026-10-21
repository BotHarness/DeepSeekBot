import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

vi.mock('react-native', async () => {
  const { useWindowDimensions, StyleSheet } = await import('./react-native-shim');
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
    useWindowDimensions,
    StyleSheet,
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
    useColorScheme: () => 'light',
  };
});
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

const { anchorStep, atLatest, distanceFromLatest, latestOffset, unseenSince } =
  await import('../src/ui/chat/follow-latest');
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
  it('treats the last few points above the end of the list as the latest', () => {
    expect(atLatest(0)).toBe(true);
    expect(atLatest(-12)).toBe(true);
    expect(atLatest(40)).toBe(true);
    expect(atLatest(41)).toBe(false);
  });

  it('measures the distance from the end of a top-to-bottom list', () => {
    expect(distanceFromLatest({ content: 2000, layout: 800, offset: 1200 })).toBe(0);
    expect(distanceFromLatest({ content: 2000, layout: 800, offset: 1000 })).toBe(200);
    expect(distanceFromLatest({ content: 2000, layout: 800, offset: 1234 })).toBe(-34);
    expect(distanceFromLatest({ content: 700, layout: 800, offset: -100 })).toBe(0);
  });

  it('targets the end offset without scrolling above the header inset', () => {
    expect(latestOffset({ content: 2000, layout: 800 }, 100)).toBe(1200);
    expect(latestOffset({ content: 700, layout: 800 }, 100)).toBe(-100);
    expect(latestOffset({ content: 500, layout: 800 }, 100)).toBe(-100);
    expect(latestOffset({ content: 500, layout: 800 }, 0)).toBe(0);
  });

  it('keeps the working row anchor still while a following list grows ahead of its pin', () => {
    expect(anchorStep(1200, 1200, 1260, true)).toBe(1200);
    expect(anchorStep(1200, 1260, 1260, true)).toBe(1260);
    expect(anchorStep(1260, 1300, 1260, true)).toBe(1260);
    expect(anchorStep(1260, 1180, 1180, true)).toBe(1180);
  });

  it('anchors the working row to the end of the list once the Human scrolls away', () => {
    expect(anchorStep(1200, 900, 1200, false)).toBe(1200);
    expect(anchorStep(1200, 900, 1320, false)).toBe(1320);
    expect(anchorStep(1320, 1100, 1320, true)).toBe(1320);
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
