// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import {
  AppIconSettings,
  type AppIconName,
  type AppIconPort,
  type AppIconPreviews,
} from '../src/ui/app-icon-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

const previews: AppIconPreviews = {
  default: { light: 1, dark: 2 },
  DeepSeekBotSimple: { light: 3, dark: 4 },
};

function port(current: AppIconName = 'default', overrides: Partial<AppIconPort> = {}) {
  return {
    supported: true,
    current: vi.fn(() => current),
    set: vi.fn(async (_name: AppIconName) => undefined),
    ...overrides,
  };
}

const row = (view: HTMLElement, title: string) =>
  [...view.querySelectorAll('[role="button"]')].find((node) =>
    node.getAttribute('aria-label')?.startsWith(`${title},`),
  ) as HTMLElement;

const selected = (view: HTMLElement) =>
  [...view.querySelectorAll('[aria-selected="true"]')].map(
    (node) => node.getAttribute('aria-label')?.split(',')[0],
  );

describe('App icon settings', () => {
  it('marks the icon the phone shows now and ships the DeepSeekBot portrait as the default', async () => {
    const view = await render(<AppIconSettings port={port()} previews={previews} />);
    expect(selected(view)).toEqual([t.appIconDeepSeekBot]);
    expect(view.textContent).toContain(t.appIconDefaultHint);
    expect(row(view, t.appIconDeepSeekBotSimple)).toBeDefined();
    expect(view.querySelectorAll('[role="button"]')).toHaveLength(2);
  });

  it('switches the home screen icon and back to the default', async () => {
    const icons = port();
    const view = await render(<AppIconSettings port={icons} previews={previews} />);

    await act(async () => row(view, t.appIconDeepSeekBotSimple).click());
    expect(icons.set).toHaveBeenLastCalledWith('DeepSeekBotSimple');
    expect(selected(view)).toEqual([t.appIconDeepSeekBotSimple]);

    await act(async () => row(view, t.appIconDeepSeekBot).click());
    expect(icons.set).toHaveBeenLastCalledWith('default');
    expect(selected(view)).toEqual([t.appIconDeepSeekBot]);
  });

  it('keeps the old icon selected and says why when the phone refuses', async () => {
    const icons = port('default', {
      set: vi.fn(async () => {
        throw new Error('denied');
      }),
    });
    const view = await render(<AppIconSettings port={icons} previews={previews} />);
    await act(async () => row(view, t.appIconDeepSeekBotSimple).click());
    expect(selected(view)).toEqual([t.appIconDeepSeekBot]);
    expect(view.textContent).toContain(`${t.appIconFailed} denied`);
  });

  it('shows the icons without offering a change on a phone that cannot switch', async () => {
    const icons = port('default', { supported: false });
    const view = await render(<AppIconSettings port={icons} previews={previews} />);
    expect(view.textContent).toContain(t.appIconUnsupported);
    expect(view.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(icons.current).not.toHaveBeenCalled();
  });
});
