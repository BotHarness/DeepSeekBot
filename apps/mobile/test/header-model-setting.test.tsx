// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

const disk = vi.hoisted(() => ({ saved: [] as boolean[] }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));
vi.mock('../src/host/native-header-model', async () => {
  const { createTogglePreference } = await import('../src/host/toggle-preference');
  const preferences = createTogglePreference(
    {
      read: async () => undefined,
      write(enabled) {
        disk.saved.push(enabled);
      },
    },
    true,
  );
  return {
    headerModelPreferences: preferences,
    useHeaderModelPreferences: () =>
      useSyncExternalStore(preferences.subscribe, preferences.getSnapshot),
  };
});

import { HeaderModelSetting } from '../src/ui/shell/header-model-setting';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows the model in the chat header until the person turns it off, and saves the choice', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<HeaderModelSetting />));
    const toggle = () =>
      container.querySelector<HTMLInputElement>(`[aria-label="${t.headerModel.title}"]`)!;
    expect(toggle().getAttribute('data-testid')).toBe('header-model-toggle');
    expect(toggle().checked).toBe(true);
    expect(container.textContent).toContain(t.headerModel.detail);
    expect(container.textContent).not.toContain(t.headerModel.storageError);
    await act(async () => toggle().click());
    expect(toggle().checked).toBe(false);
    expect(disk.saved).toEqual([false]);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
