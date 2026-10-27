// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  type BotCreationOperation,
} from '../src/host/bot-creation';

const fixture = vi.hoisted(() => ({
  routeReady: true,
  params: { entry: 'resume' } as Record<string, string>,
  android: false,
  open: vi.fn(),
  screen: vi.fn(),
  create: vi.fn(),
  lookup: vi.fn(async () => null),
  preview: vi.fn(async () => ({
    kind: 'git' as const,
    gitUrl: 'https://github.com/a/b.git',
    commit: 'a'.repeat(40),
  })),
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
    preview: () => fixture.preview(),
    pickZip: async () => ({
      fileId: '12345678-1234-1234-1234-123456789abc',
      fileName: 'Helper.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 30,
    }),
    previewZip: async (_target, source) => ({ source, displayName: 'Archive helper' }),
    lookup: () => fixture.lookup(),
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
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
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
  router: { push: vi.fn(), back: vi.fn(), dismiss: vi.fn() },
  useNavigation: () => ({ goBack: vi.fn() }),
  useIsFocused: () => true,
  useLocalSearchParams: () => fixture.params,
  useFocusEffect: (effect: () => void | (() => void)) => useLayoutEffect(effect, [effect]),
}));
vi.mock('../src/host/native-bot-creation', () => ({
  get botCreation() {
    return controller;
  },
  useBotCreation: () => useSyncExternalStore(controller.subscribe, controller.getSnapshot),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ hosts: fixture.hosts }),
  useHostSessions: () => [],
}));
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
vi.mock('../src/ui/primitives/keyboard-form-footer', () => ({
  KeyboardFormFooter: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/environment-list', () => ({
  EnvironmentList: ({
    options,
    onChange,
  }: {
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'ul',
      null,
      options.map((option) =>
        createElement(
          'button',
          { key: option.value, onClick: () => onChange(option.value) },
          option.label,
        ),
      ),
    ),
}));
vi.mock('../src/ui/primitives/step-bar', () => ({
  StepBar: ({
    primary,
  }: {
    primary: { label: string; onPress(): void; disabled?: boolean; busy?: boolean };
  }) =>
    createElement(
      'button',
      { onClick: primary.onPress, disabled: primary.disabled || primary.busy },
      primary.label,
    ),
}));
vi.mock('../src/ui/shell/navigation-action', () => ({ NavigationAction: () => null }));
vi.mock('../src/ui/shell/creation-avatar', () => ({
  CreationAvatar: ({
    onChange,
  }: {
    onChange(avatar: { kind: 'generated'; seed: string } | { kind: 'photo'; image: string }): void;
  }) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        {
          'data-testid': 'create-bot-avatar-shuffle',
          onClick: () => onChange({ kind: 'generated', seed: 'seed-1' }),
        },
        'shuffle',
      ),
      createElement(
        'button',
        {
          'data-testid': 'create-bot-avatar-photo',
          onClick: () => onChange({ kind: 'photo', image: 'data:image/jpeg;base64,AAAA' }),
        },
        'photo',
      ),
    ),
}));

vi.mock('../src/ui/shell/open-created-bot', () => ({ openCreatedBot: fixture.open }));
import { CreateBotScreen, CreateBotStepScreen } from '../src/ui/shell/create-bot-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let element: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
  fixture.routeReady = true;
  fixture.android = false;
  fixture.params = { entry: 'resume' };
});
function mountStep(flow: string, step: number) {
  fixture.params = { entry: 'resume', flow, step: String(step) };
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  return act(async () => root.render(<CreateBotStepScreen />));
}
const labelled = (name: string) =>
  [...element.querySelectorAll('button')].find((item) => item.textContent === name);

it.each([false, true])(
  'imports from the last step after choosing the Environment first (Android: %s)',
  async (android) => {
    fixture.android = android;
    await controller.another('A');
    await controller.enter({ kind: 'host', hostId: 'A' });
    await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
    element = document.createElement('div');
    document.body.append(element);
    root = createRoot(element);
    await act(async () => root.render(<CreateBotScreen initialSource="git" />));
    await act(async () => labelled('Desktop')!.click());
    await act(async () => root.unmount());
    await mountStep('git', 1);
    expect(
      element.querySelector(`[aria-label="${t.botCreation.gitUrl}"]`)?.getAttribute('value'),
    ).toBe('https://github.com/a/b');
    await act(async () => root.unmount());
    await mountStep('git', 2);
    expect(
      element.querySelector(`[aria-label="${t.botCreation.name}"]`)?.getAttribute('value'),
    ).toBe('My helper');
    await act(async () => root.unmount());
    await mountStep('git', 3);
    expect(element.querySelector(`[aria-label="${t.botCreation.persona}"]`)).toBeNull();
    expect(element.textContent).toContain(t.botCreation.prompt.importDetails);
    expect(labelled(t.botCreation.importShort)!.disabled).toBe(false);
    await act(async () => labelled(t.botCreation.importShort)!.click());
    expect(fixture.create).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'B', input: { displayName: 'My helper' } }),
    );
    expect(labelled(t.botCreation.open)).toBeDefined();
    expect(labelled(t.botCreation.importAnother)).toBeDefined();
  },
);

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
  expect(element.textContent).toContain('Marketplace Bot');
});

it('opens Android blank creation as a back-navigable page with its action pinned below', async () => {
  await controller.another('A');
  await controller.blank();
  fixture.android = true;
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen />));
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(fixture.screen).toHaveBeenLastCalledWith(
    expect.objectContaining({ headerShown: false, presentation: 'card', headerBackVisible: false }),
  );
  expect(element.textContent).toContain(t.botCreation.prompt.environment);
  expect(labelled(t.botCreation.next)).toBeDefined();
});

it('keeps preview failure editable and retries from the same Import action', async () => {
  await controller.another('A');
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
  fixture.preview.mockRejectedValueOnce(new Error('offline'));
  await mountStep('git', 3);
  const button = () => labelled(t.botCreation.importShort)!;
  const creates = fixture.create.mock.calls.length;
  await act(async () => button().click());
  expect(controller.getSnapshot().record.kind).toBe('draft');
  expect(fixture.create).toHaveBeenCalledTimes(creates);
  expect(button().disabled).toBe(false);
  await act(async () => {
    button().click();
    button().click();
  });
  expect(fixture.create).toHaveBeenCalledTimes(creates + 1);
});

it('prefills an empty name from the archive when leaving the Zip step', async () => {
  await controller.another('A');
  await controller.blank();
  await controller.beginZip();
  const draft = controller.getSnapshot().record;
  if (draft.kind !== 'draft') throw new Error('Expected draft');
  await controller.edit({ ...draft.draft, displayName: '' });
  await mountStep('zip', 1);
  expect(element.textContent).toContain('Helper.zip');
  await act(async () => labelled(`${t.botCreation.next}`)!.click());
  await act(async () => root.unmount());
  await mountStep('zip', 2);
  expect(element.querySelector(`[aria-label="${t.botCreation.name}"]`)?.getAttribute('value')).toBe(
    'Archive helper',
  );
  await act(async () => root.unmount());
  await mountStep('zip', 3);
  await act(async () => labelled(t.botCreation.importShort)!.click());
  expect(fixture.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: { displayName: 'Archive helper' },
      source: expect.objectContaining({ kind: 'zip' }),
    }),
  );
});

it('does not submit after leaving while the source check is pending', async () => {
  await controller.another('A');
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
  let finish!: (value: Awaited<ReturnType<typeof fixture.preview>>) => void;
  fixture.preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mountStep('git', 3);
  const creates = fixture.create.mock.calls.length;
  await act(async () => labelled(t.botCreation.importShort)!.click());
  await act(async () => root.render(null));
  await act(async () =>
    finish({ kind: 'git', gitUrl: 'https://github.com/a/b.git', commit: 'a'.repeat(40) }),
  );
  expect(fixture.create).toHaveBeenCalledTimes(creates);
  expect(controller.getSnapshot().record.kind).toBe('draft');
});

it('offers Retry and editing for a saved pre-send failure without claiming an unknown result', async () => {
  await controller.another('A');
  await controller.beginImport({ gitUrl: 'https://github.com/a/b', displayName: 'My helper' });
  await controller.preview();
  fixture.lookup.mockRejectedValueOnce(new BotCreationFailure('gateway/arguments-invalid'));
  await controller.submit();
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'submitted',
    mutationStarted: false,
  });
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateBotScreen initialSource="git" />));
  expect(labelled(t.botCreation.retryShort)).toBeDefined();
  expect(labelled(t.botCreation.edit)).toBeDefined();
  expect(element.textContent).not.toContain(t.botCreation.retry);
  expect(element.textContent).not.toContain(t.botCreation.uncertain);
});
