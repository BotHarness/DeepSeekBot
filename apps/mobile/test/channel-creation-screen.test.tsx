// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createChannelCreation, type ChannelCandidate } from '../src/host/channel-creation';

const fixture = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  switchTo: vi.fn(async () => true),
  fail: false,
  header: undefined as undefined | (() => ReactNode),
  screens: [] as { name?: string; options: { title?: string; headerRight?(): ReactNode } }[],
  prevented: [] as boolean[],
  onPrevented: undefined as undefined | ((event: { repeat(): void }) => void),
  dialogs: [] as { title: string; actions: { text: string; onPress?: () => unknown }[] }[],
}));
const creations: unknown[] = [];
const controller = createChannelCreation({
  key: () => 'channel-ui-test-001',
  storage: { read: async () => undefined, write: async () => {} },
  port: {
    deviceId: () => 'phone',
    candidates: async (hostId) => [
      {
        slug: 'ada',
        displayName: `${hostId} Ada`,
        avatarSource: { uri: `https://${hostId.toLowerCase()}.ts.net/avatar/ada`, headers: {} },
      },
      { slug: 'bo', displayName: `${hostId} Bo` },
      ...Array.from({ length: 22 }, (_, index) => ({
        slug: `scroll-${index}`,
        displayName: `${hostId} Scroll ${index}`,
      })),
    ],
    create: async (operation) => {
      creations.push(structuredClone(operation));
      if (fixture.fail) throw new Error('unreachable');
      return 'group-team';
    },
  },
});
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios', select: () => undefined },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({
      name,
      options,
    }: {
      name?: string;
      options: { title?: string; headerRight?(): ReactNode };
    }) => {
      if (name === undefined) fixture.header = options.headerRight;
      else fixture.screens.push({ name, options });
      return null;
    },
  },
  router: { back: fixture.back, push: fixture.push, replace: fixture.replace },
  useLocalSearchParams: () => ({ entry: 'all' }),
  useFocusEffect: (effect: () => () => void) => {
    effect();
  },
  usePreventRemove: (prevent: boolean, callback: (event: { repeat(): void }) => void) => {
    fixture.prevented.push(prevent);
    fixture.onPrevented = callback;
    return () => {};
  },
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showAppDialog: (
    title: string,
    _message: string | undefined,
    actions: { text: string; onPress?: () => unknown }[],
  ) => fixture.dialogs.push({ title, actions }),
}));
vi.mock('../src/ui/primitives/sheet-stack', () => ({
  SheetStack: ({ children }: { children: ReactNode }) =>
    createElement('section', { 'data-testid': 'sheet-stack' }, children),
}));
vi.mock('../src/host/native-channel-creation', () => ({
  get channelCreation() {
    return controller;
  },
  useChannelCreation: () => useSyncExternalStore(controller.subscribe, controller.getSnapshot),
}));
const hosts = [
  { hostId: 'A', hostName: 'Laptop', deviceId: 'phone' },
  { hostId: 'B', hostName: 'Desktop', deviceId: 'phone' },
];
vi.mock('../src/host/host-session', () => ({
  hostSession: { switchTo: fixture.switchTo, getState: () => ({ hosts }) },
  useHostSession: () => ({ hosts }),
  useHostAvailability: () => [
    { hostId: 'A', status: 'online' },
    { hostId: 'B', status: 'offline' },
  ],
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: { ready: Promise.resolve(), set: vi.fn() },
}));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { look: () => ({}) } }));
vi.mock('@botharness/host-client/ui/design/host-look', () => ({
  shownHostName: (_look: unknown, name: string) => name,
}));
vi.mock('../src/ui/chat/sheet', () => ({ SHEET_GROUP: 'raised' }));
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
vi.mock('../src/ui/primitives/settings-row', () => {
  const Container = ({ children }: { children?: ReactNode }) =>
    createElement('div', null, children);
  return {
    SettingsSection: ({ title, children }: { title?: string; children?: ReactNode }) =>
      createElement('fieldset', { 'aria-label': title }, children),
    SettingsGroupItem: Container,
    SettingsHeading: ({ children }: { children: string }) => createElement('h2', null, children),
    SettingsFooter: ({ children }: { children: string }) => createElement('p', null, children),
    SettingsRow: ({
      title,
      detail,
      control,
      selected,
      testID,
      leading,
      onPress,
    }: {
      title: string;
      detail?: string;
      control?: { kind: string; text?: string };
      selected?: boolean;
      testID?: string;
      leading?: ReactNode;
      onPress?: () => void;
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          disabled: onPress === undefined,
          'aria-label': title,
          'aria-checked': selected,
          'data-testid': testID,
        },
        leading,
        title,
        detail,
        control?.text,
      ),
  };
});
vi.mock('../src/ui/primitives/chip', () => ({
  Chip: ({ label, testID, onPress }: { label: string; testID: string; onPress(): void }) =>
    createElement('button', { onClick: onPress, 'data-testid': testID }, label),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/sheet-save-button', () => ({
  SheetSaveButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress(): void;
    disabled: boolean;
  }) => createElement('button', { onClick: onPress, disabled, 'data-testid': 'save' }, label),
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotPortrait: ({ bot }: { bot: ChannelCandidate }) =>
    createElement('img', { alt: '', 'data-bot': bot.slug, src: bot.avatarSource?.uri }),
}));
import { CreateChannelLayout, CreateChannelScreen } from '../src/ui/shell/create-channel-screen';
import { CreateChannelMembersScreen } from '../src/ui/shell/create-channel-members-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let element: HTMLDivElement;
let header: Root;
let headerElement: HTMLDivElement;
let members: Root;
let membersElement: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  act(() => header?.unmount());
  act(() => members?.unmount());
  element?.remove();
  headerElement?.remove();
  membersElement?.remove();
});

function mountRoots() {
  element = document.createElement('div');
  headerElement = document.createElement('div');
  membersElement = document.createElement('div');
  document.body.append(element, headerElement, membersElement);
  root = createRoot(element);
  header = createRoot(headerElement);
  members = createRoot(membersElement);
}
function button(label: string, scope: HTMLElement = element) {
  const match = [...scope.querySelectorAll('button')].find(
    (button) => button.textContent === label || button.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`Missing ${label}`);
  return match;
}
const member = (label: string) => button(label, membersElement);
async function showMembers(visible: boolean) {
  await act(async () => members.render(visible ? <CreateChannelMembersScreen /> : <></>));
}
async function save() {
  await act(async () => header.render(<>{fixture.header?.()}</>));
  return headerElement.querySelector<HTMLButtonElement>('[data-testid="save"]')!;
}

it('chooses an Environment, a name and several Bots in the sheet and opens the new Group', async () => {
  await controller.ready;
  mountRoots();
  await act(async () => root.render(<CreateChannelScreen />));
  expect((await save()).disabled).toBe(true);
  expect((await save()).textContent).toBe(t.channelCreation.create);
  expect(element.textContent).toContain(t.channelCreation.chooseHost);
  expect(button(`Laptop`).textContent).toContain(t.hostOnline);
  await act(async () => button('Laptop').click());
  await act(async () => button(t.channelCreation.chooseBots).click());
  expect(fixture.push).toHaveBeenLastCalledWith('/create-channel/members');
  await showMembers(true);
  expect(membersElement.querySelector('img[data-bot="ada"]')?.getAttribute('src')).toBe(
    'https://a.ts.net/avatar/ada',
  );
  expect(membersElement.textContent).toContain('A Scroll 21');
  await act(async () => member('A Ada').click());
  await act(async () => member('A Bo').click());
  expect(member('A Ada').getAttribute('aria-checked')).toBe('true');
  expect(membersElement.textContent).toContain(t.channelCreation.selected(2));
  expect(controller.getSnapshot().record.members).toEqual(['ada', 'bo']);
  await showMembers(false);
  expect(element.textContent).toContain(t.channelCreation.selected(2));
  expect(element.querySelector('[data-testid="create-channel-chip-ada"]')?.textContent).toBe(
    'A Ada',
  );
  await act(async () =>
    element.querySelector<HTMLButtonElement>('[data-testid="create-channel-chip-ada"]')!.click(),
  );
  expect(controller.getSnapshot().record.members).toEqual(['bo']);
  const input = element.querySelector('input');
  if (!input) throw new Error('Missing name');
  await act(async () => {
    input.value = 'Design team';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Desktop').click());
  expect(controller.getSnapshot().record.members).toEqual([]);
  expect(element.textContent).toContain(t.channelCreation.reset);
  expect(input.value).toBe('Design team');
  await showMembers(true);
  expect(member('B Ada').getAttribute('aria-checked')).toBe('false');
  await act(async () => member('B Ada').click());
  await act(async () => member('B Bo').click());
  await act(async () => member('B Scroll 3').click());
  await showMembers(false);
  expect(creations).toEqual([]);
  fixture.fail = true;
  const pending = await save();
  await act(async () => pending.click());
  expect(element.textContent).toContain(t.botCreation.uncertain);
  expect((await save()).textContent).toBe(t.botCreation.retry);
  fixture.fail = false;
  const retry = await save();
  await act(async () => retry.click());
  expect(creations[1]).toEqual(creations[0]);
  expect(creations[0]).toMatchObject({
    hostId: 'B',
    name: 'Design team',
    members: ['ada', 'bo', 'scroll-3'],
  });
  expect(fixture.switchTo).toHaveBeenCalledWith('B');
  expect(fixture.replace).toHaveBeenCalledWith({
    pathname: '/channel/[id]',
    params: { id: 'group-team', hostId: 'B' },
  });
});

it('presents New Group as a sheet stack and asks before discarding a started draft', async () => {
  await controller.reset();
  mountRoots();
  await act(async () => root.render(<CreateChannelLayout />));
  expect(fixture.screens.map((screen) => [screen.name, screen.options.title])).toEqual([
    ['index', t.chatsCreate.group],
    ['members', t.channelCreation.members],
  ]);
  expect(fixture.prevented.at(-1)).toBe(false);
  await act(async () => controller.rename('Launch'));
  expect(fixture.prevented.at(-1)).toBe(true);
  const kept = vi.fn();
  await act(async () => fixture.onPrevented?.({ repeat: kept }));
  expect(fixture.dialogs.at(-1)?.actions.map((action) => action.text)).toEqual([
    t.creationDraft.discard,
    t.creationDraft.keep,
    t.creationDraft.edit,
  ]);
  await act(async () =>
    fixture.dialogs
      .at(-1)
      ?.actions.find((action) => action.text === t.creationDraft.edit)
      ?.onPress?.(),
  );
  expect(kept).not.toHaveBeenCalled();
  expect(fixture.prevented.at(-1)).toBe(true);
  const discarded = vi.fn();
  await act(async () => fixture.onPrevented?.({ repeat: discarded }));
  await act(async () =>
    fixture.dialogs
      .at(-1)
      ?.actions.find((action) => action.text === t.creationDraft.discard)
      ?.onPress?.(),
  );
  expect(discarded).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().record).toEqual({
    kind: 'draft',
    hostId: '',
    name: '',
    members: [],
  });
});
