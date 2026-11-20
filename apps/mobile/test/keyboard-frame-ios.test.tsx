// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ visible: false }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: () => null,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => (
    <div data-testid="avoiding">{children}</div>
  ),
  KeyboardStickyView: ({
    children,
    offset,
  }: {
    children: ReactNode;
    offset: { closed: number; opened: number };
  }) => (
    <div data-testid="sticky" data-closed={offset.closed} data-opened={offset.opened}>
      {children}
    </div>
  ),
  useKeyboardState: <T,>(select: (state: { isVisible: boolean }) => T) =>
    select({ isVisible: keyboard.visible }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

import { space } from '../src/ui/design/tokens';
import { KeyboardChatFrame, useListBottomSafeArea } from '../src/ui/primitives/keyboard-frame.ios';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('iOS chat keyboard frame', () => {
  it('pins the composer to the keyboard instead of padding the list', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <KeyboardChatFrame
          composer={<span data-testid="composer" />}
          backgroundColor="white"
          onMount={() => {}}
          onComposerLayout={() => {}}
        >
          <span data-testid="list" />
        </KeyboardChatFrame>,
      ),
    );
    const sticky = container.querySelector<HTMLElement>('[data-testid="sticky"]')!;
    expect(sticky.querySelector('[data-testid="composer"]')).not.toBeNull();
    expect(sticky.dataset['closed']).toBe('0');
    expect(sticky.dataset['opened']).toBe(String(34 - space.x3));
    expect(container.querySelector('[data-testid="avoiding"]')).toBeNull();
    act(() => root.unmount());
  });

  it('keeps the home indicator inset whether or not the keyboard is open', () => {
    const seen: number[] = [];
    function Probe() {
      seen.push(useListBottomSafeArea());
      return null;
    }
    for (const visible of [false, true]) {
      keyboard.visible = visible;
      const root = createRoot(document.createElement('div'));
      act(() => root.render(<Probe />));
      act(() => root.unmount());
    }
    expect(seen.at(0)).toBe(34);
    expect(seen.at(-1)).toBe(34);
  });
});
