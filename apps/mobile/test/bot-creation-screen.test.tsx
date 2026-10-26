// @vitest-environment jsdom
import { act, createElement, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BotCreationFailure,
  createBotCreationController,
  type BotCreationOperation,
  type CreationReceipt,
  type CreationRecord,
} from '../src/host/bot-creation';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fixture = vi.hoisted(() => ({
  params: { entry: 'host', hostId: 'A', slug: 'new-bot', created: '1' },
  appState: 'active',
  appStateChanged: undefined as undefined | ((value: string) => void),
  replaced: undefined as unknown,
  screen: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}));
let controller: ReturnType<typeof createBotCreationController>;
let disk: CreationRecord | undefined;
let operation: BotCreationOperation | undefined;
let canonical: CreationReceipt | null;
let finish: (() => void) | undefined;
let failure: boolean;
let creates: number;
let previewCommit: string;
let previewWait: Promise<void>;
let createError: string | undefined;
let gate: Promise<void>;

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  AppState: {
    get currentState() {
      return fixture.appState;
    },
    addEventListener: (_type: string, callback: (value: string) => void) => {
      fixture.appStateChanged = callback;
      return {
        remove: () => {
          fixture.appStateChanged = undefined;
        },
      };
    },
  },
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      fixture.screen(options);
      return null;
    },
  },
  router: {
    back: fixture.back,
    push: fixture.push,
    replace: (route: unknown) => {
      fixture.replaced = route;
    },
  },
  useLocalSearchParams: () => fixture.params,
  useFocusEffect: (callback: () => () => void) => {
    useSyncExternalStore(
      useCallback(() => callback(), [callback]),
      () => true,
    );
  },
}));
vi.mock('../src/host/native-bot-creation', () => ({
  get botCreation() {
    return controller;
  },
  useBotCreation: () => useSyncExternalStore(controller.subscribe, controller.getSnapshot),
}));
const hosts = [
  { hostId: 'A', hostName: 'Laptop', deviceId: 'phone-a' },
  { hostId: 'B', hostName: 'Desktop', deviceId: 'phone-b' },
];
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ hosts, saved: hosts[0] }),
  hostSession: { getState: () => ({ hosts }), switchTo: async () => true },
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { ready: Promise.resolve(), set: () => {} },
}));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { look: () => ({}) } }));
vi.mock('../src/ui/design/host-look', () => ({
  shownHostName: (_look: unknown, name: string) => name,
}));
vi.mock('../src/ui/primitives/sheet-content', () => ({
  useSheetContent: () => ({ ready: true, mount: () => {} }),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children, accessibilityRole }: { children?: ReactNode; accessibilityRole?: string }) =>
    createElement('span', { role: accessibilityRole }, children),
}));
vi.mock('../src/ui/primitives/creation-field', () => ({
  CreationField: ({
    value,
    onChangeText,
    accessibilityLabel,
    editable,
  }: {
    value: string;
    onChangeText(value: string): void;
    accessibilityLabel: string;
    editable?: boolean;
  }) =>
    createElement('input', {
      value,
      'aria-label': accessibilityLabel,
      disabled: editable === false,
      onInput: (event) => onChangeText(event.currentTarget.value),
      readOnly: true,
    }),
}));
function Button({
  label,
  onPress,
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  return createElement(
    'button',
    { onClick: onPress, disabled: disabled || busy, 'data-testid': testID },
    label,
  );
}
vi.mock('../src/ui/primitives/creation-button', () => ({ Button }));
vi.mock('../src/ui/primitives/button', () => ({ Button }));
vi.mock('../src/ui/primitives/environment-picker', () => ({
  EnvironmentPicker: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(event.currentTarget.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => resolveTheme('light', {}, 'ios') };
});
vi.mock('../src/ui/chat/conversation-screen', () => ({
  ConversationScreen: () => createElement('main', null, 'Conversation'),
}));

import { CreateBotScreen } from '../src/ui/shell/create-bot-screen';
import DmScreen from '../app/dm/[slug]';
import { t } from '../src/ui/strings';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  fixture.replaced = undefined;
  fixture.appState = 'active';
  fixture.params.entry = 'host';
  fixture.params.hostId = 'A';
  disk = undefined;
  operation = undefined;
  canonical = null;
  failure = false;
  creates = 0;
  previewCommit = 'a'.repeat(40);
  previewWait = Promise.resolve();
  createError = undefined;
  gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  controller = createBotCreationController({
    key: () => 'creation-screen-operation',
    storage: {
      read: async () => disk,
      write: async (record) => {
        disk = structuredClone(record);
      },
    },
    port: {
      deviceId: (id) => hosts.find((host) => host.hostId === id)?.deviceId,
      lookup: async () => canonical,
      preview: async (_target, gitUrl) => {
        await previewWait;
        return { kind: 'git', gitUrl, commit: previewCommit };
      },
      pickZip: async () => ({
        fileId: '12345678-1234-1234-1234-123456789abc',
        fileName: 'Helper.zip',
        sha256: 'a'.repeat(64),
        sizeBytes: 30,
      }),
      previewZip: async (_target, source, progress) => {
        progress(15, 30);
        await previewWait;
        return { source, displayName: 'Archive helper' };
      },
      create: async (submitted) => {
        creates += 1;
        operation = submitted;
        await gate;
        if (createError) throw new BotCreationFailure(createError);
        canonical = {
          operationKey: submitted.operationKey,
          status: 'created',
          botSlug: 'new-bot',
          channelId: 'dm-new-bot',
        };
        if (failure) throw new BotCreationFailure('unreachable');
        return canonical;
      },
    },
  });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
});
async function mount() {
  await act(async () => root.render(<CreateBotScreen />));
}
async function type(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function press(id: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  expect(button).not.toBeNull();
  await act(async () => button.click());
}

it('opens a new Bot directly into the normal DM without extra model-hint chrome', async () => {
  await mount();
  await type(t.botCreation.name, 'New Bot');
  await press('create-bot-submit');
  await act(async () => finish?.());
  expect(canonical?.status).toBe('created');
  expect(operation?.input.displayName).toBe('New Bot');
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
  await act(() => root.render(<DmScreen />));
  expect(container.textContent).toBe('Conversation');
});

it('shows creation progress without retry or uncertainty while the original request is pending', async () => {
  await mount();
  await type(t.botCreation.name, 'New Bot');
  await press('create-bot-submit');
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="create-bot-retry"]')).toBeNull();
  expect(container.textContent).not.toContain(t.botCreation.uncertain);
  expect(container.querySelector('input')).toBeNull();
  await act(async () => finish?.());
});

it('keeps optional details while changing the destination and submits the selected Host', async () => {
  await mount();
  expect(container.textContent).not.toContain(t.botCreation.model);
  await type(t.botCreation.name, 'Travel Bot');
  await type(t.botCreation.persona, 'Plan accessible trips');
  const nameInput = container.querySelector<HTMLInputElement>(
    `input[aria-label="${t.botCreation.name}"]`,
  )!;
  nameInput.focus();
  nameInput.setSelectionRange(2, 6);
  await press('create-bot-details');
  await type(t.botCreation.bio, 'Local guide');
  await type(t.botCreation.tags, 'travel, family');
  const target = container.querySelector('select')!;
  await act(async () => {
    target.value = 'B';
    target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await press('create-bot-details');
  await press('create-bot-details');
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.bio}"]`)?.value,
  ).toBe('Local guide');
  expect(container.querySelector(`input[aria-label="${t.botCreation.name}"]`)).toBe(nameInput);
  expect(nameInput.value).toBe('Travel Bot');
  expect(nameInput.selectionStart).toBe(2);
  expect(nameInput.selectionEnd).toBe(6);
  await press('create-bot-submit');
  expect(operation?.hostId).toBe('B');
  expect(operation?.input).toMatchObject({
    displayName: 'Travel Bot',
    persona: 'Plan accessible trips',
    description: 'Local guide',
    roles: ['travel', 'family'],
  });
  expect(container.querySelector('select')).toBeNull();
  await act(async () => finish?.());
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'B' },
  });
});

it('recovers a lost response after backgrounding and opens only on explicit request', async () => {
  await mount();
  await type(t.botCreation.name, 'New Bot');
  failure = true;
  await press('create-bot-submit');
  await act(async () => fixture.appStateChanged?.('background'));
  await act(async () => finish?.());
  expect(fixture.replaced).toBeUndefined();
  await act(async () => fixture.appStateChanged?.('active'));
  expect(fixture.replaced).toBeUndefined();
  await press('create-bot-retry');
  expect(controller.getSnapshot().receipt?.status).toBe('created');
  expect(operation?.operationKey).toBe('creation-screen-operation');
  expect(creates).toBe(1);
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
});

it('retains a draft when leaving and returning to the creation journey', async () => {
  await mount();
  await type(t.botCreation.name, 'Draft Bot');
  await type(t.botCreation.persona, 'Keep this persona');
  await act(() => root.render(null));
  fixture.params.entry = 'resume';
  await mount();
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.name}"]`)?.value,
  ).toBe('Draft Bot');
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.persona}"]`)
      ?.value,
  ).toBe('Keep this persona');
  expect(creates).toBe(0);
});

it('offers explicit opening after successful completion in the background', async () => {
  await mount();
  await type(t.botCreation.name, 'New Bot');
  await press('create-bot-submit');
  await act(async () => fixture.appStateChanged?.('background'));
  await act(async () => finish?.());
  await act(async () => fixture.appStateChanged?.('active'));
  expect(fixture.replaced).toBeUndefined();
  await press('create-bot-open');
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
  expect(creates).toBe(1);
});

async function importDraft(source: 'git' | 'marketplace' | 'zip') {
  await controller.ready;
  await controller.enter({ kind: 'host', hostId: 'A' });
  if (source === 'zip') await controller.beginZip();
  else
    await controller.beginImport({
      gitUrl: 'https://github.com/a/b',
      displayName: 'Imported Bot',
      ...(source === 'marketplace'
        ? ({ origin: 'marketplace', listingId: 'sample', expectedCommit: 'a'.repeat(40) } as const)
        : {}),
    });
  fixture.params.entry = 'resume';
  await mount();
}

it.each(['git', 'marketplace', 'zip'] as const)(
  'uses shared progress and direct DM entry for %s imports',
  async (source) => {
    await importDraft(source);
    await press('create-bot-submit');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="create-bot-retry"]')).toBeNull();
    expect(container.textContent).not.toContain(t.botCreation.uncertain);
    expect(fixture.screen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title:
          source === 'marketplace'
            ? t.botCreation.importTitle
            : source === 'zip'
              ? t.botCreation.fromZip
              : t.botCreation.fromGit,
      }),
    );
    expect(operation?.source).toMatchObject(
      source === 'zip'
        ? { kind: 'zip', sha256: 'a'.repeat(64), sizeBytes: 30 }
        : {
            kind: 'git',
            commit: 'a'.repeat(40),
            ...(source === 'marketplace' ? { origin: 'marketplace', listingId: 'sample' } : {}),
          },
    );
    await act(async () => finish?.());
    expect(fixture.replaced).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'new-bot', hostId: 'A' },
    });
    expect(creates).toBe(1);
  },
);

it.each(['git', 'marketplace', 'zip'] as const)(
  'recovers the same %s operation after a lost response without stealing navigation',
  async (source) => {
    await importDraft(source);
    failure = true;
    await press('create-bot-submit');
    const accepted = structuredClone(operation);
    await act(async () => fixture.appStateChanged?.('background'));
    await act(async () => finish?.());
    expect(fixture.replaced).toBeUndefined();
    await act(async () => fixture.appStateChanged?.('active'));
    await press('create-bot-retry');
    expect(operation).toEqual(accepted);
    expect(creates).toBe(1);
    expect(controller.getSnapshot().receipt).toEqual(canonical);
    expect(fixture.replaced).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'new-bot', hostId: 'A' },
    });
  },
);

it('keeps a changed Marketplace revision editable with its refresh action and no creation', async () => {
  await importDraft('marketplace');
  previewCommit = 'b'.repeat(40);
  await press('create-bot-submit');
  expect(controller.getSnapshot().error).toBe('git-source-changed');
  expect(container.textContent).toContain(t.marketplace.stale);
  expect(container.querySelector('[data-testid="import-bot-refresh-listing"]')).not.toBeNull();
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(creates).toBe(0);
});

it('shows Zip transfer progress and does not create after leaving during source validation', async () => {
  await importDraft('zip');
  let releasePreview: (() => void) | undefined;
  previewWait = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  await press('create-bot-submit');
  expect(
    container.querySelector<HTMLButtonElement>('[data-testid="create-bot-submit"]')?.disabled,
  ).toBe(true);
  expect(container.textContent).toContain(t.botCreation.zipProgress(15, 30));
  expect(container.textContent).toContain(t.botCreation.checkingSource);
  await act(() => root.render(null));
  await act(async () => releasePreview?.());
  expect(creates).toBe(0);
  expect(controller.getSnapshot().record.kind).toBe('draft');
});

it('restores a missing archive through the existing owner and retries the pinned operation', async () => {
  await importDraft('zip');
  createError = 'zip-file-missing';
  await press('create-bot-submit');
  const submitted = structuredClone(operation);
  await act(async () => finish?.());
  expect(controller.getSnapshot().error).toBe('zip-file-missing');
  expect(container.querySelector('[data-testid="import-bot-zip-restore"]')).not.toBeNull();
  expect(container.querySelector('select')).toBeNull();
  await press('import-bot-zip-restore');
  createError = undefined;
  await press('create-bot-retry');
  expect(operation).toEqual(submitted);
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
});
