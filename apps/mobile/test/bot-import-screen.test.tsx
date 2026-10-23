// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createBotCreationController, type BotCreationOperation } from '../src/host/bot-creation';

const fixture = vi.hoisted(() => ({
  routeReady: true,
  android: false,
  open: vi.fn(),
  screen: vi.fn(),
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
vi.mock('../src/ui/primitives/sheet-content', () => ({
  useSheetContent: () => ({ ready: fixture.routeReady, mount: undefined }),
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return fixture.android ? 'android' : 'web';
    },
    select: () => undefined,
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      fixture.screen(options);
      return null;
    },
  },
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
vi.mock('../src/ui/primitives/creation-field', () => ({
  CreationField: ({ value, accessibilityLabel }: { value: string; accessibilityLabel: string }) =>
    createElement('input', { value, 'aria-label': accessibilityLabel, readOnly: true }),
}));
vi.mock('../src/ui/primitives/creation-button', () => ({
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
  fixture.routeReady = true;
  fixture.android = false;
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

it('does not enter the creation flow before the native route is presented', async () => {
  fixture.routeReady = false;
  const enter = vi.spyOn(controller, 'enter');
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen initialSource="zip" />));
  expect(element.textContent).toBe('');
  expect(enter).not.toHaveBeenCalled();
  fixture.routeReady = true;
  await act(async () => root.render(<CreateBotScreen initialSource="zip" />));
  expect(element.textContent).not.toBe('');
  enter.mockRestore();
});

it('keeps Marketplace progress in its existing page when reopening a submitted import on Android', async () => {
  await controller.another('A');
  await controller.beginImport({
    gitUrl: 'https://github.com/a/b',
    displayName: 'Marketplace Bot',
    origin: 'marketplace',
    listingId: 'sample',
    expectedCommit: 'a'.repeat(40),
  });
  await controller.preview();
  await controller.submit();
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'submitted',
    operation: { source: { origin: 'marketplace' } },
  });
  fixture.android = true;
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen initialSource="git" />));
  expect(element.querySelector('[role="dialog"]')).toBeNull();
});

it('opens Android blank creation as a back-navigable page with its action inside the form', async () => {
  await controller.another('A');
  await controller.blank();
  fixture.android = true;
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen />));
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(fixture.screen).toHaveBeenLastCalledWith(
    expect.objectContaining({ headerShown: true, presentation: 'card' }),
  );
  expect(element.querySelector(`[aria-label="${t.botCreation.name}"]`)).not.toBeNull();
  expect(
    [...element.querySelectorAll('button')].find(
      (button) => button.textContent === t.botCreation.create,
    ),
  ).toBeDefined();
});
