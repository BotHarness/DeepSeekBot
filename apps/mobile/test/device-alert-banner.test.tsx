// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

type PanEvent = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
};
type Pan = { end(event: PanEvent, success?: boolean): void; finalize(): void };
const native = vi.hoisted(() => ({ reduced: false, pans: [] as Pan[] }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const pan: Pan = { end() {}, finalize() {} };
      native.pans.push(pan);
      const builder = {
        minDistance: () => builder,
        onUpdate: () => builder,
        onEnd: (run: Pan['end']) => {
          pan.end = (event, success = true) => run(event, success);
          return builder;
        },
        onFinalize: (run: Pan['finalize']) => {
          pan.finalize = run;
          return builder;
        },
      };
      return builder;
    },
  },
}));
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
vi.mock('react-native-reanimated', async () => ({
  ...(await import('./reanimated-shim')),
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
  useDesignTheme: () => ({ color: { elevated: 'white', fg: 'black' } }),
  pressTint: (color: string) => color,
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({
    children,
    numberOfLines,
    testID,
  }: {
    children: ReactNode;
    numberOfLines?: number;
    testID?: string;
  }) => createElement('span', { 'data-testid': testID, 'data-lines': numberOfLines }, children),
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

it.each(['inline', 'overlay'] as const)(
  '%s opens a compact long-message preview directly without expanding it',
  async (placement) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const opened = vi.fn();
    const off = alertBanners.onOpen(opened);
    const alert = {
      title: '长群名称'.repeat(30),
      body: '完整消息预览'.repeat(20),
      data: {
        v: 1 as const,
        hostId: 'studio',
        itemId: `compact-${placement}`,
        kind: 'channel-reply',
        botSlug: 'test',
        channelId: 'group',
        messageId: 'compact-message',
        sender: 'Bot',
        text: 'Full message',
      },
    };
    try {
      interfacePreferences.setInAppAlerts(true);
      interfacePreferences.setInAppAlertStyle(placement);
      alertBanners.reconcile('studio', [alert.data.itemId], [alert]);
      await act(async () => root.render(<DeviceAlertBanner placement={placement} />));
      expect(
        host.querySelector('[data-testid="device-alert-title"]')?.getAttribute('data-lines'),
      ).toBe('1');
      expect(
        host.querySelector('[data-testid="device-alert-preview-text"]')?.getAttribute('data-lines'),
      ).toBe('2');
      expect(host.querySelector('[data-testid="channel-avatar"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="device-alert-open"]')).toBeNull();
      expect(host.querySelector('[data-testid="device-alert-dismiss"]')).toBeNull();
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-testid="device-alert-preview"]')!.click(),
      );
      expect(opened).toHaveBeenCalledExactlyOnceWith(alert.data);
      expect(host.querySelector('[data-testid="device-alert-banner"]')).toBeNull();
    } finally {
      off();
      await act(async () => root.unmount());
      alertBanners.clear();
    }
  },
);

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
      host.querySelector<HTMLButtonElement>('[data-testid="device-alert-preview"]')!.click(),
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
      native.pans.at(-1)!.end({ translationX: -80, translationY: 0, velocityX: 0, velocityY: 0 }),
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

it.each(['inline', 'overlay'] as const)(
  '%s swipes dismiss only the current notification; short, down and cancelled drags retain it',
  async (placement) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const opened = vi.fn();
    const off = alertBanners.onOpen(opened);
    const data = {
      v: 1 as const,
      hostId: 'studio',
      itemId: 'swipe',
      kind: 'channel-reply',
      botSlug: 'test',
      channelId: 'group',
      messageId: 'm1',
      sender: 'Bot',
      text: 'Message',
    };
    const alert = { title: 'Channel', body: 'Message', data };
    try {
      interfacePreferences.setInAppAlerts(true);
      interfacePreferences.setInAppAlertStyle(placement);
      alertBanners.reconcile('studio', ['swipe'], [alert]);
      await act(async () => root.render(<DeviceAlertBanner placement={placement} />));
      for (const [translationX, translationY] of [
        [5, 0],
        [0, 80],
        [20, 0],
      ]) {
        await act(async () =>
          native.pans.at(-1)!.end({
            translationX: translationX!,
            translationY: translationY!,
            velocityX: 0,
            velocityY: 0,
          }),
        );
        expect(alertBanners.getSnapshot()?.data).toEqual(data);
      }
      await act(async () => {
        native.pans
          .at(-1)!
          .end({ translationX: 80, translationY: 0, velocityX: 900, velocityY: 0 }, false);
        native.pans.at(-1)!.finalize();
      });
      expect(alertBanners.getSnapshot()?.data).toEqual(data);
      for (const [translationX, translationY, velocityX, velocityY] of [
        [80, 0, 0, 0],
        [-80, 0, 0, 0],
        [0, -80, 0, 0],
        [16, 0, 900, 0],
      ]) {
        await act(async () =>
          alertBanners.reconcile(
            'studio',
            ['swipe', 'next'],
            [alert, { ...alert, data: { ...data, itemId: 'next' } }],
          ),
        );
        const pan = native.pans.at(-1)!;
        await act(async () =>
          pan.end({
            translationX: translationX!,
            translationY: translationY!,
            velocityX: velocityX!,
            velocityY: velocityY!,
          }),
        );
        expect(alertBanners.getSnapshot()?.data.itemId).toBe('next');
        await act(async () =>
          pan.end({ translationX: 80, translationY: 0, velocityX: 0, velocityY: 0 }),
        );
        expect(alertBanners.getSnapshot()?.data.itemId).toBe('next');
        await act(async () => {
          alertBanners.clear();
          alertBanners.reconcile('studio', ['swipe'], [alert]);
        });
      }
      expect(opened).not.toHaveBeenCalled();
      expect(interfacePreferences.getSnapshot().inAppAlerts).toBe(true);
    } finally {
      off();
      await act(async () => root.unmount());
      alertBanners.clear();
    }
  },
);
