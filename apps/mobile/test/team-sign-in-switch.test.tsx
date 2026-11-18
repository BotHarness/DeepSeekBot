// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('expo-constants', () => ({ default: { deviceName: 'Test phone' } }));
const router = vi.hoisted(() => ({ dismissTo: vi.fn() }));
const params = vi.hoisted(() => ({ value: { i: 'invite' } as Record<string, string> }));
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => params.value,
}));
const bob = vi.hoisted(() => ({
  hostId: 'h',
  hostName: 'Studio',
  routes: ['https://h.tailnet.ts.net'],
  deviceId: 'device-bob',
  credential: 'member.bob',
  member: {
    humanId: 'bob',
    displayName: 'Bob',
    username: 'bob',
    fingerprint: 'a'.repeat(64),
    mustChangePassword: false,
  },
}));
const session = vi.hoisted(() => ({
  getState: () => ({ hosts: [bob] }),
  pairMember: vi.fn(async (_host: unknown, options?: { confirmedIdentitySwitch?: boolean }) =>
    options?.confirmedIdentitySwitch
      ? { ok: true as const, value: bob }
      : { ok: false as const, code: 'identity-switch-required' as const },
  ),
}));
vi.mock('../src/host/host-session', () => ({ hostSession: session }));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
const revokePairing = vi.hoisted(() => vi.fn(async () => 'revoked' as const));
vi.mock('@botharness/host-client/pairing', () => ({ revokePairing }));
const dialog = vi.hoisted(() => vi.fn());
const signInTeamDevice = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ ok: true, value: bob })),
);
vi.mock('../src/ui/primitives/app-dialog', () => ({ showAppDialog: dialog }));
vi.mock('@botharness/host-client/team-client', () => ({
  parseTeamInvitation: () => ({
    ok: true,
    value: { host: { name: 'Studio' }, username: 'bob' },
  }),
  signInAgainInvitation: (host: { hostName: string; member?: { username: string } }) => ({
    host: { name: host.hostName },
    username: host.member?.username,
  }),
  signInTeamDevice: signInTeamDevice,
  changeTeamDevicePassword: vi.fn(),
}));
const addressInvitation = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
    ok: true as const,
    value: {
      v: 1,
      host: { id: 'other-host', name: 'Studio', fingerprint: 'b'.repeat(64) },
      routes: ['https://studio.example'],
      username: 'dana',
      expiresAt: '2099-01-01T00:00:00Z',
    },
  })),
);
vi.mock('@botharness/host-client/team-sign-in', () => ({ addressInvitation }));
import TeamSignInScreen from '../app/pair/team';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function signIn(element: HTMLElement) {
  const input = element.querySelector<HTMLTextAreaElement>('[data-testid="team-password"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, 'one-time-password');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    element.querySelector<HTMLButtonElement>('[data-testid="team-sign-in"]')!.click(),
  );
}

it('confirms an account switch in the sheet instead of over it, then closes the sheet once', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<TeamSignInScreen />));
    await signIn(element);
    expect(dialog).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
    await act(async () =>
      element.querySelector<HTMLButtonElement>('[data-testid="team-switch-confirm"]')!.click(),
    );
    expect(session.pairMember).toHaveBeenLastCalledWith(bob, { confirmedIdentitySwitch: true });
    expect(router.dismissTo).toHaveBeenCalledOnce();
    expect(revokePairing).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    element.remove();
  }
});

it('revokes the new sign-in when the account switch is cancelled', async () => {
  router.dismissTo.mockClear();
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<TeamSignInScreen />));
    await signIn(element);
    await act(async () =>
      element.querySelector<HTMLButtonElement>('[data-testid="team-switch-cancel"]')!.click(),
    );
    expect(revokePairing).toHaveBeenCalledWith({ host: bob, carrier: {} });
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="team-invitation-link"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    element.remove();
  }
});

it('signs the same member in again from a saved Host without an invitation or a switch prompt', async () => {
  router.dismissTo.mockClear();
  session.pairMember.mockImplementationOnce(async () => ({ ok: true as const, value: bob }));
  params.value = { host: 'h' };
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<TeamSignInScreen />));
    expect(element.querySelector('[data-testid="team-invitation-link"]')).toBeNull();
    expect(element.textContent).toContain('bob');
    await signIn(element);
    expect(element.querySelector('[data-testid="team-switch-confirm"]')).toBeNull();
    expect(router.dismissTo).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    element.remove();
    params.value = { i: 'invite' };
  }
});

it('switches to another member account on a saved Host by username, behind the switch prompt', async () => {
  router.dismissTo.mockClear();
  signInTeamDevice.mockClear();
  params.value = { host: 'h', switch: '1' };
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<TeamSignInScreen />));
    const input = element.querySelector<HTMLTextAreaElement>('[data-testid="team-username"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, ' carol ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await signIn(element);
    expect(signInTeamDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        invitation: expect.objectContaining({ username: 'carol' }),
        password: 'one-time-password',
      }),
    );
    expect(element.querySelector('[data-testid="team-switch-confirm"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    element.remove();
    params.value = { i: 'invite' };
  }
});

it('signs in with a Host address and username after the fingerprint is confirmed', async () => {
  signInTeamDevice.mockClear();
  params.value = {};
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const type = async (id: string, value: string) => {
    const input = element.querySelector<HTMLTextAreaElement>(`[data-testid="${id}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const press = (id: string) =>
    act(async () => element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click());
  try {
    await act(async () => root.render(<TeamSignInScreen />));
    await press('team-use-username');
    await type('team-address', 'studio.example');
    await type('team-username', 'Dana');
    await press('team-address-continue');
    expect(addressInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'https://studio.example', username: 'dana' }),
    );
    expect(element.querySelector('[data-testid="team-fingerprint"]')?.textContent).toBe(
      Array(16).fill('bbbb').join(' '),
    );
    expect(element.querySelector('[data-testid="team-password"]')).toBeNull();
    await press('team-fingerprint-matches');
    await signIn(element);
    expect(signInTeamDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        invitation: expect.objectContaining({
          username: 'dana',
          routes: ['https://studio.example'],
        }),
      }),
    );
  } finally {
    act(() => root.unmount());
    element.remove();
    params.value = { i: 'invite' };
  }
});
