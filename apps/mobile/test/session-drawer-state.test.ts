import { expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ dismiss: vi.fn() }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: keyboard,
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

import {
  closeSessionDrawer,
  enterDrawerRoot,
  openSessionDrawer,
  sessionDrawer,
  drawerPlace,
  sessionDrawerProgress,
} from '../src/features/sessions/session-drawer-state';

it('dismisses the keyboard as it opens and hides once closed', () => {
  openSessionDrawer();
  expect(keyboard.dismiss).toHaveBeenCalledOnce();
  expect(sessionDrawer.getSnapshot()).toEqual({ open: true, shown: true, animated: true });
  closeSessionDrawer(false);
  expect(sessionDrawer.getSnapshot()).toEqual({ open: false, shown: false, animated: false });
  expect(sessionDrawerProgress.value).toBe(0);
});

it('follows the Compose drawer’s reported target', () => {
  sessionDrawer.nativeChange(true);
  expect(sessionDrawer.getSnapshot().open).toBe(true);
  sessionDrawer.nativeChange(false);
  expect(sessionDrawer.getSnapshot().open).toBe(false);
});

it('hides the revealed panel when an opening drag falls back to closed', () => {
  sessionDrawer.nativeProgress(0.3);
  expect(sessionDrawer.getSnapshot()).toMatchObject({ open: false, shown: true });
  sessionDrawer.nativeProgress(0);
  expect(sessionDrawer.getSnapshot()).toMatchObject({ open: false, shown: false });
});

it('keeps an open drawer shown while it reports progress back towards closed', () => {
  sessionDrawer.nativeChange(true);
  sessionDrawer.nativeProgress(0);
  expect(sessionDrawer.getSnapshot()).toMatchObject({ open: true, shown: true });
  sessionDrawer.nativeChange(false);
  expect(sessionDrawer.getSnapshot()).toMatchObject({ open: false, shown: false });
});

it('enables the edge gesture only while a Drawer-style root is focused', () => {
  expect(drawerPlace()).toEqual({ edge: 0, sessionId: undefined });
  const leaveRoot = enterDrawerRoot();
  const leaveSession = enterDrawerRoot('chosen');
  expect(drawerPlace()).toEqual({ edge: 2, sessionId: 'chosen' });
  leaveRoot();
  expect(drawerPlace()).toEqual({ edge: 1, sessionId: 'chosen' });
  leaveSession();
  expect(drawerPlace()).toEqual({ edge: 0, sessionId: undefined });
});

it('dismisses the keyboard as the drawer closes, so a focused search field does not stay up', () => {
  openSessionDrawer();
  keyboard.dismiss.mockClear();
  closeSessionDrawer(false);
  expect(keyboard.dismiss).toHaveBeenCalledOnce();
  sessionDrawer.nativeChange(true);
  keyboard.dismiss.mockClear();
  sessionDrawer.nativeChange(false);
  expect(keyboard.dismiss).toHaveBeenCalledOnce();
  keyboard.dismiss.mockClear();
  closeSessionDrawer(false);
  expect(keyboard.dismiss).not.toHaveBeenCalled();
});
