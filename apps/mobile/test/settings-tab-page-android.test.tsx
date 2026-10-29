// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
}));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  return {
    ...shim,
    default: {
      ...shim.default,
      ScrollView: (props: { onScroll?: unknown; children?: ReactNode; testID?: string }) =>
        createElement(
          'div',
          {
            'data-testid': props.testID,
            'data-scroll': props.onScroll === undefined ? 'off' : 'on',
          },
          props.children,
        ),
    },
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
vi.mock('../src/ui/shell/scroll-chrome', () => ({
  CollapsingToolbar: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'collapsing' }, children),
  useChromeProgress: () => ({ value: 0, get: () => 0 }),
}));
vi.mock('../src/ui/shell/floating-tab-inset', () => ({ useFloatingTabInset: () => 0 }));

import { SettingsForm } from '../src/ui/primitives/settings-form';
import { SettingsTabPage } from '../src/ui/shell/settings-tab-page.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

it('puts the Settings title in a collapsing bar and wires the form scroll to it', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <SettingsTabPage onScroll={() => {}}>
        <SettingsForm testID="settings-form">
          <span>row</span>
        </SettingsForm>
      </SettingsTabPage>,
    ),
  );
  const bar = host.querySelector('[data-testid="collapsing"]');
  expect(bar?.querySelector('[role="header"]')?.textContent).toBe(t.settings);
  expect(host.querySelector('[data-testid="settings-form"]')?.getAttribute('data-scroll')).toBe(
    'on',
  );
});

it('leaves a plain form without the tab scroll', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <SettingsForm testID="settings-form">
        <span>row</span>
      </SettingsForm>,
    ),
  );
  expect(host.querySelector('[data-testid="settings-form"]')?.getAttribute('data-scroll')).toBe(
    null,
  );
});
