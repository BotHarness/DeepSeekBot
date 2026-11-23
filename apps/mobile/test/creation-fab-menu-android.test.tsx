// @vitest-environment jsdom
import { act, createRef, type ComponentRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import { NavigationAction } from '../src/ui/shell/navigation-action';
import { SessionCreateFab } from '../src/ui/shell/session-create-fab';
import { useDesignTheme } from '../src/ui/design/theme';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('opens New Session directly from the Android FAB', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  try {
    act(() => root.render(<SessionCreateFab onPress={open} />));
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.hostSessions.create}"]`,
    )!;
    expect(button.dataset.testid).toBe('session-create-fab');
    act(() => button.click());
    expect(open).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it('keeps the shared FAB at the platform touch size and prevents a disabled press', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const open = vi.fn();
  const ref = createRef<ComponentRef<typeof NavigationAction>>();
  function SmallAction() {
    const theme = useDesignTheme();
    return (
      <NavigationAction
        ref={ref}
        size={theme.touch / 2}
        label={t.createHere}
        disabled
        onPress={open}
      />
    );
  }
  try {
    act(() => root.render(<SmallAction />));
    const button = host.querySelector('button')!;
    expect(ref.current).toBe(button);
    expect(JSON.parse(button.dataset.restStyle!)).toMatchObject({ width: 48, height: 48 });
    act(() => button.click());
    expect(open).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});
