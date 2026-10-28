// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  read: vi.fn<() => Promise<boolean>>(),
  motion: undefined as ((value: boolean) => void) | undefined,
  state: undefined as ((value: string) => void) | undefined,
  removeMotion: vi.fn(),
  removeState: vi.fn(),
  platform: { OS: 'ios' },
}));
vi.mock('react-native', () => ({
  Platform: native.platform,
  AccessibilityInfo: {
    isReduceMotionEnabled: native.read,
    addEventListener: (_event: string, listener: (value: boolean) => void) => {
      native.motion = listener;
      return { remove: native.removeMotion };
    },
  },
  AppState: {
    addEventListener: (_event: string, listener: (value: string) => void) => {
      native.state = listener;
      return { remove: native.removeState };
    },
  },
}));

import { profileScreenOptions } from '../src/ui/chat/profile-presentation';
import { resolveTheme } from '../src/ui/design/theme';
import { useSystemReducedMotion } from '../src/ui/primitives/use-system-reduced-motion';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let view: HTMLDivElement | undefined;
function ProfileTransition() {
  const reduced = useSystemReducedMotion();
  return (
    <output>{profileScreenOptions(resolveTheme('light', {}, 'ios'), reduced).animation}</output>
  );
}
async function mount() {
  view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root?.render(<ProfileTransition />));
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  view = undefined;
  native.platform.OS = 'ios';
  vi.resetAllMocks();
});

describe('profile navigation and the live system motion preference', () => {
  it('uses the current setting and updates without restarting the app', async () => {
    native.read.mockResolvedValue(true);
    await mount();
    expect(view?.textContent).toBe('fade');
    await act(async () => native.motion?.(false));
    expect(view?.textContent).toBe('default');
    await act(async () => native.motion?.(true));
    expect(view?.textContent).toBe('fade');
  });

  it('rechecks after returning from Settings and removes both subscriptions', async () => {
    native.read.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mount();
    expect(view?.textContent).toBe('default');
    await act(async () => native.state?.('active'));
    expect(view?.textContent).toBe('fade');
    act(() => root?.unmount());
    root = undefined;
    expect(native.removeMotion).toHaveBeenCalledOnce();
    expect(native.removeState).toHaveBeenCalledOnce();
  });

  it('does not let a late initial read override a newer accessibility event', async () => {
    let resolveRead: ((value: boolean) => void) | undefined;
    native.read.mockImplementation(() => new Promise((resolve) => (resolveRead = resolve)));
    await mount();
    await act(async () => native.motion?.(true));
    await act(async () => resolveRead?.(false));
    expect(view?.textContent).toBe('fade');
  });

  it('preserves Android page navigation with either system preference', () => {
    native.platform.OS = 'android';
    for (const reduced of [false, true]) {
      expect(profileScreenOptions(resolveTheme('light', {}, 'android'), reduced)).toMatchObject({
        animation: 'slide_from_right',
        presentation: 'card',
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
      });
    }
  });
});
