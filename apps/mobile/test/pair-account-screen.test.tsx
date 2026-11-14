// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { AccountHosts } from '../src/ui/account-hosts';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: [] }) }));
vi.mock('../src/host/native-connect-account', () => ({ connectAccount: {} }));
const pairing = vi.hoisted(() => ({
  pair: vi.fn(async () => 'unreachable'),
  lastFailure: () => ({
    code: 'unreachable',
    phase: 'pairing-offer',
    detail: 'connect:socket-timeout',
    occurredAt: '2026-11-14T00:00:00Z',
  }),
  finishSetup: vi.fn(),
  abort: vi.fn(),
  busy: false,
}));
vi.mock('../src/ui/shell/use-pairing', () => ({ usePairing: () => pairing }));
vi.mock('../src/ui/shell/pairing-verification', () => ({ PairingVerification: () => null }));
vi.mock('../src/ui/account-hosts', () => ({
  AccountHosts: (props: ComponentProps<typeof AccountHosts>) => (
    <>
      <button
        onClick={() =>
          void props.onPair([
            {
              id: 'hoff',
              name: 'Offline observation',
              hostname: 'hoff.deepseekbot.dev',
              online: false,
            },
          ])
        }
      >
        Try Host
      </button>
      <output>{props.failures?.['hoff']?.detail}</output>
    </>
  ),
}));
import PairAccountScreen from '../app/pair/account';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('preserves the actual connection diagnostic for a Host the service reported offline', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<PairAccountScreen />));
    await act(async () => element.querySelector('button')!.click());
    expect(pairing.pair).toHaveBeenCalledOnce();
    expect(element.querySelector('output')?.textContent).toBe('connect:socket-timeout');
  } finally {
    act(() => root.unmount());
    element.remove();
  }
});
