// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  params: {} as { hostId?: string; account?: string },
  hosts: vi.fn(),
  update: vi.fn(),
  back: vi.fn(),
  actions: undefined as import('../src/ui/shell/host-look-editor').HostLookActions | undefined,
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => state.params,
  useRouter: () => ({ back: state.back }),
  useFocusEffect: (effect: () => (() => void) | void) => useLayoutEffect(effect, [effect]),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ saved: undefined, hosts: [] }),
}));
vi.mock('../src/host/native-connect-account', () => ({ connectAccount: { hosts: state.hosts } }));
vi.mock('../src/host/native-host-look', () => ({
  hostLooks: { refresh: vi.fn(), update: state.update },
  useHostLook: () => ({ icon: { kind: 'emoji', emoji: '🏠' } }),
}));
vi.mock('../src/ui/design/theme', () => ({ useDesignTheme: () => ({ color: { base: 'white' } }) }));
vi.mock('../src/ui/request-parts', () => ({
  Notice: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/primitives/sheet-screen', () => ({
  SheetScreen: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/host-look-editor', () => ({
  HostLookEditor: (props: { hostName: string; actions: typeof state.actions }) => {
    state.actions = props.actions;
    return <span>{props.hostName}</span>;
  },
}));

import HostLookScreen from '../app/host-look';
import { accountHostLookId } from '../src/host/account-host-look';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.clearAllMocks();
  state.actions = undefined;
});
function mount() {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<HostLookScreen />));
  cleanups.push(() => act(() => root.unmount()));
  return node;
}
const host = { id: 'remote', hostname: 'studio.connect.example', name: 'Studio', online: true };

it('loads only the selected account computer and saves into its local look record', async () => {
  state.params = { account: host.id };
  state.hosts.mockResolvedValue({ ok: true, value: [host] });
  const node = mount();
  expect(node.querySelector('[role="progressbar"]')).not.toBeNull();
  await act(async () => {});
  expect(node.textContent).toBe('Studio');
  const next = { name: 'My studio', icon: { kind: 'emoji' as const, emoji: '🏠' } };
  await act(async () => state.actions!.onSave(next));
  expect(state.update).toHaveBeenCalledWith(accountHostLookId(host.hostname), expect.any(Function));
  expect(state.update.mock.calls[0]![1]()).toEqual(next);
  expect(state.hosts).toHaveBeenCalledTimes(2);
});

it('refuses saving if the account computer disappears or the account changes', async () => {
  state.params = { account: host.id };
  state.hosts.mockResolvedValueOnce({ ok: true, value: [host] });
  mount();
  await act(async () => {});
  state.hosts.mockResolvedValue({ ok: true, value: [] });
  await expect(state.actions!.onSave({ icon: { kind: 'symbol', id: 'desktop' } })).rejects.toThrow(
    t.hostLookMissing,
  );
  expect(state.update).not.toHaveBeenCalled();
});

it('does not substitute the current paired computer when the requested account computer is missing', async () => {
  state.params = { account: 'missing' };
  state.hosts.mockResolvedValue({ ok: true, value: [host] });
  const node = mount();
  await act(async () => {});
  expect(node.textContent).toBe(t.hostLookMissing);
  expect(state.actions).toBeUndefined();
});
