// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const back = vi.hoisted(() => ({ handler: undefined as (() => boolean) | undefined }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', Version: 36 },
  processColor: () => -1,
}));
vi.mock('expo', async () => {
  const { View } = await import('./react-native-shim');
  return { requireNativeView: () => View };
});
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ overlay: { fill: '#ffffff' } }),
}));
vi.mock('../src/ui/shell/back-owner', () => ({
  holdBack: (handler: () => boolean) => {
    back.handler = handler;
    return {
      remove: () => {
        back.handler = undefined;
      },
    };
  },
}));
import { EndSheet } from '../src/ui/primitives/end-sheet.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('consumes hardware Back on modern Android only while the panel is open and active', async () => {
  const close = vi.fn();
  const root = createRoot(document.createElement('div'));
  const show = (open: boolean, active = true) =>
    act(async () => {
      root.render(
        <EndSheet
          open={open}
          active={active}
          enabled
          panel={<span>Profile</span>}
          onOpenChange={close}
        >
          <span>Chat</span>
        </EndSheet>,
      );
    });
  try {
    await show(false);
    expect(back.handler).toBeUndefined();
    await show(true);
    expect(back.handler?.()).toBe(true);
    expect(close).toHaveBeenCalledWith(false);
    await show(true, false);
    expect(back.handler).toBeUndefined();
    await show(true);
    expect(back.handler).toBeDefined();
    await show(false);
    expect(back.handler).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
  }
});
