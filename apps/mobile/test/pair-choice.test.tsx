// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'sheet' }));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: [] }) }));
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() }));
const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => params.current,
  useFocusEffect: (focus: () => void) => {
    useState(focus);
  },
}));

import PairChoiceScreen from '../app/pair/index';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  params.current = {};
  vi.clearAllMocks();
});

async function render(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<PairChoiceScreen />));
  return host;
}

it('offers LAN, account sign-in and Tailscale through the existing pairing flow', async () => {
  const view = await render();
  expect(view.textContent).toContain(t.pairChoice.account);
  expect(view.textContent).toContain(t.pairChoice.tailscale);
  expect(view.textContent).not.toContain(t.cloud.title);
  expect(view.querySelector('input')).toBeNull();
  expect(view.textContent).toContain(t.pairChoice.lan);
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-choice-lan"]')!.click(),
  );
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/pair/tailscale',
    params: { mode: 'lan' },
  });

  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-choice-account"]')!.click(),
  );
  expect(router.push).toHaveBeenLastCalledWith('/pair/account');
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-choice-tailscale"]')!.click(),
  );
  expect(router.push).toHaveBeenLastCalledWith('/pair/tailscale');
});

it('forwards a pairing link to Tailscale and an account computer to sign-in', async () => {
  params.current = { p: 'abc' };
  await render();
  expect(router.push).toHaveBeenCalledWith({ pathname: '/pair/tailscale', params: { p: 'abc' } });
  act(() => root?.unmount());
  root = undefined;

  params.current = { account: 'hstudio' };
  await render();
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/pair/account',
    params: { account: 'hstudio' },
  });
});
