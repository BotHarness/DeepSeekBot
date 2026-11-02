// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlusMenuButtonProps } from '../src/ui/primitives/plus-menu';
type NativeProps = {
  identifier: string;
  disabled: boolean;
  items: Array<{ id: string; children: Array<{ id: string }> }>;
  onOpen(): void;
  onSelect(event: { nativeEvent: { id: string } }): void;
};
let bridge: NativeProps;
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('expo-haptics', async () => import('./expo-haptics-shim'));
vi.mock('expo', () => ({
  requireNativeView: () => (props: NativeProps) => {
    bridge = props;
    return null;
  },
}));
import { PlusMenuButton } from '../src/ui/primitives/plus-menu-button.ios';
import { setHapticsEnabled } from '../src/ui/haptics';
import { played } from './expo-haptics-shim';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
const pick = vi.fn();
function render(overrides: Partial<PlusMenuButtonProps> = {}) {
  if (!host) {
    host = document.createElement('div');
    root = createRoot(host);
  }
  act(() =>
    root!.render(
      <PlusMenuButton
        label="Add attachment"
        testID="composer-attach"
        size={44}
        items={[{ id: 'photos', label: 'Photos', symbol: 'photo', run: pick }]}
        {...overrides}
      />,
    ),
  );
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host = undefined;
  played.length = 0;
  setHapticsEnabled(true);
  vi.clearAllMocks();
});
it('only requests feedback for the native opening event, never render or selection', () => {
  render();
  expect(bridge.identifier).toBe('composer-attach');
  expect(played).toEqual([]);
  act(() => bridge.onOpen());
  expect(played).toEqual(['impact:light']);
  act(() => bridge.onSelect({ nativeEvent: { id: 'photos' } }));
  expect(pick).toHaveBeenCalledOnce();
  expect(played).toEqual(['impact:light']);
  render();
  expect(played).toHaveLength(1);
  act(() => bridge.onOpen());
  expect(played).toHaveLength(2);
});
it('respects preference changes and disabled controls without blocking enabled selections', () => {
  setHapticsEnabled(false);
  render();
  act(() => bridge.onOpen());
  act(() => bridge.onSelect({ nativeEvent: { id: 'photos' } }));
  expect(pick).toHaveBeenCalledOnce();
  expect(played).toEqual([]);
  setHapticsEnabled(true);
  act(() => bridge.onOpen());
  expect(played).toEqual(['impact:light']);
  render({ disabled: true });
  act(() => {
    bridge.onOpen();
    bridge.onSelect({ nativeEvent: { id: 'photos' } });
  });
  expect(bridge.disabled).toBe(true);
  expect(pick).toHaveBeenCalledOnce();
  expect(played).toHaveLength(1);
});
it('uses the latest scoped callbacks, supports nested choices and ignores stale native IDs', () => {
  const stale = vi.fn(),
    current = vi.fn();
  const item = { id: 'host', label: 'Host', symbol: 'desktopcomputer', run: stale };
  render({ items: [{ ...item, children: [{ ...item, id: 'child' }] }] });
  render({ items: [{ ...item, children: [{ ...item, id: 'child', run: current }] }] });
  expect(bridge.items[0]?.children[0]?.id).toBe('child');
  act(() => {
    bridge.onSelect({ nativeEvent: { id: 'removed' } });
    bridge.onSelect({ nativeEvent: { id: 'child' } });
  });
  expect(stale).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
  expect(played).toEqual([]);
});
