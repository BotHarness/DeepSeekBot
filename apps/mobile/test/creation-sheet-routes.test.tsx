// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  os: 'ios',
  screens: new Map<string, unknown>(),
  routePending: undefined as ((value: boolean) => void) | undefined,
}));
vi.mock('expo-router', () => ({
  Stack: Object.assign(({ children }: { children?: ReactNode }) => children, {
    Screen: ({ name, options }: { name: string; options?: unknown }) => {
      native.screens.set(name, options);
      return null;
    },
  }),
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
vi.mock('../src/host/native-push-resolve', () => ({ registerPushResolveTask: () => undefined }));
vi.mock('../src/host/native-background-support', () => ({ nativeBackgroundCatchUp: undefined }));
vi.mock('../src/ui/shell/native-workspace-navigation', () => ({
  useWorkspaceNavigation: () => () => undefined,
}));
vi.mock('../src/ui/shell/predictive-back', () => ({ usePredictiveBack: () => () => undefined }));
vi.mock('../src/ui/primitives/touch-anchor', () => ({ noteTouch: () => undefined }));
vi.mock('../src/ui/primitives/sheet-screen', () => ({
  sheetScreenOptions: (_theme: unknown, full = false) => ({
    presentation: 'formSheet',
    sheetAllowedDetents: full ? [1] : [0.75, 1],
    sheetGrabberVisible: true,
  }),
}));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => undefined,
}));
vi.mock('../src/ui/chat/profile-presentation', () => ({ profileScreenOptions: () => ({}) }));
vi.mock('../src/ui/chat/call-session-host', () => ({ CallSessionHost: () => null }));
vi.mock('../src/host/native-media-store', () => ({ nativeMediaStore: undefined }));
vi.mock('../src/host/native-local-store', () => ({ nativeHostStoreOpener: undefined }));
vi.mock('../src/host/native-purge-targets', () => ({ nativePurgeTargets: undefined }));
vi.mock('@botharness/host-client/media-cache', () => ({
  installMediaStore: () => undefined,
  runAutoCleanup: () => undefined,
}));
vi.mock('../src/host/host-store', () => ({
  installHostStoreOpener: () => undefined,
  retryHostStoreDeletes: async () => undefined,
}));
vi.mock('../src/host/purge-caches', () => ({ installPurgeTargets: () => undefined }));
vi.mock('../src/host/native-haptic-feedback', () => ({}));
vi.mock('../src/ui/shell/channel-navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui/shell/channel-navigation')>()),
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
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['ios', 'android'])(
  'presents New Group and Bot creation as resizable sheets with a grabber on %s',
  async (os) => {
    native.os = os;
    native.screens.clear();
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => root.render(<RootLayout />));
      const sheet = {
        presentation: 'formSheet',
        sheetAllowedDetents: [0.75, 1],
        sheetGrabberVisible: true,
      };
      expect(native.screens.get('create-channel')).toEqual(sheet);
      expect(native.screens.get('(bot-creation)')).toEqual({ ...sheet, freezeOnBlur: true });
      expect(native.screens.get('create-bot-avatar')).toEqual(
        os === 'ios' ? { presentation: 'modal' } : {},
      );
      expect(native.screens.get('pair')).toMatchObject({ presentation: 'formSheet' });
    } finally {
      await act(async () => root.unmount());
    }
  },
);
