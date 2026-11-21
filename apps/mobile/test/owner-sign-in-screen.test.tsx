// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  filter: vi.fn(),
  closeWorkspace: vi.fn(),
  signIn: vi.fn<typeof import('../src/host/host-session').hostSession.signInOwner>(),
}));
vi.mock('expo-router', () => ({ useRouter: () => actions, useFocusEffect: () => {} }));
vi.mock('expo-constants', () => ({ default: { deviceName: 'Test phone' } }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/host/host-session', () => ({ hostSession: { signInOwner: actions.signIn } }));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { set: actions.filter },
}));
vi.mock('../src/ui/shell/workspace-paging', () => ({
  closeWorkspacePageWhenShown: actions.closeWorkspace,
}));

import OwnerSignInScreen from '../app/pair/owner';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});

async function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<OwnerSignInScreen />));
  return host;
}

async function fill(element: ParentNode, name: string, value: string) {
  const field = element.querySelector(`[data-testid="owner-sign-in-${name}"]`);
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('Missing field ' + name);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Input setter unavailable');
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return field;
}

async function submit(element: ParentNode) {
  const button = element.querySelector('[data-testid="owner-sign-in-submit"]');
  if (!(button instanceof HTMLElement)) throw new Error('Missing Owner sign-in button');
  await act(async () => button.click());
}

it('rejects an HTTP address before calling the Host session', async () => {
  const screen = await render();
  await fill(screen, 'address', 'http://host.example');
  await fill(screen, 'username', 'owner');
  await fill(screen, 'password', 'test-password');
  await submit(screen);
  expect(screen.querySelector('[role="alert"]')?.textContent).toBe(
    t.teamSignIn.errors['insecure-transport'],
  );
  expect(actions.signIn).not.toHaveBeenCalled();
});

it('clears the password on refusal, then selects the target Feed on retry', async () => {
  const screen = await render();
  const target = {
    hostId: 'target',
    hostName: 'Target Host',
    routes: ['https://host.example'],
    deviceId: 'test-device',
    credential: 'test-grant',
  };
  actions.signIn.mockResolvedValueOnce({ ok: false, code: 'credentials-invalid' });
  actions.signIn.mockResolvedValueOnce({ ok: true, value: target });
  const address = await fill(screen, 'address', 'host.example');
  const username = await fill(screen, 'username', 'owner');
  const password = await fill(screen, 'password', 'incorrect');
  await submit(screen);
  expect(screen.querySelector('[role="alert"]')?.textContent).toBe(
    t.ownerSignIn.credentialsInvalid,
  );
  expect([address.value, username.value, password.value]).toEqual(['host.example', 'owner', '']);
  await fill(screen, 'password', 'correct');
  await submit(screen);
  expect(actions.signIn).toHaveBeenLastCalledWith({
    route: 'https://host.example',
    username: 'owner',
    password: 'correct',
    deviceName: 'Test phone',
    signal: expect.any(AbortSignal),
  });
  expect(actions.filter).toHaveBeenCalledExactlyOnceWith(computerEnvironmentKey('target'));
  expect(actions.dismissTo).toHaveBeenCalledExactlyOnceWith('/');
});
