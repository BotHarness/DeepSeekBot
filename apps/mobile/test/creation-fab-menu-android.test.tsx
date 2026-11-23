// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ testID: (testID: string) => ({ testID }) }));
vi.mock('expo', () => ({
  requireNativeView:
    () =>
    ({
      direct,
      expanded,
      label,
      onToggle,
    }: {
      direct: boolean;
      expanded: boolean;
      label: string;
      onToggle(): void;
    }) =>
      createElement('button', {
        'aria-label': label,
        'data-direct': String(direct),
        'data-expanded': String(expanded),
        onClick: onToggle,
      }),
}));
import { SessionCreateFab } from '../src/ui/shell/session-create-fab.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('uses the native FAB in direct mode for Sessions', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  try {
    act(() => root.render(<SessionCreateFab onPress={open} />));
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.hostSessions.create}"]`,
    )!;
    expect(button.getAttribute('data-direct')).toBe('true');
    act(() => button.click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('data-expanded')).toBe('false');
  } finally {
    act(() => root.unmount());
  }
});
