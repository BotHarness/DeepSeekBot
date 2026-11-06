import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RosterBot } from '../src/host/client';

const device = vi.hoisted(() => ({ scale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios', Version: 27 },
}));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return {
    useDesignTheme: () => ({ ...resolveTheme('light', {}, 'ios'), fontScale: device.scale }),
  };
});
vi.mock('../src/ui/minute-clock', () => ({
  useMinuteClock: () => new Date('2026-11-07T00:00:00Z'),
}));
vi.mock('expo-router/react-navigation', () => ({
  HeaderHeightContext: {},
  getDefaultHeaderHeight: () => 54,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaFrame: () => ({}),
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('react-native-screens', () => ({
  Screen: () => null,
  ScreenStack: () => null,
  ScreenStackHeaderCenterView: ({ children }: { children: ReactNode }) => (
    <div data-native-title="true">{children}</div>
  ),
  ScreenStackHeaderConfig: ({
    children,
    headerLeftBarButtonItems,
    headerRightBarButtonItems,
  }: {
    children: ReactNode;
    headerLeftBarButtonItems: unknown[];
    headerRightBarButtonItems: unknown[];
  }) => (
    <section
      data-left={JSON.stringify(headerLeftBarButtonItems)}
      data-right={JSON.stringify(headerRightBarButtonItems)}
    >
      {children}
    </section>
  ),
  ScreenStackHeaderLeftView: ({
    children,
    hidesSharedBackground,
  }: {
    children: ReactNode;
    hidesSharedBackground?: boolean;
  }) => <aside data-system-glass={String(!hidesSharedBackground)}>{children}</aside>,
  ScreenStackHeaderRightView: ({
    children,
    hidesSharedBackground,
  }: {
    children: ReactNode;
    hidesSharedBackground?: boolean;
  }) => <aside data-system-glass={String(!hidesSharedBackground)}>{children}</aside>,
}));

const nativeViews = vi.hoisted(() => ({
  Host: ({
    children,
    style,
  }: {
    children: ReactNode;
    style: { height?: number; width?: number | string };
  }) =>
    createElement(
      'div',
      { 'data-host-height': style.height, 'data-host-width': style.width },
      children,
    ),
}));
vi.mock('@expo/ui', () => nativeViews);
vi.mock('@expo/ui/swift-ui', () => ({
  ...nativeViews,
  RNHostView: ({ children }: { children: ReactNode }) => children,
  HStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Image: ({ systemName }: { systemName: string }) => <i data-symbol={systemName} />,
  Button: ({
    children,
    modifiers,
  }: {
    children: ReactNode;
    modifiers: { kind: string; value?: unknown }[];
  }) => (
    <button
      aria-label={String(modifiers.find((m) => m.kind === 'accessibilityLabel')?.value ?? '')}
    >
      {children}
    </button>
  ),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier = (kind: string) => (value: unknown) => ({ kind, value });
  return {
    shapes: { rectangle: () => ({ kind: 'rectangle' }) },
    ...Object.fromEntries(
      [
        'accessibilityLabel',
        'accessibilityHint',
        'accessibilityValue',
        'buttonStyle',
        'disabled',
        'foregroundStyle',
        'frame',
        'glassEffect',
        'contentShape',
      ].map((k) => [k, modifier(k)]),
    ),
  };
});
vi.mock(
  '../src/ui/chat/chat-header-actions',
  () => import('../src/ui/chat/chat-header-actions.ios'),
);
vi.mock(
  '../src/ui/chat/header-title-button',
  () => import('../src/ui/chat/header-title-button.ios'),
);
vi.mock('../src/ui/chat/header-chrome', () => ({
  titleChipFill: () => ({}),
  HeaderBackButton: () => null,
}));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/ui/chat/group-mark', () => ({ GroupMark: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));

import { NativePageHeader } from '../src/ui/primitives/native-page-navigation.ios';
import { ChatTitle } from '../src/ui/chat/chat-title';
import { ChannelTitle } from '../src/ui/chat/channel-title';

const bot: RosterBot = {
  slug: 'qa',
  displayName: 'QA long name',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  dmChannelId: 'dm-qa',
};
const noPress = () => {};

describe('iOS chat header size contract', () => {
  it.each([
    ['default', 1, 44],
    ['XXXL', 1.353, 58],
    ['maximum accessibility', 3.571, 58],
  ] as const)(
    'keeps identity and both action surfaces the same height at %s',
    (_name, scale, height) => {
      device.scale = scale;
      for (const group of [false, true]) {
        const html = renderToStaticMarkup(
          <NativePageHeader
            onBack={noPress}
            backID="back"
            title={
              group ? (
                <ChannelTitle channel={undefined} fallback="QA group" onPress={noPress} />
              ) : (
                <ChatTitle bot={bot} fallback="QA" onPress={noPress} />
              )
            }
            action={{ label: 'Profile', testID: 'profile', onPress: noPress }}
            call={group ? undefined : { label: 'Call', testID: 'call', onPress: noPress }}
          />,
        );
        const heights = [...html.matchAll(/data-host-height="([\d.]+)"/g)].map((m) => Number(m[1]));
        expect(heights).toEqual([height, height, height]);
        expect(html).toContain('data-native-title="true"');
        expect(html).not.toContain('data-system-glass="true"');
        expect(html).not.toContain('&quot;type&quot;:&quot;button&quot;');
        expect(html).toContain('data-symbol="chevron.left"');
        expect(html).toContain('data-symbol="ellipsis"');
        expect(html.includes('data-symbol="phone"')).toBe(!group);
        expect(html).toContain(`data-host-width="${height * (group ? 1 : 2)}"`);
      }
    },
  );
});
