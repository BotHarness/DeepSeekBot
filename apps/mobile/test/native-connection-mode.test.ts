import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const state: { enabled: boolean; running: boolean; error: string | null } = {
    enabled: false,
    running: false,
    error: null,
  };
  const calls: string[] = [];
  return { state, calls };
});
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    connectionState: () => ({ ...native.state }),
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

beforeEach(() => {
  vi.resetModules();
  native.state = { enabled: false, running: false, error: null };
  native.calls.length = 0;
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
