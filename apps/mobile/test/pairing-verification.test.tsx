// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
const history = channelNavigationHarness(true);

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-constants', () => ({ default: { deviceName: 'Test phone' } }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('@expo/ui', () => ({
  Host: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Column: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ label, testID, onPress }: { label: string; testID: string; onPress(): void }) => (
    <button data-testid={testID} onClick={onPress}>
      {label}
    </button>
  ),
}));
const mocks = vi.hoisted(() => ({
  pairHost: vi.fn(),
  dismissTo: vi.fn(),
  offer: vi.fn(),
  getState: vi.fn(),
  save: vi.fn(),
  initialize: vi.fn(),
  filter: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mocks.dismissTo }),
  useNavigationContainerRef: () => history.navigation,
}));
vi.mock('../src/host/host-session', () => ({
  hostSession: { pair: mocks.save, getState: mocks.getState },
}));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/native-connect-account', () => ({ connectAccount: { offer: mocks.offer } }));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { initialize: mocks.initialize } }));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { set: mocks.filter },
}));
vi.mock('../src/telemetry/native', () => ({
  mobileTelemetry: { pairing: () => ({ finish: () => {} }) },
}));
vi.mock('../src/host/pairing', () => ({ pairHost: mocks.pairHost }));

import type { pairHost } from '../src/host/pairing';
import type { SavedHost } from '../src/host/hosts';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { PairingVerification } from '../src/ui/shell/pairing-verification';
import { usePairing } from '../src/ui/shell/use-pairing';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fingerprint =
  'abcd 0123 4567 89ab cdef 0123 4567 89ab cdef 0123 4567 89ab cdef 0123 4567 89ab';
let pairing: ReturnType<typeof usePairing>;
let root: Root;
let view: HTMLElement;
let pairingOptions: Parameters<typeof usePairing>[0] = {};
function Harness() {
  pairing = usePairing(pairingOptions);
  return pairing.busy ? <PairingVerification pairing={pairing} /> : null;
}
afterEach(() => {
  act(() => {
    pairing?.abort();
    root?.unmount();
  });
  view?.remove();
  vi.clearAllMocks();
  pairingOptions = {};
});
async function setup() {
  mocks.getState.mockReturnValue({ hosts: [] });
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await act(async () => root.render(<Harness />));
  let resolvePair: (value: { ok: true }) => void;
  const approved = new Promise<{ ok: true }>((resolve) => {
    resolvePair = resolve;
  });
  const confirmed = vi.fn();
  mocks.pairHost.mockImplementation(async (options: Parameters<typeof pairHost>[0]) => {
    const matches = await options.confirmFingerprint!(fingerprint, 'Studio');
    if (!matches) return { ok: false, code: 'host-key-confirmation-required' };
    confirmed();
    options.onPending!(fingerprint);
    return Promise.race([
      approved,
      new Promise((resolve) => {
        options.signal!.addEventListener('abort', () => resolve({ ok: false, code: 'cancelled' }), {
          once: true,
        });
      }),
    ]);
  });
  await act(async () => {
    void pairing.pair('link', 'paste');
  });
  return { confirmed, approve: async () => act(async () => resolvePair!({ ok: true })) };
}
async function click(id: string) {
  await act(async () => view.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click());
}
it('shows the complete fingerprint and optional explanation without granting trust', async () => {
  const { confirmed, approve } = await setup();
  expect(view.querySelector('[data-testid="pairing-fingerprint"]')!.textContent).toBe(fingerprint);
  expect(view.textContent).toContain('Studio');
  expect(view.textContent).not.toContain(t.pairingVerification.explanation);
  await click('pairing-fingerprint-details');
  expect(view.textContent).toContain(t.pairingVerification.explanation);
  expect(confirmed).not.toHaveBeenCalled();
  await click('pairing-fingerprint-match');
  expect(confirmed).toHaveBeenCalledTimes(1);
  expect(view.textContent).toContain(t.pairingVerification.waiting);
  expect(view.querySelector('[data-testid="pairing-fingerprint-match"]')).toBeNull();
  expect(mocks.dismissTo).not.toHaveBeenCalled();
  await approve();
  expect(mocks.dismissTo).toHaveBeenCalledWith('/');
});
it('refuses a mismatch without proceeding to device approval', async () => {
  const { confirmed } = await setup();
  await click('pairing-fingerprint-cancel');
  expect(confirmed).not.toHaveBeenCalled();
  expect(pairing.error).toBe('host-key-confirmation-required');
  expect(pairing.busy).toBe(false);
  expect(mocks.dismissTo).not.toHaveBeenCalled();
});
it('settles a dismissed screen and ignores its stale confirmation', async () => {
  const { confirmed } = await setup();
  const stale = pairing.verification!.confirm;
  await act(async () => pairing.abort());
  expect(pairing.busy).toBe(false);
  expect(pairing.verification).toBeUndefined();
  await act(async () => stale(true));
  expect(confirmed).not.toHaveBeenCalled();
  expect(mocks.dismissTo).not.toHaveBeenCalled();
  await act(async () => {
    void pairing.pair('next link', 'paste');
  });
  expect(pairing.verification).toBeDefined();
});

it('cancels the pending phone approval without saving or navigating', async () => {
  await setup();
  await click('pairing-fingerprint-match');
  expect(pairing.fingerprint).toBe(fingerprint);
  await click('pairing-fingerprint-cancel');
  expect(pairing.busy).toBe(false);
  expect(pairing.fingerprint).toBeUndefined();
  expect(pairing.error).toBeUndefined();
  expect(mocks.dismissTo).not.toHaveBeenCalled();
});

it('keeps the account list open after a successful single ceremony', async () => {
  pairingOptions = { stayOnPage: true };
  const { approve } = await setup();
  await click('pairing-fingerprint-match');
  await approve();
  expect(pairing.busy).toBe(false);
  expect(mocks.dismissTo).not.toHaveBeenCalled();
});

it.each([false, true])(
  'opens the new environment setup after successful pairing (batch: %s)',
  async (batch) => {
    pairingOptions = { stayOnPage: batch };
    const { approve } = await setup();
    await click('pairing-fingerprint-match');
    await approve();
    mocks.dismissTo.mockClear();
    const saved: SavedHost = {
      hostId: 'new-b',
      hostName: 'Studio',
      routes: ['https://studio.example'],
      deviceId: 'phone',
      credential: 'test',
    };
    mocks.save.mockImplementation(async () =>
      mocks.getState.mockReturnValue({ hosts: [saved], saved }),
    );
    mocks.pairHost.mockImplementation(async (options: Parameters<typeof pairHost>[0]) => {
      await options.save(saved);
      return { ok: true };
    });
    await act(async () => {
      await pairing.pair('new-link', 'paste');
    });
    expect(mocks.initialize).toHaveBeenCalledWith('new-b', ['new-b'], undefined);
    if (batch) {
      expect(mocks.filter).not.toHaveBeenCalled();
      act(() => {
        pairing.finishSetup();
      });
    }
    expect(mocks.filter).toHaveBeenLastCalledWith(computerEnvironmentKey('new-b'));
    expect(history.state.routes.map((route) => route.name)).toEqual(['(tabs)', 'host-look']);
    expect(history.state.routes.at(-1)?.params).toEqual({ hostId: 'new-b' });
    expect(mocks.dismissTo).not.toHaveBeenCalled();
    history.back();
    expect(history.state.routes.map((route) => route.name)).toEqual(['(tabs)']);
    expect(pairing.finishSetup()).toBe(false);
  },
);
it.each([false, true])(
  'returns from new environment customization to the retained creation flow (batch: %s)',
  async (batch) => {
    pairingOptions = { stayOnPage: batch };
    history.push('(bot-creation)', { hostId: 'original', flow: 'zip', step: '0' });
    const creation = history.state.routes.at(-1);
    history.push('pair');
    const { approve } = await setup();
    await click('pairing-fingerprint-match');
    await approve();
    mocks.dismissTo.mockClear();
    const saved: SavedHost = {
      hostId: 'added',
      hostName: 'New environment',
      routes: ['https://new.example'],
      deviceId: 'phone',
      credential: 'test',
    };
    mocks.save.mockImplementation(async () =>
      mocks.getState.mockReturnValue({ hosts: [saved], saved }),
    );
    mocks.pairHost.mockImplementation(async (options: Parameters<typeof pairHost>[0]) => {
      await options.save(saved);
      return { ok: true };
    });
    await act(async () => {
      await pairing.pair('new-link', 'paste');
    });
    if (batch) act(() => pairing.finishSetup());
    expect(history.state.routes.map((route) => route.name)).toEqual([
      '(tabs)',
      '(bot-creation)',
      'host-look',
    ]);
    expect(history.state.routes[1]).toEqual(creation);
    expect(history.state.routes.at(-1)?.params).toEqual({ hostId: 'added' });
    expect(mocks.dismissTo).not.toHaveBeenCalled();
    history.back();
    expect(history.state.routes.at(-1)).toEqual(creation);
    expect(pairing.finishSetup()).toBe(false);
    history.back();
  },
);

it('refuses an alternate registration of an already saved Host before opening a channel', async () => {
  pairingOptions = { stayOnPage: true, preventDuplicates: true };
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await act(async () => root.render(<Harness />));
  mocks.offer.mockResolvedValue({
    ok: true,
    value: { host: { id: 'already-saved', name: 'Same name' } },
  });
  mocks.getState.mockReturnValue({
    hosts: [{ hostId: 'already-saved', encryption: { hostKey: '11'.repeat(32) } }],
  });
  const actual = await vi.importActual<typeof import('../src/host/pairing')>('../src/host/pairing');
  mocks.pairHost.mockImplementation(actual.pairHost);
  await act(async () => {
    expect(
      await pairing.pair('account:new-registration', 'account', true, 'new-registration'),
    ).toBe('channel-authentication-failed');
  });
  expect(pairing.verification).toBeUndefined();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.dismissTo).not.toHaveBeenCalled();
});
