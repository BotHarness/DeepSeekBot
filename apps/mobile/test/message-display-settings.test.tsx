// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
vi.mock('../src/ui/shell/icons', () => ({ CheckIcon: () => null }));
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

import { MessageDisplaySettings } from '../src/ui/shell/message-display-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows both choices, applies a complete-bubble choice, and exposes a failed save', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MessageDisplaySettings />));
    const option = (label: string) =>
      [...container.querySelectorAll('button')].find((button) =>
        button.textContent?.startsWith(label),
      )!;
    expect(option(t.messageDisplay.streaming).getAttribute('aria-selected')).toBe('true');
    expect(option(t.messageDisplay.complete).getAttribute('aria-selected')).toBe('false');
    await act(async () => option(t.messageDisplay.complete).click());
    expect(option(t.messageDisplay.complete).getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain(t.messageDisplay.storageError);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
