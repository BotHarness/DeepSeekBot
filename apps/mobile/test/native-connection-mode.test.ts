import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const state: { enabled: boolean; running: boolean; error: string | null } = {
    enabled: false,
    running: false,
    error: null,
  };
  const calls: string[] = [];
  return { state, calls, recoverySupported: true };
});
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    connectionState: () => ({ ...native.state }),
    alertRecoverySession: native.recoverySupported ? () => 'process-1' : undefined,
    reconcileAlertsAsync: async () => {
      native.calls.push('reconcile');
      return '[]';
    },
    setConnectionEnabled: (enabled: boolean) => {
      native.calls.push(`service:${enabled}`);
      native.state.enabled = enabled;
    },
    addListener: () => ({ remove() {} }),
  }),
}));
vi.mock('react-native', () => ({
  AppRegistry: { registerHeadlessTask() {} },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: async () => {
    native.calls.push('channel');
  },
}));
vi.mock('../src/host/native-notifications', () => ({ REQUESTS_CHANNEL: 'requests' }));
vi.mock('../src/host/alert-banners', () => ({
  alertBanners: { reconcile: () => native.calls.push('banners') },
}));

beforeEach(() => {
  vi.resetModules();
  native.state = { enabled: false, running: false, error: null };
  native.calls.length = 0;
  native.recoverySupported = true;
});

describe('Android connection opt-in', () => {
  it('creates the local channel before starting, without requesting an FCM token', async () => {
    const { connectionMode } = await import('../src/host/native-connection-mode.android');
    await connectionMode.setEnabled(true);
    expect(native.calls).toEqual(['channel', 'service:true']);
    expect(connectionMode.getSnapshot().enabled).toBe(true);
  });

  it('does not restart an explicitly stopped mode when reopening', async () => {
    native.state.enabled = true;
    const { connectionMode } = await import('../src/host/native-connection-mode.android');
    await connectionMode.setEnabled(false);
    await connectionMode.resume();
    expect(native.calls).toEqual(['service:false']);
  });

  it('restores a previously enabled mode', async () => {
    native.state.enabled = true;
    const { connectionMode } = await import('../src/host/native-connection-mode.android');
    await connectionMode.resume();
    expect(native.calls).toEqual(['channel', 'service:true']);
  });
});

describe('native recovery protocol', () => {
  const incomplete = {
    hostId: 'studio',
    pending: [],
    alerts: [],
    recovery: {
      session: 'process-1',
      batch: 'batch-1',
      ready: false,
      enabled: true,
      hostName: 'Studio',
      language: 'en',
    },
  };

  it('reports a rebuild requirement instead of feeding new recovery semantics to an old binary', async () => {
    native.recoverySupported = false;
    const { connectionMode } = await import('../src/host/native-connection-mode.android');
    await expect(connectionMode.reconcile(incomplete)).rejects.toThrow('connection-build-required');
    connectionMode.reportAlertFailure();
    expect(connectionMode.getSnapshot().error).toBe('connection-build-required');
    expect(native.calls).toEqual([]);
  });

  it('does not clear foreground entries from a disconnected non-authoritative empty set', async () => {
    const { connectionMode } = await import('../src/host/native-connection-mode.android');
    expect(connectionMode.recoverySession).toBe('process-1');
    await connectionMode.reconcile(incomplete);
    expect(native.calls).toEqual(['reconcile']);
    await connectionMode.reconcile({
      ...incomplete,
      recovery: { ...incomplete.recovery, ready: true },
    });
    expect(native.calls).toEqual(['reconcile', 'reconcile', 'banners']);
  });
});
