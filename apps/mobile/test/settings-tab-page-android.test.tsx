// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type NativeStyle = { marginTop?: number; transform?: Array<{ translateY: number }> };
function view({ children, style }: { children?: ReactNode; style?: NativeStyle | NativeStyle[] }) {
  const flat = Object.assign({}, ...(Array.isArray(style) ? style : [style]));
  return createElement(
    'div',
    {
      'data-offset': (flat.marginTop ?? 0) + (flat.transform?.[0]?.translateY ?? 0),
    },
    children,
  );
}
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: view,
  Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
}));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  return {
    ...shim,
    default: {
      ...shim.default,
      View: view,
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

it('keeps the scrolling viewport below a fixed header across rerenders', () => {
  const host = document.createElement('div');
  root = createRoot(host);
  const render = () =>
    root?.render(
      <SettingsTabPage>
        <SettingsForm testID="settings-form">
          <span>row</span>
        </SettingsForm>
      </SettingsTabPage>,
    );
  act(render);
  const offset = () => {
    let node = host.querySelector('[data-testid="settings-form"]')?.parentElement;
    let y = 0;
    while (node && node !== host) {
      y += Number(node.getAttribute('data-offset') ?? 0);
      node = node.parentElement;
    }
    return y;
  };
  const initial = offset();
  for (let pass = 0; pass < 4; pass++) {
    act(render);
    expect(offset()).toBe(initial);
  }
});

it('keeps the Settings title outside the form without a scroll visibility handler', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <SettingsTabPage>
        <SettingsForm testID="settings-form">
          <span>row</span>
        </SettingsForm>
      </SettingsTabPage>,
    ),
  );
  const bar = host.querySelector('[role="header"]')?.parentElement;
  expect(bar?.querySelector('[role="header"]')?.textContent).toBe(t.settings);
  expect(host.querySelector('[data-testid="settings-form"]')?.getAttribute('data-scroll')).toBe(
    null,
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
