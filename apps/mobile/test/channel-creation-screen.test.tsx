// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { BotPickerSheetProps } from '../src/ui/chat/bot-picker-sheet';
import { createChannelCreation, type ChannelCandidate } from '../src/host/channel-creation';

const fixture = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  switchTo: vi.fn(async () => true),
  fail: false,
  screen: vi.fn(),
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
  Platform: { OS: 'android', select: () => undefined },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: { headerRight?(): ReactNode } }) => {
      fixture.screen(options);
      return options.headerRight?.() ?? null;
    },
  },
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
vi.mock('../src/ui/primitives/creation-field', () => ({
  CreationField: ({
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
vi.mock('../src/ui/primitives/creation-button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
  SettingsRow: ({ title, detail, onPress }: { title: string; detail: string; onPress(): void }) =>
    createElement('button', { onClick: onPress, 'aria-label': title }, title, detail),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/creation-confirm', () => ({
  CreationConfirm: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress(): void;
    disabled: boolean;
  }) => createElement('button', { onClick: onPress, disabled }, label),
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotPortrait: ({ bot }: { bot: ChannelCandidate }) =>
    createElement('img', { alt: '', 'data-bot': bot.slug, src: bot.avatarSource?.uri }),
}));
vi.mock('../src/ui/chat/bot-picker-sheet', () => ({
  BotPickerSheet: (props: BotPickerSheetProps<ChannelCandidate>) =>
    createElement(
      'div',
      { role: 'dialog' },
      createElement('button', { onClick: props.onClose }, t.close),
      createElement('button', { onClick: props.onConfirm, disabled: !props.canConfirm }, t.done),
      props.candidates.map((bot) =>
        createElement(
          'button',
          {
            key: bot.slug,
            'aria-label': bot.displayName,
            'aria-checked': props.selected.has(bot.slug),
            onClick: () => props.onToggle(bot.slug),
          },
          props.renderLeading?.(bot),
          bot.displayName,
        ),
      ),
    ),
}));
import { CreateChannelScreen } from '../src/ui/shell/create-channel-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let element: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

it('selects Bots in a transactional drawer and submits or retries through the channel header', async () => {
  await controller.ready;
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root.render(<CreateChannelScreen />));
  const button = (label: string) => {
    const match = [...element.querySelectorAll('button')].find(
      (button) => button.textContent === label || button.getAttribute('aria-label') === label,
    );
    if (!match) throw new Error(`Missing ${label}`);
    return match;
  };
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(fixture.screen).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: t.newChannel,
      headerShown: true,
      presentation: 'card',
      headerRight: expect.any(Function),
    }),
  );
  expect(button(t.newChannel).disabled).toBe(true);
  expect(element.textContent).toContain(t.channelCreation.chooseHost);
  await act(async () => button('Laptop').click());
  expect(element.textContent).not.toContain('A Ada');
  expect(element.textContent).not.toContain('A Scroll 21');
  await act(async () => button(t.channelCreation.chooseBots).click());
  expect(element.querySelector('img[data-bot="ada"]')?.getAttribute('src')).toBe(
    'https://a.ts.net/avatar/ada',
  );
  await act(async () => button('A Ada').click());
  expect(controller.getSnapshot().record.members).toEqual([]);
  expect(element.querySelector('[aria-label="A Ada"]')?.getAttribute('aria-checked')).toBe('true');
  await act(async () => button(t.close).click());
  expect(controller.getSnapshot().record.members).toEqual([]);
  await act(async () => button(t.channelCreation.chooseBots).click());
  expect(button('A Ada').getAttribute('aria-checked')).toBe('false');
  await act(async () => button('A Ada').click());
  await act(async () => button(t.done).click());
  expect(controller.getSnapshot().record.members).toEqual(['ada']);
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(element.textContent).toContain(t.channelCreation.selected(1));
  await act(async () => button(t.channelCreation.chooseBots).click());
  expect(button('A Ada').getAttribute('aria-checked')).toBe('true');
  await act(async () => button('A Ada').click());
  await act(async () => button(t.done).click());
  expect(controller.getSnapshot().record.members).toEqual([]);
  expect(element.textContent).toContain(t.channelCreation.selected(0));
  expect(creations).toEqual([]);
  const input = element.querySelector('input');
  if (!input) throw new Error('Missing name');
  await act(async () => {
    input.value = 'Design team';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Desktop').click());
  expect(element.querySelector('[aria-label="A Ada"]')).toBeNull();
  await act(async () => button(t.channelCreation.chooseBots).click());
  expect(element.querySelector('[aria-label="B Ada"]')?.getAttribute('aria-checked')).toBe('false');
  expect(element.querySelector('img[data-bot="ada"]')?.getAttribute('src')).toBe(
    'https://b.ts.net/avatar/ada',
  );
  expect(input.value).toBe('Design team');
  expect(creations).toEqual([]);
  await act(async () => button('B Ada').click());
  await act(async () => button('B Bo').click());
  await act(async () => button(t.done).click());
  fixture.fail = true;
  await act(async () => button(t.newChannel).click());
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
