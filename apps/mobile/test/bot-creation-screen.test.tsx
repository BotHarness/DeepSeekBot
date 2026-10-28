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
  params: { entry: 'host', hostId: 'A', slug: 'new-bot', created: '1' } as Record<
    string,
    string | undefined
  >,
  appState: 'active',
  appStateChanged: undefined as undefined | ((value: string) => void),
  replaced: undefined as unknown,
  screen: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  dismiss: vi.fn(),
  close: vi.fn(),
  body: undefined as ReactNode,
  feeds: [] as unknown[],
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
let applied: unknown[];
let avatarFailure: boolean;

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
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('expo-router', () => ({
  Stack: Object.assign(
    ({ children }: { children?: ReactNode }) =>
      createElement('section', { 'data-testid': 'creation-step-stack' }, children ?? fixture.body),
    {
      Screen: ({ options }: { options: unknown }) => {
        fixture.screen(options);
        return null;
      },
    },
  ),
  useNavigation: () => ({ goBack: fixture.close }),
  useIsFocused: () => true,
  useGlobalSearchParams: () => fixture.params,
  usePathname: () => '/create-bot',
  router: {
    back: fixture.back,
    push: fixture.push,
    dismiss: fixture.dismiss,
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
const paired = [
  { hostId: 'A', hostName: 'Laptop', deviceId: 'phone-a' },
  { hostId: 'B', hostName: 'Desktop', deviceId: 'phone-b' },
];
const hosts = [...paired];
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ hosts: [...hosts], saved: hosts[0] }),
  useHostSessions: () => fixture.feeds,
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
    onSubmitEditing,
  }: {
    value: string;
    onChangeText(value: string): void;
    accessibilityLabel: string;
    editable?: boolean;
    onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void;
  }) =>
    createElement('input', {
      value,
      'aria-label': accessibilityLabel,
      disabled: editable === false,
      onInput: (event) => onChangeText(event.currentTarget.value),
      onKeyDown: (event) => {
        if (event.key === 'Enter')
          onSubmitEditing?.({ nativeEvent: { text: event.currentTarget.value } });
      },
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
vi.mock('../src/ui/primitives/environment-list', () => ({
  EnvironmentList: ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: { value: string; label: string; detail: string; disabled: boolean }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'ul',
      null,
      options.map((option) =>
        createElement(
          'button',
          {
            key: option.value,
            'data-testid': `create-bot-host-${option.value}`,
            'aria-pressed': option.value === value,
            disabled: option.disabled,
            onClick: () => onChange(option.value),
          },
          `${option.label} ${option.detail}`,
        ),
      ),
    ),
}));
vi.mock('../src/ui/primitives/step-bar', () => ({
  StepBar: ({
    primary,
    back,
    step,
    note,
    error,
  }: {
    primary: { label: string; testID: string; onPress(): void; disabled?: boolean; busy?: boolean };
    back?: { label: string; testID: string; onPress(): void };
    step?: { index: number; total: number };
    note?: string;
    error?: string;
  }) =>
    createElement(
      'footer',
      null,
      error ? createElement('strong', { role: 'alert' }, error) : null,
      note ? createElement('em', null, note) : null,
      back
        ? createElement('button', { 'data-testid': back.testID, onClick: back.onPress }, back.label)
        : null,
      primary.busy ? createElement('span', { role: 'progressbar' }) : null,
      createElement(
        'button',
        {
          'data-testid': primary.testID,
          onClick: primary.onPress,
          disabled: primary.disabled || primary.busy,
        },
        step ? `${primary.label} · ${step.index}/${step.total}` : primary.label,
      ),
    ),
}));
vi.mock('../src/ui/shell/creation-header', () => ({
  CreationHeader: ({
    onClose,
    name,
    progress,
  }: {
    onClose(): void;
    name: string;
    progress?: number;
  }) =>
    createElement(
      'header',
      { 'data-testid': 'create-bot-header', 'data-name': name },
      createElement('button', { 'data-testid': 'create-bot-close', onClick: onClose }, 'Close'),
      createElement('progress', { 'data-testid': 'create-bot-progress', value: progress, max: 1 }),
    ),
}));
vi.mock('../src/ui/primitives/keyboard-form-frame', () => ({
  KeyboardFormFrame: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', { 'data-testid': 'creation-footer' }, footer),
    ),
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
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

vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/keyboard-form-footer', () => ({
  KeyboardFormFooter: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/design/theme', async () => {
  const { resolveTheme } = await import('../src/ui/design/resolve-theme');
  return { useDesignTheme: () => resolveTheme('light', {}, 'ios') };
});
vi.mock('../src/ui/chat/conversation-screen', () => ({
  ConversationScreen: () => createElement('main', null, 'Conversation'),
}));

import { CreateBotScreen, CreateBotStepScreen } from '../src/ui/shell/create-bot-screen';
import { CreationFlowLayout } from '../src/ui/shell/creation-flow.android';
import DmScreen from '../app/dm/[slug]';
import { t } from '../src/ui/strings';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  fixture.replaced = undefined;
  fixture.appState = 'active';
  fixture.params = { entry: 'host', hostId: 'A' };
  fixture.feeds = [];
  fixture.push.mockClear();
  fixture.back.mockClear();
  fixture.dismiss.mockClear();
  fixture.close.mockClear();
  fixture.body = undefined;
  hosts.splice(0, hosts.length, ...paired);
  disk = undefined;
  operation = undefined;
  canonical = null;
  failure = false;
  creates = 0;
  previewCommit = 'a'.repeat(40);
  previewWait = Promise.resolve();
  createError = undefined;
  applied = [];
  avatarFailure = false;
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
      applyAvatar: async (_operation, receipt, avatar) => {
        applied.push({ channelId: receipt.channelId, avatar });
        if (avatarFailure) throw new BotCreationFailure('unreachable');
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
async function go(flow: string, step: number) {
  fixture.params = { ...fixture.params, flow, step: String(step) };
  await act(async () => root.render(<CreateBotStepScreen key={step} />));
}
async function type(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function button(id: string) {
  return container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
}
async function press(id: string) {
  const target = button(id)!;
  expect(target).not.toBeNull();
  await act(async () => target.click());
}
async function next(flow: string, step: number) {
  await press('create-bot-next');
  expect(fixture.push).toHaveBeenLastCalledWith({
    pathname: '/create-bot-step',
    params: { flow, step: String(step) },
  });
  await go(flow, step);
}
async function named(name: string) {
  await mount();
  await next('blank', 1);
  await type(t.botCreation.name, name);
  await next('blank', 2);
  await next('blank', 3);
}

it('walks Environment, name and persona pages, then opens the new Bot from the last one', async () => {
  await mount();
  expect(container.textContent).toContain(t.botCreation.prompt.environment);
  expect(button('create-bot-host-A')?.getAttribute('aria-pressed')).toBe('true');
  expect(button('create-bot-back')).toBeNull();
  expect(button('create-bot-next')?.textContent).toBe(`${t.botCreation.next} · 1/4`);
  await next('blank', 1);
  expect(button('create-bot-back')).not.toBeNull();
  expect(button('create-bot-next')?.disabled).toBe(true);
  await type(t.botCreation.name, 'New Bot');
  expect(button('create-bot-next')?.textContent).toBe(`${t.botCreation.next} · 2/4`);
  await next('blank', 2);
  expect(container.textContent).toContain(t.botCreation.personaSystemLabel);
  expect(container.querySelector(`input[aria-label="${t.botCreation.bio}"]`)).toBeNull();
  expect(container.querySelector(`input[aria-label="${t.botCreation.tags}"]`)).toBeNull();
  await next('blank', 3);
  expect(container.textContent).toContain(t.botCreation.profileHint);
  expect(container.querySelector(`input[aria-label="${t.botCreation.persona}"]`)).toBeNull();
  expect(button('create-bot-submit')?.textContent).toBe(t.botCreation.createShort);
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

it('keeps persona instructions separate from metadata and retains tag chips across steps', async () => {
  await named('Guide');
  await go('blank', 2);
  await type(t.botCreation.persona, 'Keep answers concise.');
  expect(container.textContent).toContain(t.botCreation.personaSystemHint);
  await next('blank', 3);
  await type(t.botCreation.bio, 'A friendly guide');
  await type(t.botCreation.tags, '旅行');
  const input = container.querySelector<HTMLInputElement>(
    `input[aria-label="${t.botCreation.tags}"]`,
  )!;
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(button('create-bot-tag-0')?.getAttribute('aria-label')).toBe(
    t.botCreation.removeTag('旅行'),
  );
  expect(input.value).toBe('');
  await type(t.botCreation.tags, 'family');
  await press('create-bot-tag-0');
  expect(input.value).toBe('family');
  await go('blank', 2);
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.persona}"]`)
      ?.value,
  ).toBe('Keep answers concise.');
  await next('blank', 3);
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.tags}"]`)?.value,
  ).toBe('family');
  await press('create-bot-submit');
  expect(operation?.input).toMatchObject({
    persona: 'Keep answers concise.',
    description: 'A friendly guide',
    roles: ['family'],
  });
  await act(async () => finish?.());
});

it('goes back one step with the round button and leaves the whole flow from the close button', async () => {
  await mount();
  await next('blank', 1);
  await press('create-bot-back');
  expect(fixture.back).toHaveBeenCalledTimes(1);
  const options = fixture.screen.mock.calls.at(-1)![0] as {
    headerBackVisible: boolean;
    headerShown: boolean;
  };
  expect(options.headerBackVisible).toBe(false);
  await press('create-bot-close');
  expect(fixture.close).toHaveBeenCalledTimes(1);
});

it('shows creation progress in the bar without retry or uncertainty while the request is pending', async () => {
  await named('New Bot');
  await press('create-bot-submit');
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(button('create-bot-submit')?.textContent).toBe(t.botCreation.creatingShort);
  expect(button('create-bot-retry')).toBeNull();
  expect(button('create-bot-back')).toBeNull();
  expect(container.textContent).not.toContain(t.botCreation.uncertain);
  expect(container.querySelector('input')).toBeNull();
  await act(async () => finish?.());
});

it('adds a slow-Environment line after five seconds of waiting', async () => {
  await named('New Bot');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await press('create-bot-submit');
    expect(container.textContent).not.toContain(t.botCreation.slow);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(container.textContent).toContain(t.botCreation.slow);
  } finally {
    vi.useRealTimers();
  }
  await act(async () => finish?.());
  expect(container.textContent).not.toContain(t.botCreation.slow);
});

it('keeps details while changing the Environment and submits the selected one', async () => {
  await mount();
  await press('create-bot-host-B');
  expect(button('create-bot-host-B')?.getAttribute('aria-pressed')).toBe('true');
  await next('blank', 1);
  await type(t.botCreation.name, 'Travel Bot');
  await next('blank', 2);
  await type(t.botCreation.persona, 'Plan accessible trips');
  await next('blank', 3);
  await type(t.botCreation.bio, 'Local guide');
  await type(t.botCreation.tags, 'travel, family');
  await press('create-bot-submit');
  expect(operation?.hostId).toBe('B');
  expect(operation?.input).toMatchObject({
    displayName: 'Travel Bot',
    persona: 'Plan accessible trips',
    description: 'Local guide',
    roles: ['travel', 'family'],
  });
  await act(async () => finish?.());
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'B' },
  });
});

it('preselects nothing from All with two Environments and disables offline ones', async () => {
  fixture.params = { entry: 'all' };
  fixture.feeds = [
    {
      saved: { hostId: 'B' },
      snapshot: { connection: { status: 'unreachable', route: '' } },
      attention: { status: 'idle' },
    },
  ];
  await mount();
  expect(button('create-bot-host-A')?.getAttribute('aria-pressed')).toBe('false');
  expect(button('create-bot-host-B')?.disabled).toBe(true);
  expect(button('create-bot-host-B')?.textContent).toContain(t.hostOffline);
  expect(button('create-bot-next')?.disabled).toBe(true);
  await press('create-bot-host-A');
  expect(button('create-bot-next')?.disabled).toBe(false);
});

it('offers adding an Environment when there is none and selects the new one on return', async () => {
  hosts.splice(0);
  fixture.params = { entry: 'all' };
  await mount();
  expect(container.textContent).toContain(t.botCreation.noEnvironments);
  expect(button('create-bot-next')?.disabled).toBe(true);
  await press('create-bot-pair');
  expect(fixture.push).toHaveBeenLastCalledWith('/pair');
  hosts.push(paired[1]!);
  await mount();
  expect(button('create-bot-host-B')?.getAttribute('aria-pressed')).toBe('true');
  expect(button('create-bot-next')?.disabled).toBe(false);
});

it('recovers a lost response after backgrounding and opens only on explicit request', async () => {
  await named('New Bot');
  failure = true;
  await press('create-bot-submit');
  await act(async () => fixture.appStateChanged?.('background'));
  await act(async () => finish?.());
  expect(fixture.replaced).toBeUndefined();
  await act(async () => fixture.appStateChanged?.('active'));
  expect(fixture.replaced).toBeUndefined();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    t.botCreation.errors.unreachable,
  );
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
  await next('blank', 1);
  await type(t.botCreation.name, 'Draft Bot');
  await next('blank', 2);
  await type(t.botCreation.persona, 'Keep this persona');
  await act(() => root.render(null));
  fixture.params = { entry: 'resume' };
  await mount();
  expect(button('create-bot-host-A')?.getAttribute('aria-pressed')).toBe('true');
  await go('blank', 1);
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.name}"]`)?.value,
  ).toBe('Draft Bot');
  await go('blank', 2);
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.persona}"]`)
      ?.value,
  ).toBe('Keep this persona');
  expect(creates).toBe(0);
});

it('offers explicit opening after successful completion in the background', async () => {
  await named('New Bot');
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

const lastStep = { git: 3, marketplace: 3, zip: 3 } as const;
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
  if (source === 'zip') {
    const record = controller.getSnapshot().record;
    if (record.kind === 'draft') await controller.edit({ ...record.draft, displayName: 'Zip Bot' });
  }
  fixture.params = { entry: 'resume' };
  await go(source, lastStep[source]);
}

it.each(['git', 'marketplace', 'zip'] as const)(
  'uses shared progress and direct DM entry for %s imports',
  async (source) => {
    await importDraft(source);
    await press('create-bot-submit');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(button('create-bot-retry')).toBeNull();
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
    expect(fixture.dismiss).not.toHaveBeenCalled();
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

it('keeps a changed Marketplace revision on its confirm page with refresh and no creation', async () => {
  await importDraft('marketplace');
  expect(container.textContent).toContain('https://github.com/a/b');
  previewCommit = 'b'.repeat(40);
  await press('create-bot-submit');
  expect(controller.getSnapshot().error).toBe('git-source-changed');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(t.marketplace.stale);
  expect(button('import-bot-refresh-listing')).not.toBeNull();
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(creates).toBe(0);
});

it('checks a Git link when leaving its step and keeps a failure there', async () => {
  await controller.ready;
  await controller.enter({ kind: 'host', hostId: 'A' });
  await controller.beginImport({ gitUrl: '' });
  fixture.params = { entry: 'resume' };
  await go('git', 1);
  expect(button('create-bot-next')?.disabled).toBe(true);
  await type(t.botCreation.gitUrl, 'https://github.com/a/b');
  previewWait = Promise.reject(new BotCreationFailure('git-clone-failed'));
  previewWait.catch(() => {});
  await press('create-bot-next');
  expect(fixture.push).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    t.botCreation.errors['git-clone-failed'],
  );
  previewWait = Promise.resolve();
  await next('git', 2);
  expect(
    container.querySelector<HTMLInputElement>(`input[aria-label="${t.botCreation.name}"]`)?.value,
  ).toBe('b');
  await type(t.botCreation.name, 'Repo helper');
  expect(controller.getSnapshot().record).toMatchObject({ draft: { displayName: 'Repo helper' } });
  const record = controller.getSnapshot().record;
  expect(record).toMatchObject({ draft: { source: { preview: { commit: 'a'.repeat(40) } } } });
});

it('shows Zip transfer progress while leaving the file step and does not continue after leaving', async () => {
  await importDraft('zip');
  await go('zip', 1);
  expect(container.textContent).toContain('Helper.zip');
  let releasePreview: (() => void) | undefined;
  previewWait = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  await press('create-bot-next');
  expect(button('create-bot-next')?.disabled).toBe(true);
  expect(button('create-bot-next')?.textContent).toContain(t.botCreation.checkingSource);
  expect(container.textContent).toContain(t.botCreation.zipProgress(15, 30));
  await act(() => root.render(null));
  await act(async () => releasePreview?.());
  expect(fixture.push).not.toHaveBeenCalled();
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
  expect(button('import-bot-zip-restore')).not.toBeNull();
  expect(button('create-bot-host-A')).toBeNull();
  await press('import-bot-zip-restore');
  createError = undefined;
  await press('create-bot-retry');
  expect(operation).toEqual(submitted);
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
});

it.each([
  ['create-bot-avatar-shuffle', { kind: 'generated', seed: 'seed-1' }],
  ['create-bot-avatar-photo', { kind: 'photo', image: 'data:image/jpeg;base64,AAAA' }],
] as const)(
  'keeps the %s avatar in the draft and applies it after creation',
  async (id, avatar) => {
    await mount();
    await next('blank', 1);
    await press(id);
    await type(t.botCreation.name, 'Avatar Bot');
    expect(controller.getSnapshot().record).toMatchObject({ draft: { avatar } });
    expect(disk).toMatchObject({ draft: { avatar } });
    await next('blank', 2);
    await next('blank', 3);
    await press('create-bot-submit');
    expect(disk).toMatchObject({ kind: 'submitted', avatar });
    expect(operation?.input).not.toHaveProperty('avatar');
    await act(async () => finish?.());
    expect(applied).toEqual([{ channelId: 'dm-new-bot', avatar }]);
    expect(disk).not.toHaveProperty('avatar');
    expect(controller.getSnapshot().notice).toBeUndefined();
    expect(fixture.replaced).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'new-bot', hostId: 'A' },
    });
  },
);

it('keeps the created Bot and raises a notice when its avatar cannot be applied', async () => {
  avatarFailure = true;
  await mount();
  await next('blank', 1);
  await press('create-bot-avatar-shuffle');
  await type(t.botCreation.name, 'Avatar Bot');
  await next('blank', 2);
  await next('blank', 3);
  await press('create-bot-submit');
  await act(async () => finish?.());
  expect(applied).toHaveLength(1);
  expect(controller.getSnapshot().receipt?.status).toBe('created');
  expect(controller.getSnapshot().error).toBeUndefined();
  expect(controller.getSnapshot().notice).toBe('avatar-failed');
  expect(fixture.replaced).toEqual({
    pathname: '/dm/[slug]',
    params: { slug: 'new-bot', hostId: 'A' },
  });
  controller.dismissNotice();
  expect(controller.getSnapshot().notice).toBeUndefined();
});

it('applies the exact initial avatar so creating the Bot does not replace its preview', async () => {
  await named('Plain Bot');
  const before = controller.getSnapshot().record;
  if (before.kind !== 'draft') throw Error('Expected draft');
  await press('create-bot-submit');
  await act(async () => finish?.());
  expect(applied).toEqual([{ channelId: 'dm-new-bot', avatar: before.draft.avatar }]);
});

it('keeps the Android identity header and footer mounted while only step content changes', async () => {
  fixture.body = <CreateBotScreen />;
  await act(async () => root.render(<CreationFlowLayout />));
  const header = container.querySelector('[data-testid="create-bot-header"]');
  const footer = container.querySelector('[data-testid="creation-footer"]');
  const progress = container.querySelector<HTMLProgressElement>(
    '[data-testid="create-bot-progress"]',
  )!;
  expect(header).not.toBeNull();
  expect(progress.value).toBe(0);
  await press('create-bot-next');
  fixture.params = { flow: 'blank', step: '1' };
  fixture.body = <CreateBotStepScreen />;
  await act(async () => root.render(<CreationFlowLayout />));
  await type(t.botCreation.name, 'Mira');
  expect(header?.getAttribute('data-name')).toBe('Mira');
  expect(progress.value).toBeCloseTo(1 / 4);
  expect(container.querySelector('[data-testid="create-bot-header"]')).toBe(header);
  expect(container.querySelector('[data-testid="creation-footer"]')).toBe(footer);
  await press('create-bot-next');
  fixture.params = { flow: 'blank', step: '2' };
  fixture.body = <CreateBotStepScreen key="persona" />;
  await act(async () => root.render(<CreationFlowLayout />));
  expect(progress.value).toBeCloseTo(2 / 4);
  expect(container.querySelector('[data-testid="create-bot-header"]')).toBe(header);
  expect(container.querySelector('[data-testid="creation-footer"]')).toBe(footer);
  expect(controller.getSnapshot().record).toMatchObject({
    kind: 'draft',
    draft: { hostId: 'A', displayName: 'Mira' },
  });
  await press('create-bot-next');
  fixture.params = { flow: 'blank', step: '3' };
  fixture.body = <CreateBotStepScreen key="details" />;
  await act(async () => root.render(<CreationFlowLayout />));
  expect(progress.value).toBeCloseTo(3 / 4);
  expect(container.querySelector('[data-testid="create-bot-header"]')).toBe(header);
  expect(container.querySelector('[data-testid="creation-footer"]')).toBe(footer);
  await press('create-bot-back');
  expect(fixture.back).toHaveBeenCalledTimes(1);
  await press('create-bot-close');
  expect(fixture.close).toHaveBeenCalledTimes(1);
});
