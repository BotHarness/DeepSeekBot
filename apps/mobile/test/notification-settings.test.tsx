// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { PushRequestFailed, type PushSettings } from '../src/host/push';
import {
  NotificationSettings,
  type NotificationSettingsPort,
} from '../src/ui/notification-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
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
    test: vi.fn(async () => undefined),
    ...overrides,
  };
}

const notice = (container: HTMLElement, tone: string) =>
  [...container.querySelectorAll(`[data-testid="notice-${tone}"]`)].map((node) => node.textContent);

describe('Notification settings', () => {
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
    expect(notice(view, 'warning')).toEqual([t.notificationsOff]);
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(`button[aria-label="${t.turnOnNotifications}"]`)!
        .click(),
    );
    expect(onEnable).toHaveBeenCalled();
    expect(view.querySelector('[role="switch"]')).toBeNull();
  });

  it('turns a kind off and sends a test notification', async () => {
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
    expect(notice(view, 'success')).toEqual([t.notificationsOn('studio')]);
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
    expect(notice(view, 'success')).toContain(t.testSent);
  });

  it('hides the kinds while this phone does not allow notifications, and brings them back', async () => {
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
    const allow = () =>
      view.querySelector<HTMLInputElement>(`[aria-label="${t.allowNotifications}"]`)!;
    expect(allow().checked).toBe(true);
    await act(async () => allow().click());
    await settle();
    expect(settings.setEnabled).toHaveBeenCalledWith(false);
    expect(allow().checked).toBe(false);
    expect(view.querySelector(`[aria-label="${t.pushKind.reply}"]`)).toBeNull();
    expect(view.textContent).toContain(t.allowNotificationsOff);

    await act(async () => allow().click());
    await settle();
    expect(settings.setEnabled).toHaveBeenLastCalledWith(true);
    expect(view.querySelector(`[aria-label="${t.pushKind.reply}"]`)).not.toBeNull();
  });

  it('explains why a test was not sent, and when the phone blocks notifications', async () => {
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
    expect(notice(view, 'danger')).toEqual([`${t.testFailed} ${t.pushFailed['push-send-failed']}`]);

    const denied = await render(
      <NotificationSettings
        status={{ status: 'denied' }}
        hostName="studio"
        port={port()}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(notice(denied, 'warning')).toEqual([t.notificationsDenied]);
  });
});
