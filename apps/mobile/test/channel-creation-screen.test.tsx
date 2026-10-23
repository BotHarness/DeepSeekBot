// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createChannelCreation } from '../src/host/channel-creation';

const fixture = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  switchTo: vi.fn(async () => true),
  fail: false,
}));
const creations: unknown[] = [];
const controller = createChannelCreation({
  key: () => 'channel-ui-test-001',
  storage: { read: async () => undefined, write: async () => {} },
  port: {
    deviceId: () => 'phone',
    candidates: async (hostId) => [
      { slug: 'ada', displayName: `${hostId} Ada` },
      { slug: 'bo', displayName: `${hostId} Bo` },
    ],
    create: async (operation) => {
      creations.push(structuredClone(operation));
      if (fixture.fail) throw new Error('unreachable');
      return 'group-team';
    },
  },
});
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', select: () => undefined },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: fixture.back, push: vi.fn(), replace: fixture.replace },
  useLocalSearchParams: () => ({ entry: 'all' }),
  useFocusEffect: (effect: () => () => void) => {
    effect();
  },
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const Container = ({ children }: { children?: ReactNode }) =>
    createElement('div', null, children);
  const Dialog = Object.assign(
    ({ children, onDismissRequest }: { children?: ReactNode; onDismissRequest(): void }) =>
      createElement(
        'div',
        {
          role: 'dialog',
          onKeyDown: (event) => {
            if (event.key === 'Escape') onDismissRequest();
          },
        },
        children,
      ),
    { Title: Container, Text: Container, DismissButton: Container, ConfirmButton: Container },
  );
  return {
    AlertDialog: Dialog,
    Host: Container,
    RNHostView: Container,
    Text: Container,
    TextButton: ({
      children,
      enabled = true,
      onClick,
    }: {
      children?: ReactNode;
      enabled?: boolean;
      onClick(): void;
    }) => createElement('button', { disabled: !enabled, onClick }, children),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  height: () => ({}),
  fillMaxWidth: () => ({}),
  testID: () => ({}),
}));
vi.mock(
  '../src/ui/primitives/creation-form',
  async () => import('../src/ui/primitives/creation-form.android'),
);
vi.mock('../src/host/native-channel-creation', () => ({
  get channelCreation() {
    return controller;
  },
  useChannelCreation: () => useSyncExternalStore(controller.subscribe, controller.getSnapshot),
}));
vi.mock('../src/host/host-session', () => ({
  hostSession: {
    switchTo: fixture.switchTo,
    getState: () => ({
      hosts: [
        { hostId: 'A', hostName: 'Laptop', deviceId: 'phone' },
        { hostId: 'B', hostName: 'Desktop', deviceId: 'phone' },
      ],
    }),
  },
  useHostSession: () => ({
    hosts: [
      { hostId: 'A', hostName: 'Laptop', deviceId: 'phone' },
      { hostId: 'B', hostName: 'Desktop', deviceId: 'phone' },
    ],
  }),
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { ready: Promise.resolve(), set: vi.fn() },
}));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { look: () => ({}) } }));
vi.mock('../src/ui/design/host-look', () => ({
  shownHostName: (_look: unknown, name: string) => name,
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../src/ui/primitives/text-field', () => ({
  TextField: ({
    value,
    onChangeText,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText(value: string): void;
    accessibilityLabel: string;
  }) =>
    createElement('input', {
      value,
      'aria-label': accessibilityLabel,
      onInput: (event) => onChangeText(event.currentTarget.value),
      readOnly: true,
    }),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({ renderKeyboardFormScroll: () => null }));
import { CreateChannelScreen } from '../src/ui/shell/create-channel-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let element: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

it('uses the Dialog to select Host-scoped Bots, reset on Host change, cancel without creating and retry the same failed submission', async () => {
  await controller.ready;
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateChannelScreen />));
  const button = (label: string) => {
    const match = [...element.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    );
    if (!match) throw new Error(`Missing ${label}`);
    return match;
  };
  expect(element.querySelector('[role="dialog"]')).not.toBeNull();
  expect(button(t.botCreation.create).disabled).toBe(true);
  expect(element.textContent).toContain(t.channelCreation.chooseHost);
  await act(async () => button('Laptop').click());
  await act(async () => button('A Ada').click());
  expect(element.querySelector('[aria-label="A Ada"]')?.getAttribute('aria-checked')).toBe('true');
  const input = element.querySelector('input');
  if (!input) throw new Error('Missing name');
  await act(async () => {
    input.value = 'Design team';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Desktop').click());
  expect(element.querySelector('[aria-label="A Ada"]')).toBeNull();
  expect(element.querySelector('[aria-label="B Ada"]')?.getAttribute('aria-checked')).toBe('false');
  expect(input.value).toBe('Design team');
  await act(async () => button(t.cancel).click());
  expect(fixture.back).toHaveBeenCalledOnce();
  expect(creations).toEqual([]);
  await act(async () => button('B Ada').click());
  await act(async () => button('B Bo').click());
  fixture.fail = true;
  await act(async () => button(t.botCreation.create).click());
  expect(element.textContent).toContain(t.botCreation.uncertain);
  expect(element.textContent).not.toContain('Laptop');
  fixture.fail = false;
  await act(async () => button(t.botCreation.retry).click());
  expect(creations[1]).toEqual(creations[0]);
  expect(creations[0]).toMatchObject({ hostId: 'B', name: 'Design team', members: ['ada', 'bo'] });
  expect(fixture.switchTo).toHaveBeenCalledWith('B');
  expect(fixture.replace).toHaveBeenCalledWith({
    pathname: '/channel/[id]',
    params: { id: 'group-team', hostId: 'B' },
  });
});
