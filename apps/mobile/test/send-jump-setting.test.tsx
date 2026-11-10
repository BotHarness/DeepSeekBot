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
vi.mock('../src/host/native-send-jump', async () => {
  const { createTogglePreference } = await import('../src/host/toggle-preference');
  const preferences = createTogglePreference(
    {
      read: async () => undefined,
      write(enabled) {
        disk.saved.push(enabled);
      },
    },
    false,
  );
  return {
    sendJumpPreferences: preferences,
    useSendJumpPreferences: () =>
      useSyncExternalStore(preferences.subscribe, preferences.getSnapshot),
  };
});

import { SendJumpSetting } from '../src/ui/shell/send-jump-setting';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps the reading position on send until the person turns jumping on, and saves the choice', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SendJumpSetting />));
    const toggle = () =>
      container.querySelector<HTMLInputElement>(`[aria-label="${t.sendJump.title}"]`)!;
    expect(toggle().getAttribute('data-testid')).toBe('send-jump-toggle');
    expect(toggle().checked).toBe(false);
    expect(container.textContent).toContain(t.sendJump.detail);
    expect(container.textContent).not.toContain(t.sendJump.storageError);
    await act(async () => toggle().click());
    expect(toggle().checked).toBe(true);
    expect(disk.saved).toEqual([true]);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
