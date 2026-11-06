// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  os: 'android',
  options: {} as {
    unstable_nativeProps?: { headerConfig?: { disableTopInsetApplication?: boolean } };
  },
  routePending: undefined as ((value: boolean) => void) | undefined,
}));
vi.mock('expo-router', () => ({
  Stack: Object.assign(
    ({ screenOptions }: { screenOptions: typeof native.options }) => {
      native.options = screenOptions;
      return null;
    },
    { Screen: () => null },
  ),
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return native.os;
    },
  },
}));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/native-interface-preferences', () => ({
  useNativeInterfacePreferences: () => ({ loaded: true }),
}));
vi.mock('../src/host/push-routing', () => ({
  usePushRouting: (setPending: (v: boolean) => void) => {
    native.routePending = setPending;
    return undefined;
  },
}));
vi.mock('../src/ui/strings', () => ({
  useStrings: () => new Proxy({}, { get: () => ({ title: '', section: '' }) }),
}));
vi.mock('../src/ui/theme', () => ({ useTheme: () => ({ background: '', ink: '' }) }));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'dark', overlay: { fill: '' } }),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawer: () => null,
  WorkspaceButton: () => null,
  hostDrawer: {},
}));
vi.mock('../src/ui/primitives/device-alert-banner', () => ({ DeviceAlertBanner: () => null }));
vi.mock('../src/ui/request-parts', () => ({ Notice: () => null }));
vi.mock('../src/ui/shell/statistics-notice', () => ({ StatisticsNotice: () => null }));
vi.mock('../src/ui/shell/bot-creation-notice', () => ({ BotCreationNotice: () => null }));
vi.mock('../src/ui/shell/channel-creation-notice', () => ({ ChannelCreationNotice: () => null }));
vi.mock('../src/ui/primitives/app-dialog-host', () => ({ AppDialogHost: () => null }));
vi.mock('../src/ui/primitives/keyboard-frame', () => ({
  KeyboardRoot: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/host-accent-provider', () => ({
  HostAccentProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/mounted', () => ({ useMounted: () => () => undefined }));
vi.mock('../src/host/native-live-activity', () => ({ watchRequestActivity: () => undefined }));
vi.mock('../src/ui/shell/native-workspace-navigation', () => ({
  useWorkspaceNavigation: () => () => undefined,
}));
vi.mock('../src/ui/shell/predictive-back', () => ({ usePredictiveBack: () => () => undefined }));
vi.mock('../src/ui/primitives/touch-anchor', () => ({ noteTouch: () => undefined }));
vi.mock('../src/ui/primitives/sheet-screen', () => ({ sheetScreenOptions: () => undefined }));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => undefined,
}));
vi.mock('../src/ui/chat/profile-presentation', () => ({ profileScreenOptions: () => ({}) }));
vi.mock('../src/ui/chat/call-session-host', () => ({ CallSessionHost: () => null }));
vi.mock('../src/host/native-media-store', () => ({ nativeMediaStore: undefined }));
vi.mock('../src/host/native-local-store', () => ({ nativeHostStoreOpener: undefined }));
vi.mock('../src/host/native-purge-targets', () => ({ nativePurgeTargets: undefined }));
vi.mock('../src/host/media-cache', () => ({
  installMediaStore: () => undefined,
  runAutoCleanup: () => undefined,
}));
vi.mock('../src/host/host-store', () => ({
  installHostStoreOpener: () => undefined,
  retryHostStoreDeletes: async () => undefined,
}));
vi.mock('../src/host/purge-caches', () => ({ installPurgeTargets: () => undefined }));
vi.mock('../src/host/native-haptic-feedback', () => ({}));
vi.mock('../src/ui/shell/channel-navigation', () => ({
  channelRouteId: () => '',
  channelStackRouter: () => ({}),
}));
vi.mock('../src/ui/shell/cloud-channel-navigation', () => ({ cloudChannelRouteId: () => '' }));
vi.mock('../src/ui/shell/tob-mode-model', () => ({ topEntranceScreenOptions: {} }));
vi.mock('../src/ui/shell/swipe-entry', () => ({
  swipeEntryListeners: () => ({}),
  swipeEntryOptions: () => ({}),
}));

import RootLayout from '../app/_layout';
import { alertBanners } from '../src/host/alert-banners';
import { interfacePreferences } from '../src/ui/interface-preferences';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('updates actual Stack header inset ownership for inline, overlay, dismissal, OFF and routing notices without changing iOS', async () => {
  const root = createRoot(document.createElement('div'));
  const consumed = () =>
    native.options.unstable_nativeProps?.headerConfig?.disableTopInsetApplication ?? false;
  const alert = {
    title: 'Bot',
    body: 'Inset test',
    data: {
      v: 1 as const,
      hostId: 'inset-host',
      itemId: 'inset-item',
      kind: 'channel-reply',
      botSlug: 'bot',
      channelId: 'dm:bot',
      messageId: 'inset-message',
      sender: 'Bot',
      text: 'Inset test',
    },
  };
  try {
    native.os = 'android';
    interfacePreferences.setInAppAlerts(true);
    interfacePreferences.setInAppAlertStyle('inline');
    alertBanners.clear();
    await act(async () => root.render(<RootLayout />));
    expect(consumed()).toBe(false);
    await act(async () => alertBanners.reconcile('inset-host', ['inset-item'], [alert]));
    expect(consumed()).toBe(true);
    await act(async () => interfacePreferences.setInAppAlertStyle('overlay'));
    expect(consumed()).toBe(false);
    await act(async () => interfacePreferences.setInAppAlertStyle('inline'));
    expect(consumed()).toBe(true);
    await act(async () => interfacePreferences.setInAppAlerts(false));
    expect(consumed()).toBe(false);
    await act(async () => interfacePreferences.setInAppAlerts(true));
    await act(async () => alertBanners.dismiss());
    expect(consumed()).toBe(false);
    await act(async () => native.routePending?.(true));
    expect(consumed()).toBe(true);
    await act(async () => native.routePending?.(false));
    expect(consumed()).toBe(false);
    native.os = 'ios';
    await act(async () => root.render(<RootLayout />));
    expect(native.options.unstable_nativeProps).toEqual({});
  } finally {
    await act(async () => root.unmount());
    alertBanners.clear();
    native.os = 'android';
  }
});
