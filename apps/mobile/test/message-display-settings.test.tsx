// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  CheckIcon: () => null,
}));
vi.mock('../src/host/native-message-display', async () => {
  const { useSyncExternalStore } = await import('react');
  const { createMessageDisplayPreferences } = await import('../src/host/message-display');
  const preferences = createMessageDisplayPreferences({
    read: async () => 'streaming',
    write() {
      throw new Error('disk full');
    },
  });
  return {
    messageDisplayPreferences: preferences,
    useMessageDisplay: () => useSyncExternalStore(preferences.subscribe, preferences.getSnapshot),
  };
});

import { MessageDisplaySetting } from '../src/ui/shell/message-display-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows the mode on one row, picks complete bubbles from its menu, and exposes a failed save', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MessageDisplaySetting />));
    const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const row = () => byTestId('settings-message-display')!;
    expect(row().textContent).toContain(t.messageDisplay.title);
    expect(row().textContent).toContain(t.messageDisplay.streaming);
    expect(byTestId('settings-message-display-complete')).toBeNull();
    await act(async () => row().click());
    expect(byTestId('settings-message-display-streaming')!.getAttribute('aria-selected')).toBe(
      'true',
    );
    await act(async () => byTestId('settings-message-display-complete')!.click());
    expect(byTestId('settings-message-display-complete')).toBeNull();
    expect(row().textContent).toContain(t.messageDisplay.complete);
    expect(container.textContent).toContain(t.messageDisplay.storageError);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
