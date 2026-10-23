// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const system = vi.hoisted(() => ({
  query: vi.fn<() => Promise<boolean>>(),
  changed: undefined as ((enabled: boolean) => void) | undefined,
  remove: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AccessibilityInfo: {
    isScreenReaderEnabled: system.query,
    addEventListener: (_name: string, callback: (enabled: boolean) => void) => {
      system.changed = callback;
      return { remove: system.remove };
    },
  },
}));
vi.mock('expo-router', () => ({ useFocusEffect: () => {} }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'div' },
  useSharedValue: <T,>(initial: T) =>
    useState(() => ({
      value: initial,
      get() {
        return this.value;
      },
      set(value: T) {
        this.value = value;
      },
    }))[0],
  useDerivedValue: <T,>(read: () => T) => ({ get: read }),
  withTiming: (value: number) => value,
  ReduceMotion: { System: 'system' },
}));

import {
  ScrollChromeProvider,
  useChromeProgress,
  useScrollChrome,
} from '../src/ui/shell/scroll-chrome';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('shared Android chrome accessibility', () => {
  it('keeps all chrome visible until TalkBack state is known and while it is enabled', async () => {
    let resolve = (_enabled: boolean) => {};
    system.query.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    let read = () => -1;
    let hide = () => {};
    let pin = (_enabled: boolean) => {};
    function Probe() {
      const chrome = useScrollChrome();
      const progress = useChromeProgress();
      read = () => progress.get();
      hide = () => chrome.hidden.set(true);
      pin = (enabled) => chrome.pinned.set(enabled);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      act(() =>
        root.render(
          <ScrollChromeProvider>
            <Probe />
          </ScrollChromeProvider>,
        ),
      );
      hide();
      expect(read()).toBe(0);
      await act(async () => resolve(false));
      expect(read()).toBe(1);
      pin(true);
      expect(read()).toBe(0);
      pin(false);
      expect(read()).toBe(1);
      system.changed?.(true);
      expect(read()).toBe(0);
      system.changed?.(false);
      expect(read()).toBe(1);
    } finally {
      act(() => root.unmount());
    }
    expect(system.remove).toHaveBeenCalled();
  });

  it('does not overwrite a newer screen-reader event with the stale initial query', async () => {
    let resolve = (_enabled: boolean) => {};
    system.query.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    let read = () => -1;
    function Probe() {
      const chrome = useScrollChrome();
      const progress = useChromeProgress();
      read = () => {
        chrome.hidden.set(true);
        return progress.get();
      };
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      act(() =>
        root.render(
          <ScrollChromeProvider>
            <Probe />
          </ScrollChromeProvider>,
        ),
      );
      system.changed?.(true);
      await act(async () => resolve(false));
      expect(read()).toBe(0);
    } finally {
      act(() => root.unmount());
    }
  });
});
