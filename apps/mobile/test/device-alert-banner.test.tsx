// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ reduced: false }));
vi.mock('../src/host/host-session', () => ({
  useHostSessions: () => [
    {
      saved: { hostId: 'other' },
      snapshot: {
        roster: {
          bots: [],
          channels: [{ id: 'group', avatar: 'wrong-host.png' }],
        },
      },
    },
    {
      saved: { hostId: 'studio' },
      snapshot: {
        roster: {
          bots: [{ slug: 'test', dmChannelId: 'dm:test', avatarUrl: 'bot.png' }],
          channels: [{ id: 'group', avatar: 'channel.png' }],
        },
      },
    },
  ],
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { avatarUrl: string } }) =>
    createElement('img', { src: bot.avatarUrl, 'data-testid': 'bot-avatar' }),
}));
vi.mock('../src/ui/chat/group-mark', () => ({
  GroupMark: ({ avatar }: { avatar?: string }) =>
    createElement('div', { 'data-testid': 'channel-avatar', 'data-avatar': avatar ?? '#' }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: (select: (state: { isVisible: boolean; height: number }) => unknown) =>
    select({ isVisible: false, height: 0 }),
}));
vi.mock('react-native-safe-area-context', async () => ({
  SafeAreaView: (await import('./react-native-shim')).View,
  useSafeAreaInsets: () => ({ top: 30, bottom: 20, left: 0, right: 0 }),
}));
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, entering }: { children: ReactNode; entering?: unknown }) =>
      createElement('div', { 'data-motion': entering ? 'slide' : 'none' }, children),
  },
  SlideInUp: { duration: (duration: number) => ({ duration }) },
}));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => native.reduced,
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ color: { elevated: 'white' } }),
}));
vi.mock('../src/ui/primitives/text', async () => ({
  Text: (await import('./react-native-shim')).Text,
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress, testID }: { label: string; onPress(): void; testID: string }) =>
    createElement('button', { onClick: onPress, 'data-testid': testID }, label),
}));

import { DeviceAlertBanner } from '../src/ui/primitives/device-alert-banner';
import { useDeviceAlert } from '../src/ui/primitives/use-device-alert';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { alertBanners } from '../src/host/alert-banners';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function InsetOwner() {
  const inline = useDeviceAlert('inline');
  return <div data-testid="inset-owner" data-consumed={Boolean(inline)} />;
}

it('moves one alert between inserted and overlay slots without consuming it; open and dismiss keep their meanings', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const opened = vi.fn();
  const off = alertBanners.onOpen(opened);
  const alert = {
    title: 'Test Bot',
    body: 'Question',
    data: {
      v: 1 as const,
      hostId: 'studio',
      itemId: 'q1',
      kind: 'user-question',
      botSlug: 'test',
      channelId: 'dm:test',
      messageId: 'm1',
      sender: 'Test Bot',
      text: 'Question',
    },
  };
  try {
    interfacePreferences.setInAppAlerts(true);
    interfacePreferences.setInAppAlertStyle('inline');
    alertBanners.reconcile('studio', ['q1'], [alert]);
    await act(async () =>
      root.render(
        <>
          <InsetOwner />
          <DeviceAlertBanner />
          <DeviceAlertBanner placement="overlay" />
        </>,
      ),
    );
    expect(host.querySelectorAll('[data-testid="device-alert-banner"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="inset-owner"]')?.getAttribute('data-consumed')).toBe(
      'true',
    );
    expect(host.querySelector('[data-testid="bot-avatar"]')?.getAttribute('src')).toBe('bot.png');
    expect(host.querySelector('[data-testid="device-alert-overlay"]')).toBeNull();
    await act(async () => interfacePreferences.setInAppAlertStyle('overlay'));
    expect(host.querySelector('[data-testid="inset-owner"]')?.getAttribute('data-consumed')).toBe(
      'false',
    );
    expect(host.querySelectorAll('[data-testid="device-alert-banner"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="device-alert-overlay"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="bot-avatar"]')?.getAttribute('src')).toBe('bot.png');
    expect(host.querySelector('[data-motion="slide"]')).not.toBeNull();
    expect(opened).not.toHaveBeenCalled();
    native.reduced = true;
    await act(async () => interfacePreferences.setAppearance('dark'));
    expect(host.querySelector('[data-motion="none"]')).not.toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="device-alert-open"]')!.click(),
    );
    expect(opened).toHaveBeenCalledExactlyOnceWith(alert.data);
    expect(host.querySelector('[data-testid="device-alert-banner"]')).toBeNull();
    await act(async () => interfacePreferences.setInAppAlertStyle('inline'));
    expect(host.querySelector('[data-testid="inset-owner"]')?.getAttribute('data-consumed')).toBe(
      'false',
    );
    await act(async () => alertBanners.reconcile('studio', ['q1'], [alert]));
    expect(host.querySelector('[data-testid="inset-owner"]')?.getAttribute('data-consumed')).toBe(
      'true',
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="device-alert-dismiss"]')!.click(),
    );
    expect(interfacePreferences.getSnapshot().inAppAlerts).toBe(true);
    expect(host.querySelector('[data-testid="inset-owner"]')?.getAttribute('data-consumed')).toBe(
      'false',
    );
    expect(opened).toHaveBeenCalledTimes(1);
  } finally {
    off();
    await act(async () => root.unmount());
    alertBanners.clear();
  }
});

it.each(['inline', 'overlay'] as const)(
  '%s uses the source Channel avatar and fallback, without attributing a recovery summary to one Channel',
  async (placement) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const alert = {
      title: 'Channel',
      body: 'Message',
      data: {
        v: 1 as const,
        hostId: 'studio',
        itemId: `channel-message-${placement}`,
        kind: 'channel-reply',
        botSlug: 'test',
        channelId: 'group',
        messageId: 'm1',
        sender: 'Bot',
        text: 'Message',
      },
    };
    try {
      interfacePreferences.setInAppAlerts(true);
      interfacePreferences.setInAppAlertStyle(placement);
      alertBanners.reconcile('studio', [alert.data.itemId], [alert]);
      await act(async () => root.render(<DeviceAlertBanner placement={placement} />));
      expect(
        host.querySelector('[data-testid="channel-avatar"]')?.getAttribute('data-avatar'),
      ).toBe('channel.png');
      expect(host.querySelector('[data-testid="bot-avatar"]')).toBeNull();
      await act(async () =>
        alertBanners.reconcile(
          'studio',
          [alert.data.itemId],
          [
            {
              ...alert,
              data: { ...alert.data, channelId: 'without-avatar' },
            },
          ],
        ),
      );
      expect(
        host.querySelector('[data-testid="channel-avatar"]')?.getAttribute('data-avatar'),
      ).toBe('#');
      await act(async () =>
        alertBanners.reconcile(
          'studio',
          [alert.data.itemId],
          [
            {
              ...alert,
              members: ['one', 'two'],
            },
          ],
        ),
      );
      expect(host.querySelector('[data-testid="channel-avatar"]')).toBeNull();
      expect(host.querySelector('[data-testid="bot-avatar"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      alertBanners.clear();
    }
  },
);
