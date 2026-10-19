// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callbacks = vi.hoisted(() => ({
  back: vi.fn(),
  activate: undefined as (() => void) | undefined,
  escape: undefined as (() => void) | undefined,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: callbacks.back }) }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: { ...shim.Platform, OS: 'ios' },
    Pressable: (props: Record<string, unknown> & { children?: ReactNode }) => {
      callbacks.activate = props['onAccessibilityTap'] as (() => void) | undefined;
      callbacks.escape = props['onAccessibilityEscape'] as (() => void) | undefined;
      return createElement(shim.Pressable, props);
    },
  };
});

import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  callbacks.activate = undefined;
  callbacks.escape = undefined;
  vi.clearAllMocks();
});
async function render(element: ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

describe('iOS modal handle dismissal', () => {
  it('exposes one named Close button and closes the owning sheet on tap', async () => {
    const closeSheet = vi.fn();
    const view = await render(
      <SheetScreen modalGrabber onClose={closeSheet}>
        Settings
      </SheetScreen>,
    );
    const buttons = view.querySelectorAll<HTMLButtonElement>('button[role="button"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute('aria-label')).toBe(t.close);
    await act(async () => buttons[0]!.click());
    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(callbacks.back).not.toHaveBeenCalled();
  });

  it.each(['activate', 'escape'] as const)(
    'routes accessibility %s to the owning sheet',
    async (action) => {
      const closeSheet = vi.fn();
      await render(
        <SheetScreen modalGrabber onClose={closeSheet}>
          Settings child
        </SheetScreen>,
      );
      expect(callbacks[action]).toBeTypeOf('function');
      await act(async () => callbacks[action]!());
      expect(closeSheet).toHaveBeenCalledTimes(1);
      expect(callbacks.back).not.toHaveBeenCalled();
    },
  );

  it('falls back to router dismissal when there is no explicit owner', async () => {
    const view = await render(<SheetScreen modalGrabber>Settings</SheetScreen>);
    await act(async () => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(callbacks.back).toHaveBeenCalledTimes(1);
  });

  it('does not overlay a Close handle on native resizable form sheets', async () => {
    const view = await render(<SheetScreen>Editor</SheetScreen>);
    expect(view.querySelector('button')).toBeNull();
  });
});
