// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/row-icon', async () => {
  const { createElement } = await import('react');
  return { RowIcon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }) };
});
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'sheet' }));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: [] }) }));
vi.mock('../src/ui/shell/pair-scanner', async () => {
  const { createElement } = await import('react');
  return {
    PairScanner: ({ steps, children }: { steps: string[]; children: React.ReactNode }) =>
      createElement('section', { 'data-testid': 'pair-scanner' }, steps.join(' › '), children),
  };
});
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

it('leaves only the scanner and Tobs account sign-in as ways to connect', async () => {
  const view = await render();
  expect(view.querySelector('[data-testid="pair-scanner"]')?.textContent).toContain(
    t.pairChoice.connectPath.join(' › '),
  );
  const rows = [...view.querySelectorAll<HTMLElement>('[data-testid^="pair-"]')]
    .map((row) => row.dataset.testid)
    .filter((id) => id !== 'pair-scanner');
  expect(rows).toEqual(['pair-choice-account', 'pair-guide-open']);
  expect(view.textContent).not.toContain(t.pairChoice.lan);
  expect(view.textContent).not.toContain(t.cloud.title);
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-choice-account"]')!.click(),
  );
  expect(router.push).toHaveBeenLastCalledWith('/pair/account');
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

it('puts what the computer needs on the setup guide row and opens the guide', async () => {
  const { Linking } = await import('react-native');
  const openURL = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const view = await render();
  expect(view.querySelector('[data-testid="pair-guide-open"]')?.textContent).toContain(
    t.pairChoice.needs,
  );
  await act(async () =>
    view.querySelector<HTMLElement>('[data-testid="pair-guide-open"]')!.click(),
  );
  expect(openURL).toHaveBeenCalledWith(t.pairGuide.url);
  expect(view.querySelector('[role="alert"]')).toBeNull();
});

it('titles a scanned local-network code as the Wi-Fi path, not Tailscale', async () => {
  const p = Buffer.from(
    JSON.stringify({
      v: 1,
      host: { id: 'host', name: 'Mac' },
      offer: 'offer',
      routes: ['http://192.168.1.200:65488', 'http://127.0.0.1:39164'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  ).toString('base64url');
  params.current = { p };
  await render();
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/pair/tailscale',
    params: { p, mode: 'lan' },
  });
});
