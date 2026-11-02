// @vitest-environment jsdom
import { act, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelActivity } from '../src/host/channel-activity';
import type { RosterView } from '../src/host/client';
import type { ConversationMessage } from '../src/host/conversation';
import { bubbleRow } from '../src/ui/chat/bubble-shape';
import { space } from '../src/ui/design/tokens';

const state = vi.hoisted(() => ({ styles: [] as object[], press: {} as Record<string, unknown> }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: ({ children, style, ref }: { children: ReactNode; style?: object; ref?: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({
      measureInWindow: (callback: (...values: number[]) => void) => callback(12, 120, 366, 18),
    }));
    if (style) state.styles.push(style);
    return <div>{children}</div>;
  },
  Text: ({
    children,
    numberOfLines,
    ellipsizeMode,
  }: {
    children: ReactNode;
    numberOfLines?: number;
    ellipsizeMode?: string;
  }) => (
    <span data-lines={numberOfLines} data-ellipsis={ellipsizeMode}>
      {children}
    </span>
  ),
  Pressable: (props: Record<string, unknown> & { children: ReactNode }) => {
    state.press = props;
    state.styles.push((props['style'] as (state: object) => object)({ pressed: false }));
    return (
      <button
        type="button"
        aria-label={String(props['accessibilityLabel'])}
        onClick={() => (props['onPress'] as (() => void) | undefined)?.()}
        onContextMenu={() => (props['onLongPress'] as () => void)()}
      >
        {props.children}
      </button>
    );
  },
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) => <span data-avatar={bot.slug} />,
}));
vi.mock('../src/ui/chat/speaker-row', () => ({ SPEAKER_AVATAR: 32 }));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('react-native-svg', () => ({
  default: () => <i data-icon />,
  Path: () => null,
  SvgXml: () => null,
}));

const { ActivityRow } = await import('../src/ui/chat/activity-row');
const { activityPeer } = await import('../src/ui/chat/activity-text');
const message: ConversationMessage = {
  id: 'notice',
  at: '2026-10-16T00:00:00Z',
  author: 'bot',
  bot: 'ada',
  body: '',
  attachments: [],
  delivery: 'committed',
};
const roster: RosterView = {
  bots: ['ada', 'bob'].map((slug) => ({
    slug,
    displayName: slug,
    roles: [],
    state: 'idle',
    paused: false,
    computerAccess: false,
    browserAccess: false,
  })),
  channels: [],
  activityChannels: [{ id: 'dm-bots', name: 'Ada / Bob', type: 'dm', members: ['ada', 'bob'] }],
};
const post: ChannelActivity = {
  kind: 'channel-post',
  channelId: 'research',
  messageId: 'post',
  preview: 'First line.\nSecond line.',
};
const direct: ChannelActivity = {
  kind: 'dm-action',
  channelId: 'dm-bots',
  messageId: 'direct',
  recipientBotSlug: 'bob',
};
let container: HTMLDivElement;
let root: Root;
const opened = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  state.styles = [];
  opened.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(activity: ChannelActivity = post, dmSlug?: string) {
  act(() =>
    root.render(
      <ActivityRow
        message={message}
        activity={activity}
        roster={roster}
        dmSlug={dmSlug}
        onLongPress={opened}
      />,
    ),
  );
}

describe('activity row layout and interaction', () => {
  it('uses the same single top gap and left inset as a new bubble, without bottom padding', () => {
    render(post, 'ada');
    expect(state.styles).toContainEqual(bubbleRow(true));
    expect(bubbleRow(true)).toEqual({ paddingHorizontal: space.x4, paddingTop: space.x4 });
    expect(
      state.styles.every((style) => !('paddingBottom' in style) && !('paddingVertical' in style)),
    ).toBe(true);
    expect(state.press).not.toHaveProperty('onPress');
    expect(
      container.querySelector('[data-lines="1"][data-ellipsis="tail"]')?.textContent,
    ).toContain('First line. Second line.');
  });

  it('does nothing on tap, and opens full details with the target only on long press', () => {
    render(post, 'ada');
    const button = container.querySelector('button')!;
    act(() => button.click());
    expect(opened).not.toHaveBeenCalled();
    act(() => button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(opened).toHaveBeenCalledWith(
      { x: 12, y: 120, width: 366, height: 18 },
      expect.stringContaining('First line.\nSecond line.'),
      expect.objectContaining({ pathname: '/channel/[id]' }),
    );
  });

  it('keeps an explicit accessibility action to open details without navigating', () => {
    render(post, 'ada');
    act(() =>
      (state.press['onAccessibilityAction'] as (event: object) => void)({
        nativeEvent: { actionName: 'longpress' },
      }),
    );
    expect(opened).toHaveBeenCalledOnce();
  });

  it('aligns the group icon with the bubble after the actor avatar gutter', () => {
    render();
    expect(container.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('ada');
    expect(state.styles).toContainEqual({ width: 32, alignItems: 'center' });
    const button = container.querySelector('button')!;
    expect(button.children[0]?.querySelector('[data-avatar]')).not.toBeNull();
    expect(button.children[1]?.hasAttribute('data-icon')).toBe(true);
  });

  it('hides the current Bot avatar in its DM but shows the recipient for a Bot DM action', () => {
    render(post, 'ada');
    expect(container.querySelector('[data-avatar]')).toBeNull();
    expect(container.textContent).not.toContain('ada ');
    render(direct, 'ada');
    expect(container.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('bob');
    expect(activityPeer({ ...post, channelId: 'dm-bots' }, 'ada', roster)).toBe('bob');
    expect(activityPeer(post, 'ada', roster)).toBeUndefined();
  });

  it('still exposes details for an activity with no destination', () => {
    render(
      { kind: 'turn-stop', humanName: 'You', botName: 'Ada', botSlug: 'ada', sessionId: 'session' },
      'ada',
    );
    act(() =>
      container
        .querySelector('button')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
    );
    expect(opened).toHaveBeenCalledWith(expect.any(Object), expect.any(String), undefined);
  });
});
