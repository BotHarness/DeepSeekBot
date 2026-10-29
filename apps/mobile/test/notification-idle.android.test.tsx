// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

const nativeSwitch = vi.hoisted(() => vi.fn());
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/host/pairing', () => ({ DEVICE_PREFIX: '/botharness-device' }));
vi.mock('../src/host/encrypted-carrier', () => ({ encryptedCarrier: vi.fn() }));
vi.mock(
  '../src/ui/primitives/settings-list-item',
  () => import('../src/ui/primitives/settings-list-item.android'),
);
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-list-item-shim')).modifiers,
);
vi.mock('../src/ui/primitives/row-icon-source.android', async () => ({
  ROW_ICON_SOURCES: (await import('./compose-list-item-shim')).rowIconSources,
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const { components } = await import('./compose-list-item-shim');
  return {
    ...components,
    Switch: (props: { value: boolean; enabled: boolean }) => {
      nativeSwitch(props);
      return components.Switch(props);
    },
  };
});

import { createDeviceNotificationPreferences } from '../src/host/device-notification-preferences';
import type { SavedHost } from '../src/host/hosts';
import type { PushSettings } from '../src/host/push';
import { NotificationSettings } from '../src/ui/notification-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps the four Android switches enabled while an offline computer retries in the foreground', async () => {
  vi.useFakeTimers();
  const settings: PushSettings = {
    registered: true,
    enabled: true,
    preferences: { approval: true, question: true, 'private-input': true, reply: true },
    quietChannelIds: [],
  };
  const host = (id: string): SavedHost => ({
    hostId: id,
    hostName: id,
    deviceId: id,
    credential: id,
    routes: [`https://${id}.invalid`],
  });
  const push = {
    settings: async () => settings,
    setPreferences: vi.fn(async (entry: SavedHost) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (entry.hostId === 'offline') throw new Error('offline');
      return settings;
    }),
  };
  const storage = { read: async () => settings.preferences, write: vi.fn() };
  const preferences = createDeviceNotificationPreferences({ storage, push });
  await preferences.ready;
  const port = {
    load: async () => settings,
    set: preferences.set,
    setEnabled: async () => settings,
    test: async () => undefined,
  };
  function Screen() {
    const preference = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
    return (
      <NotificationSettings
        status={{ status: 'on', failed: [] }}
        hostName="online"
        port={port}
        preference={preference}
        onEnable={() => {}}
        onOpenSettings={() => {}}
      />
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Screen />));
    const controls = [...container.querySelectorAll('input')];
    expect(controls).toHaveLength(5);
    nativeSwitch.mockClear();
    preferences.setForeground(true);
    await act(async () => {
      void preferences.sync([host('online'), host('offline')]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(push.setPreferences.mock.calls.length).toBeGreaterThan(2);
    expect(container.textContent).toContain(t.notificationPreferencePending);
    const after = [...container.querySelectorAll('input')];
    after.forEach((control, index) => {
      expect(control).toBe(controls[index]);
      expect(control.checked).toBe(true);
    });
    expect(nativeSwitch.mock.calls.every(([props]) => props.value === true)).toBe(true);
    expect(nativeSwitch.mock.calls.filter(([props]) => !props.enabled)).toHaveLength(0);
    await act(async () => {
      void preferences.retry();
    });
    const reply = container.querySelector<HTMLInputElement>(
      `[role="switch"][aria-label="${t.pushKind.reply}"] input`,
    )!;
    expect(reply.disabled).toBe(false);
    await act(async () => reply.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(preferences.getSnapshot().preferences?.reply).toBe(false);
    expect(storage.write).toHaveBeenLastCalledWith({ ...settings.preferences, reply: false });
    expect(reply.checked).toBe(false);
    expect(preferences.getSnapshot().failed).toEqual(['offline']);
  } finally {
    preferences.setForeground(false);
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});
