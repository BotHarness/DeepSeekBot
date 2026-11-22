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
const router = vi.hoisted(() => ({ dismissTo: vi.fn(), back: vi.fn() }));
const params = vi.hoisted(() => ({ value: { i: 'invite' } as Record<string, string> }));
vi.mock('expo-router', async () => {
  const { useState } = await import('react');
  return {
    useRouter: () => router,
    useLocalSearchParams: () => params.value,
    useFocusEffect: (focus: () => void) => {
      useState(() => queueMicrotask(focus));
    },
  };
});
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
  signInPassword: vi.fn(),
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
const discovery = vi.hoisted(() => ({
  route: 'https://studio.example',
  host: { id: 'other-host', name: 'Studio', fingerprint: 'b'.repeat(64) },
  publicKey: 'c'.repeat(64),
  signIn: { password: true } as { password: boolean } | undefined,
}));
const discoverHostAddress = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ ok: true as const, value: discovery })),
);
vi.mock('@botharness/host-client/password-sign-in', () => ({ discoverHostAddress }));
const landing = vi.hoisted(() => ({ filter: vi.fn(), closePage: vi.fn(() => true) }));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { set: landing.filter },
}));
vi.mock('../src/ui/shell/workspace-paging', () => ({
  closeWorkspacePageWhenShown: landing.closePage,
}));
const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async (_text: string) => true) }));
vi.mock('expo-clipboard', () => clipboard);
import TeamSignInScreen from '../app/pair/team';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { t } from '../src/ui/strings';
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
    expect(landing.filter).toHaveBeenCalledWith(computerEnvironmentKey('h'));
    expect(landing.closePage).toHaveBeenCalledOnce();
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

async function renderAddress(address: string) {
  params.value = { address };
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
  await act(async () => root.render(<TeamSignInScreen />));
  const close = () => {
    act(() => root.unmount());
    element.remove();
    params.value = { i: 'invite' };
  };
  return { element, type, press, close };
}

it('shows the Host fingerprint beside one username and password form for an address', async () => {
  router.dismissTo.mockClear();
  session.signInPassword.mockResolvedValueOnce({
    ok: true,
    value: { ...bob, hostId: 'other-host', member: undefined, role: 'owner' },
  });
  const { element, type, press, close } = await renderAddress('studio.example');
  try {
    expect(discoverHostAddress).toHaveBeenLastCalledWith(
      expect.objectContaining({ input: 'studio.example' }),
    );
    const rows = element.querySelector('[data-testid="team-fingerprint-rows"]')!;
    expect(Array.from(rows.children, (row) => row.textContent)).toEqual(
      Array(4).fill('bbbb bbbb bbbb bbbb'),
    );
    await press('team-fingerprint');
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(Array(16).fill('bbbb').join(' '));
    await type('team-username', 'Dana');
    await type('team-password', 'owner-password');
    await press('team-sign-in');
    expect(session.signInPassword).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: 'https://studio.example',
        username: 'Dana',
        password: 'owner-password',
      }),
    );
    expect(session.pairMember).not.toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'other-host' }),
      undefined,
    );
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  } finally {
    close();
  }
});

it('continues a member to the password change after address sign-in', async () => {
  session.signInPassword.mockResolvedValueOnce({
    ok: true,
    value: {
      ...bob,
      hostId: 'other-host',
      member: { ...bob.member, mustChangePassword: true },
      role: 'member',
    },
  });
  const { element, type, press, close } = await renderAddress('https://studio.example');
  try {
    await type('team-username', 'bob');
    await type('team-password', 'one-time-password');
    await press('team-sign-in');
    expect(element.querySelector('[data-testid="team-new-password"]')).not.toBeNull();
  } finally {
    close();
  }
});

it('sends a Host without password sign-in back to the scanner before asking for a password', async () => {
  router.back.mockClear();
  discovery.signIn = { password: false };
  const { element, press, close } = await renderAddress('studio.example');
  try {
    expect(element.querySelector('[data-testid="team-password"]')).toBeNull();
    expect(element.textContent).toContain(t.teamSignIn.needsCode);
    await press('team-scan-code');
    expect(router.back).toHaveBeenCalledOnce();
  } finally {
    discovery.signIn = { password: true };
    close();
  }
});

it('explains a refused address and keeps it for correction', async () => {
  discoverHostAddress.mockResolvedValueOnce({
    ok: false,
    code: 'insecure-transport',
  } as never);
  const { element, close } = await renderAddress('http://studio.example');
  try {
    expect(element.textContent).toContain(t.teamSignIn.errors['insecure-transport']);
    expect(element.querySelector<HTMLTextAreaElement>('[data-testid="team-address"]')?.value).toBe(
      'http://studio.example',
    );
  } finally {
    close();
  }
});
