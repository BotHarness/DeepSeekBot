// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { PushRequestFailed, type PushSettings } from '../src/host/push';
import {
  NotificationSettings,
  type NotificationSettingsPort,
} from '../src/ui/notification-settings';
import { locale, t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

async function settle(): Promise<void> {
  await act(async () => undefined);
}

const registered: PushSettings = {
  registered: true,
  enabled: true,
  delivery: 'push' as const,
  preferences: { approval: true, question: true, 'private-input': true, reply: true },
  quietChannelIds: [],
};

function port(overrides: Partial<NotificationSettingsPort> = {}) {
  return {
    load: vi.fn(async () => registered),
    set: vi.fn(async (preferences: Partial<PushSettings['preferences']>) => ({
      ...registered,
      preferences: { ...registered.preferences, ...preferences },
    })),
    setEnabled: vi.fn(async (enabled: boolean) => ({ ...registered, enabled })),
    setDelivery: vi.fn(async (delivery: 'push' | 'in-app') => ({ ...registered, delivery })),
    test: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('Notification settings', () => {
  it.each(['push-token-timeout', 'Network request failed'])(
    'reports %s as a registration failure, not an unsupported build',
    async (reason) => {
      const view = await render(
        <NotificationSettings
          status={{ status: 'unavailable', reason }}
          hostName="studio"
          port={port()}
          onEnable={() => {}}
          onOpenSettings={() => {}}
        />,
      );
      expect(view.textContent).toContain(
        locale === 'zh'
          ? '通知注册未成功，检查网络后重启应用。'
          : 'Could not register for notifications. Check your connection and restart the app.',
      );
      expect(view.textContent).not.toContain(t.notificationsUnavailable);
      expect(view.textContent).not.toContain(reason);
    },
  );

  it('keeps the build diagnostic when the project ID is missing', async () => {
    const view = await render(
      <NotificationSettings
        status={{ status: 'unavailable', reason: 'missing-project-id' }}
        hostName="studio"
        port={port()}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(view.textContent).toContain(t.cloudPushUnavailable);
    expect(view.textContent).not.toContain('missing-project-id');
  });

  it('keeps device choices editable without system permission or a push token', async () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const settings = port({
      load: async () => {
        throw new Error('offline');
      },
      set: vi.fn(async () => undefined),
    });
    const view = await render(
      <NotificationSettings
        status={{ status: 'denied' }}
        hostName="studio"
        port={settings}
        preference={{ preferences: registered.preferences, syncing: false, failed: ['studio'] }}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    const reply = view.querySelector<HTMLInputElement>(`[aria-label="${t.pushKind.reply}"]`)!;
    expect(reply.checked).toBe(true);
    expect(announce).toHaveBeenCalledWith('offline');
    expect(reply.disabled).toBe(false);
    await act(async () => reply.click());
    expect(settings.set).toHaveBeenCalledWith({ reply: false });
    expect(view.textContent).toContain(t.notificationPreferencePending);
    expect(settings.test).not.toHaveBeenCalled();
  });

  it('offers to turn notifications on before the phone allows them', async () => {
    const onEnable = vi.fn();
    const view = await render(
      <NotificationSettings
        status={{ status: 'off' }}
        hostName="studio"
        port={port()}
        onEnable={onEnable}
        onOpenSettings={() => {}}
      />,
    );
    expect(view.textContent).toContain(t.notificationsOff);
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(`button[aria-label="${t.turnOnNotifications}"]`)!
        .click(),
    );
    expect(onEnable).toHaveBeenCalled();
    expect(view.querySelector('[role="switch"]')).toBeNull();
  });

  it('turns a kind off and sends a test notification', async () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const settings = port();
    const view = await render(
      <NotificationSettings
        status={{ status: 'on', failed: [] }}
        hostName="studio"
        port={settings}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(view.textContent).not.toContain(t.notificationsOn('studio'));
    expect(view.textContent).not.toContain(t.notificationsHint);
    const reply = view.querySelector<HTMLInputElement>(`[aria-label="${t.pushKind.reply}"]`)!;
    expect(reply.checked).toBe(true);
    await act(async () => reply.click());
    await settle();
    expect(settings.set).toHaveBeenCalledWith({ reply: false });
    expect(
      view.querySelector<HTMLInputElement>(`[aria-label="${t.pushKind.reply}"]`)!.checked,
    ).toBe(false);

    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.sendTest}"]`)!.click(),
    );
    await settle();
    expect(settings.test).toHaveBeenCalled();
    expect(view.textContent).toContain(t.testSent);
    expect(announce).toHaveBeenCalledWith(t.testSent);
    expect(view.textContent).not.toContain(t.notificationLocalTestState.seen);
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>('[data-testid="notification-cloud-test-seen"]')!
        .click(),
    );
    expect(view.textContent).toContain(t.notificationLocalTestState.seen);
  });

  it('hides the kinds while delivery is off, and brings them back as in-app only', async () => {
    let host: PushSettings = registered;
    const settings = port({
      setEnabled: vi.fn(async (enabled: boolean) => (host = { ...host, enabled })),
      setDelivery: vi.fn(async (delivery: 'push' | 'in-app') => (host = { ...host, delivery })),
    });
    const view = await render(
      <NotificationSettings
        status={{ status: 'on', failed: [] }}
        hostName="studio"
        port={settings}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    const choose = async (id: string) => {
      await act(async () =>
        view.querySelector<HTMLElement>('[data-testid="notifications-delivery"]')!.click(),
      );
      await act(async () =>
        view.querySelector<HTMLElement>(`[data-testid="notifications-delivery-${id}"]`)!.click(),
      );
      await settle();
    };
    expect(view.textContent).toContain(t.deliveryPush);
    expect(view.textContent).toContain(t.deliveryPushHint);
    await choose('off');
    expect(settings.setEnabled).toHaveBeenCalledWith(false);
    expect(settings.setDelivery).not.toHaveBeenCalled();
    expect(view.querySelector(`[aria-label="${t.pushKind.reply}"]`)).toBeNull();
    expect(view.textContent).toContain(t.allowNotificationsOff);

    await choose('in-app');
    expect(settings.setDelivery).toHaveBeenCalledWith('in-app');
    expect(settings.setEnabled).toHaveBeenLastCalledWith(true);
    expect(settings.setDelivery.mock.invocationCallOrder[0]!).toBeLessThan(
      settings.setEnabled.mock.invocationCallOrder.at(-1)!,
    );
    expect(view.textContent).toContain(t.deliveryInAppHint);
    expect(view.querySelector(`[aria-label="${t.pushKind.reply}"]`)).not.toBeNull();
  });

  it('explains why a test was not sent, and when the phone blocks notifications', async () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const view = await render(
      <NotificationSettings
        status={{ status: 'on', failed: [] }}
        hostName="studio"
        port={port({
          test: async () => {
            throw new PushRequestFailed('push-send-failed');
          },
        })}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.sendTest}"]`)!.click(),
    );
    await settle();
    expect(view.textContent).toContain(`${t.testFailed} ${t.pushFailed['push-send-failed']}`);
    expect(announce).toHaveBeenCalledWith(`${t.testFailed} ${t.pushFailed['push-send-failed']}`);

    const denied = await render(
      <NotificationSettings
        status={{ status: 'denied' }}
        hostName="studio"
        port={port()}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(denied.textContent).toContain(t.notificationsDenied);
  });
});
