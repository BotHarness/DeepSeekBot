// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));
vi.mock('../src/host/native-haptic-feedback', async () => {
  const { createHapticPreferences } = await import('../src/host/haptic-feedback');
  const preferences = createHapticPreferences({
    read: async () => true,
    write() {
      throw new Error('disk full');
    },
  });
  return {
    hapticPreferences: preferences,
    useHapticPreferences: () =>
      useSyncExternalStore(preferences.subscribe, preferences.getSnapshot),
  };
});

import { HapticFeedbackSetting } from '../src/ui/shell/haptic-feedback-setting';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('offers the local toggle and exposes a failed save without undoing the current choice', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<HapticFeedbackSetting />));
    const toggle = () =>
      container.querySelector<HTMLInputElement>(`[aria-label="${t.hapticFeedback.title}"]`)!;
    expect(toggle().checked).toBe(true);
    expect(toggle().getAttribute('data-testid')).toBe('haptic-feedback-toggle');
    await act(async () => toggle().click());
    expect(toggle().checked).toBe(false);
    expect(container.textContent).toContain(t.hapticFeedback.storageError);
    await act(async () => toggle().click());
    expect(toggle().checked).toBe(true);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
