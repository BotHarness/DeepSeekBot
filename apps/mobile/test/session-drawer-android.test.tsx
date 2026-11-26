import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const drawer = vi.hoisted(() => ({ gateAvailable: true, open: false, edge: 1 }));

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  RNHostView: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    hasModalSessionDrawer: () => true,
    ...(drawer.gateAvailable ? { hasSessionDrawerContentGate: () => true } : {}),
  }),
  requireNativeView: (_module: string, name: string) => {
    if (name === 'SlotView') {
      return ({ slotName, children }: { slotName: string; children: ReactNode }) => (
        <section data-slot={slotName}>{children}</section>
      );
    }
    if (name === 'SessionDrawerContentGate') {
      return ({
        drawerSwipeEnabled,
        children,
      }: {
        drawerSwipeEnabled: boolean;
        children: ReactNode;
      }) => <div data-drawer-swipe={drawerSwipeEnabled}>{children}</div>;
    }
    return ({ children }: { children: ReactNode }) => children;
  },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', color: { accent: 'blue', base: 'white' } }),
}));
vi.mock('../src/features/sessions/session-drawer-chrome', () => ({
  useSessionDrawerChrome: () => () => {},
}));
vi.mock('../src/features/sessions/session-drawer-content', () => ({
  SessionDrawerContent: () => <span>Drawer panel</span>,
}));
vi.mock('../src/features/sessions/session-drawer-state', () => ({
  sessionDrawer: {},
  useDrawerPlace: () => ({ edge: drawer.edge }),
  useSessionDrawer: () => ({ open: drawer.open, shown: drawer.open }),
}));
vi.mock('../src/features/sessions/session-drawer-surface', () => ({
  SessionDrawerSurface: () => null,
}));

beforeEach(() => {
  Object.assign(drawer, { gateAvailable: true, open: false, edge: 1 });
  vi.resetModules();
});

it('enables the native touch gate only on closed drawer content with gestures enabled', async () => {
  const { SessionDrawer } = await import('../src/features/sessions/session-drawer.android');
  const render = () => renderToStaticMarkup(<SessionDrawer>Session page</SessionDrawer>);

  expect(render()).toContain(
    '<section data-slot="content"><div data-drawer-swipe="true">Session page',
  );
  drawer.open = true;
  expect(render()).toContain(
    '<section data-slot="content"><div data-drawer-swipe="false">Session page',
  );
  drawer.open = false;
  drawer.edge = 0;
  expect(render()).toContain(
    '<section data-slot="content"><div data-drawer-swipe="false">Session page',
  );
});

it('keeps Session content on dev builds that only have the native drawer', async () => {
  drawer.gateAvailable = false;
  const { SessionDrawer } = await import('../src/features/sessions/session-drawer.android');
  const view = renderToStaticMarkup(<SessionDrawer>Session page</SessionDrawer>);

  expect(view).toContain('<section data-slot="content"><div>Session page');
  expect(view).not.toContain('data-drawer-swipe');
});
