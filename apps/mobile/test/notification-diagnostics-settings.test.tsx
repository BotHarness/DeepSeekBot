// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  resume: (_state: string) => {},
  open: vi.fn(async () => undefined),
}));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      runtime.resume = listener;
      return { remove() {} };
    },
  },
  Linking: { openSettings: runtime.open },
}));

import { NotificationDiagnosticsSettings } from '../src/ui/notification-diagnostics-settings';
import type {
  NotificationDiagnostics,
  NotificationDiagnosticsPort,
} from '../src/host/notification-diagnostics';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let view: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  view?.remove();
  vi.clearAllMocks();
});

const base: NotificationDiagnostics = {
  permission: false,
  requests: 'blocked',
  connection: 'available',
  batteryExempt: false,
  powerSave: true,
  setupDismissed: false,
};
function port(overrides: Partial<NotificationDiagnosticsPort> = {}): NotificationDiagnosticsPort {
  return {
    read: vi.fn(async () => base),
    dismissSetup: vi.fn(async () => undefined),
    test: vi.fn<NotificationDiagnosticsPort['test']>(async () => 'posted'),
    ...overrides,
  };
}
async function render(adapter: NotificationDiagnosticsPort, enabled = false, running = true) {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await update(adapter, enabled, running);
}
async function update(adapter: NotificationDiagnosticsPort, enabled: boolean, running: boolean) {
  await act(async () =>
    root!.render(
      <NotificationDiagnosticsSettings
        port={adapter}
        enabled={enabled}
        running={running}
        summary={{ hosts: 2, connected: 1, synced: 0, active: 0, needsYou: 0 }}
      />,
    ),
  );
}
async function click(id: string) {
  await act(async () => view.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click());
}

describe('notification diagnostics', () => {
  it('rereads native channels after mode and service changes without leaving the page', async () => {
    const read = vi
      .fn<NotificationDiagnosticsPort['read']>()
      .mockResolvedValueOnce({ ...base, connection: 'missing' })
      .mockResolvedValueOnce({ ...base, connection: 'missing' })
      .mockResolvedValueOnce({ ...base, connection: 'available' })
      .mockResolvedValueOnce({ ...base, connection: 'blocked' });
    const adapter = port({ read });
    await render(adapter, false, false);
    expect(view.textContent).toContain(t.notificationChannelState.missing);
    await update(adapter, true, false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(view.textContent).toContain(t.notificationChannelState.missing);
    await update(adapter, true, true);
    expect(read).toHaveBeenCalledTimes(3);
    expect(view.textContent).not.toContain(t.notificationChannelState.missing);
    expect(view.textContent).toContain(t.notificationChannelState.available);
    await update(adapter, false, false);
    expect(read).toHaveBeenCalledTimes(4);
    expect(view.textContent).not.toContain(t.notificationChannelState.available);
    expect(view.textContent).toContain(t.notificationChannelState.blocked);
  });

  it('ignores a stale read from before the service transition', async () => {
    let finish: ((value: NotificationDiagnostics) => void) | undefined;
    const read = vi
      .fn<NotificationDiagnosticsPort['read']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...base, connection: 'available' });
    const adapter = port({ read });
    await render(adapter, true, false);
    await update(adapter, true, true);
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => finish!({ ...base, connection: 'missing' }));
    expect(view.textContent).not.toContain(t.notificationChannelState.missing);
    expect(view.textContent).toContain(t.notificationChannelState.available);
  });

  it('keeps service, denied permission and incomplete sync independent; skips without enabling anything', async () => {
    const adapter = port();
    await render(adapter);
    expect(view.textContent).toContain(t.keepConnectedRunning);
    expect(view.textContent).toContain(t.notificationBlocked);
    expect(view.textContent).toContain(t.notificationCounts(0, 2));
    expect(view.textContent).toContain(t.notificationCounts(1, 2));
    await click('notification-setup-later');
    expect(adapter.dismissSetup).toHaveBeenCalledOnce();
    expect(view.querySelector('[data-testid="notification-setup-later"]')).toBeNull();
    expect(adapter.test).not.toHaveBeenCalled();
  });

  it('does not infer display from a successful local post or from returning from settings', async () => {
    const adapter = port();
    await render(adapter, true);
    await click('notification-local-test');
    expect(view.textContent).toContain(t.notificationLocalTestState.posted);
    expect(view.textContent).not.toContain(t.notificationLocalTestState.seen);
    await click('notification-health-settings');
    expect(runtime.open).toHaveBeenCalledOnce();
    await act(async () => runtime.resume('active'));
    expect(adapter.read).toHaveBeenCalledTimes(2);
    expect(view.textContent).toContain(t.notificationBlocked);
    expect(view.textContent).not.toContain(t.notificationLocalTestState.seen);
    await click('notification-local-test-seen');
    expect(view.textContent).toContain(t.notificationLocalTestState.seen);
  });

  it('cannot confirm a blocked test and never treats manufacturer limits as known', async () => {
    await render(port({ test: async () => 'channel-blocked' }));
    await click('notification-local-test');
    expect(view.textContent).toContain(t.notificationLocalTestState['channel-blocked']);
    expect(view.querySelector('[data-testid="notification-local-test-seen"]')).toBeNull();
    await click('notification-battery-help');
    expect(view.textContent).toContain(t.notificationVendorUnknown);
    expect(view.textContent).toContain(t.notificationBatteryManaged);
  });

  it('drops stale permission facts when a resume read fails', async () => {
    const read = vi
      .fn<NotificationDiagnosticsPort['read']>()
      .mockResolvedValueOnce({ ...base, permission: true, setupDismissed: true })
      .mockRejectedValueOnce(new Error('private detail'));
    await render(port({ read }));
    expect(view.querySelector('[data-testid="notification-setup-later"]')).toBeNull();
    await act(async () => runtime.resume('active'));
    expect(view.textContent).toContain(t.notificationUnknown);
    expect(view.textContent).not.toContain('private detail');
  });
});
