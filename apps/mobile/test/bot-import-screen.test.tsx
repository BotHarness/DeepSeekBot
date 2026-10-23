// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createBotCreationController, type BotCreationOperation } from '../src/host/bot-creation';

const fixture = vi.hoisted(() => ({
  open: vi.fn(),
  create: vi.fn(),
  hosts: [
    { hostId: 'A', hostName: 'Laptop' },
    { hostId: 'B', hostName: 'Desktop' },
  ],
}));
const controller = createBotCreationController({
  key: () => 'screen-import-001',
  storage: { read: async () => undefined, write: async () => {} },
  port: {
    deviceId: () => 'phone',
    preview: async () => ({
      kind: 'git',
      gitUrl: 'https://github.com/a/b.git',
      commit: 'a'.repeat(40),
    }),
    lookup: async () => null,
    create: async (operation: BotCreationOperation) => {
      fixture.create(operation);
      return {
        operationKey: operation.operationKey,
        botSlug: 'imported',
        status: 'created',
        channelId: 'dm-imported',
      };
    },
  },
});
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: vi.fn() },
  useLocalSearchParams: () => ({ entry: 'resume' }),
  useFocusEffect: () => {},
}));
vi.mock('../src/host/native-bot-creation', () => ({
  get botCreation() {
    return controller;
  },
  useBotCreation: () => useSyncExternalStore(controller.subscribe, controller.getSnapshot),
}));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: fixture.hosts }) }));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { look: () => ({}) } }));
vi.mock('../src/ui/design/host-look', () => ({
  shownHostName: (_look: unknown, name: string) => name,
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../src/ui/primitives/text-field', () => ({
  TextField: ({ value, accessibilityLabel }: { value: string; accessibilityLabel: string }) =>
    createElement('input', { value, 'aria-label': accessibilityLabel, readOnly: true }),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/shell/open-created-bot', () => ({ openCreatedBot: fixture.open }));
import { CreateBotScreen } from '../src/ui/shell/create-bot-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let element: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

it('shows source, editable confirmation data and target together, then requires preview before import', async () => {
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen />));
  const button = (name: string) =>
    [...element.querySelectorAll('button')].find((item) => item.textContent === name)!;
  expect(
    element.querySelector(`[aria-label="${t.botCreation.gitUrl}"]`)?.getAttribute('value'),
  ).toBe('https://github.com/a/b');
  expect(element.querySelector(`[aria-label="${t.botCreation.name}"]`)?.getAttribute('value')).toBe(
    'My helper',
  );
  expect(button(t.botCreation.import).disabled).toBe(true);
  await act(async () => button('Desktop').click());
  await act(async () => button(t.botCreation.preview).click());
  expect(button(t.botCreation.import).disabled).toBe(false);
  await act(async () => button(t.botCreation.import).click());
  expect(fixture.create).toHaveBeenCalledWith(
    expect.objectContaining({ hostId: 'B', input: { displayName: 'My helper' } }),
  );
  expect(button(t.botCreation.open)).toBeDefined();
  expect(button(t.botCreation.importAnother)).toBeDefined();
});
