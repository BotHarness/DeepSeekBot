// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ visible: false }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: () => null,
  useKeyboardState: <T,>(select: (state: { isVisible: boolean }) => T) =>
    select({ isVisible: keyboard.visible }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

import { useListBottomSafeArea } from '../src/ui/primitives/keyboard-frame';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function measure() {
  const seen: number[] = [];
  function Probe() {
    seen.push(useListBottomSafeArea());
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  return seen.at(-1);
}

describe('list bottom safe area', () => {
  it('is the home indicator inset while the keyboard is closed', () => {
    keyboard.visible = false;
    expect(measure()).toBe(34);
  });

  it('is zero while the keyboard covers the home indicator', () => {
    keyboard.visible = true;
    expect(measure()).toBe(0);
  });
});
