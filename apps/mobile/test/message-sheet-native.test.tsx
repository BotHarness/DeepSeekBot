// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';

const native = vi.hoisted(() => ({
  os: 'ios',
  presented: undefined as ((presented: boolean) => void) | undefined,
  dismiss: () => {},
}));

type Modifier = {
  label?: string;
  traits?: string[];
  description?: string;
  onClick?: () => void;
  toggled?: boolean;
  minWidth?: number;
  fixed?: boolean;
  fixedWidth?: number;
};
const fixedWidth = (modifiers?: Modifier[]) =>
  modifiers?.find((modifier) => modifier.fixedWidth !== undefined)?.fixedWidth;
const labelOf = (modifiers?: Modifier[]) =>
  modifiers?.find((modifier) => modifier.label !== undefined)?.label ??
  modifiers?.find((modifier) => modifier.description !== undefined)?.description;

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    StyleSheet: { ...shim.StyleSheet, absoluteFill: {} },
    Platform: {
      get OS() {
        return native.os;
      },
    },
  };
});
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const none = () => ({});
  return {
    accessibilityAddTraits: (traits: string[]) => ({ traits }),
    accessibilityElement: none,
    accessibilityLabel: (label: string) => ({ label }),
    background: none,
    buttonStyle: none,
    contentShape: none,
    font: none,
    foregroundStyle: none,
    fixedSize: ({ vertical }: { vertical: boolean }) => ({ fixed: vertical }),
    frame: (params: { width?: number }) => ({ fixedWidth: params.width }),
    imageScale: none,
    padding: none,
    presentationBackground: none,
    presentationDragIndicator: (visibility: string) => ({ grabber: visibility }),
    shapes: { circle: none, rectangle: none, roundedRectangle: none },
  };
});
vi.mock('@expo/ui/swift-ui', () => {
  const box =
    (tag: string) =>
    ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
      createElement(
        tag,
        {
          'aria-label': labelOf(modifiers),
          'data-fixed': String(modifiers?.some((modifier) => modifier.fixed) ?? false),
        },
        children,
      );
  return {
    BottomSheet: ({
      isPresented,
      onIsPresentedChange,
      onDismiss,
      fitToContents,
      children,
    }: {
      isPresented: boolean;
      onIsPresentedChange(presented: boolean): void;
      onDismiss(): void;
      fitToContents: boolean;
      children: ReactNode;
    }) => {
      native.presented = onIsPresentedChange;
      native.dismiss = onDismiss;
      return createElement(
        'div',
        { role: 'dialog', 'data-open': String(isPresented), 'data-fit': String(fitToContents) },
        children,
      );
    },
    Button: ({
      children,
      onPress,
      modifiers,
    }: {
      children: ReactNode;
      onPress(): void;
      modifiers: Modifier[];
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          'aria-label': labelOf(modifiers),
          'aria-selected': String(modifiers.some((m) => m.traits?.includes('isSelected'))),
        },
        children,
      ),
    Divider: () => createElement('hr'),
    Group: box('section'),
    HStack: box('div'),
    Host: box('div'),
    Image: ({ systemName, modifiers }: { systemName: string; modifiers: Modifier[] }) =>
      createElement('i', { 'data-symbol': systemName, 'data-width': fixedWidth(modifiers) }),
    RNHostView: ({ children }: { children: ReactNode }) => children,
    ScrollView: box('div'),
    Spacer: () => null,
    Text: ({ children, modifiers }: { children: ReactNode; modifiers?: Modifier[] }) =>
      createElement('span', { 'data-width': fixedWidth(modifiers) }, children),
    VStack: box('div'),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => ({
  ...(await import('./compose-menu-shim')).modifiers,
  Shapes: { Circle: {}, RoundedCorner: () => ({}) },
  background: () => ({}),
  clickable: (onClick: () => void) => ({ onClick }),
  clip: () => ({}),
  defaultMinSize: ({ minWidth }: { minWidth: number }) => ({ minWidth }),
  horizontalScroll: () => ({}),
  padding: () => ({}),
  paddingAll: () => ({}),
  toggleable: (value: boolean, onClick: () => void) => ({ toggled: value, onClick }),
  semantics: ({ contentDescription }: { contentDescription: string }) => ({
    description: contentDescription,
  }),
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const nativeMenu = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const box =
    (tag: string) =>
    ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) =>
      createElement(tag, { 'aria-label': labelOf(modifiers) }, children);
  const ListItem = ({ children, modifiers }: { children: ReactNode; modifiers: Modifier[] }) =>
    createElement('li', { onClick: modifiers[0]?.onClick }, children);
  ListItem.LeadingContent = pass;
  ListItem.HeadlineContent = pass;
  return {
    ...nativeMenu,
    Column: box('div'),
    Box: ({ children, modifiers }: { children: ReactNode; modifiers: Modifier[] }) => {
      const toggle = modifiers.find((modifier) => modifier.toggled !== undefined);
      return createElement(
        'button',
        {
          onClick: toggle?.onClick,
          'aria-label': labelOf(modifiers),
          'aria-selected': String(toggle?.toggled),
          'data-min': String(modifiers.some((modifier) => modifier.minWidth !== undefined)),
        },
        children,
      );
    },
    HorizontalDivider: () => createElement('hr'),
    Host: pass,
    ListItem,
    ModalBottomSheet: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'dialog' }, children),
    RNHostView: pass,
    Row: nativeMenu.Row,
    Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  };
});

const ios = await import('../src/ui/chat/message-actions.ios');
const android = await import('../src/ui/chat/message-actions.android');
const { menuGroups } = await import('../src/ui/chat/message-sheet');
const { t } = await import('../src/ui/strings');
const { MENU_REACTIONS, QUICK_REACTIONS } = await import('../src/host/conversation');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  native.os = 'ios';
});

const anchor = { x: 16, y: 400, width: 200, height: 60 };
const group = { first: true, last: true };
const bot: ConversationMessage = {
  id: 'bot-1',
  revision: 3,
  at: '2026-10-14T08:00:00.000Z',
  author: 'bot',
  body: 'Which one first?',
  attachments: [],
  delivery: 'committed',
  reactions: [{ emoji: '🔥', actors: [{ kind: 'human', id: 'local-human' }] }],
};

type Sheet = typeof ios.MessageActions;
function mount(
  Sheet: Sheet,
  props: Partial<Parameters<Sheet>[0]> & { target: Parameters<Sheet>[0]['target'] },
) {
  const handlers = {
    onClose: vi.fn(),
    onReact: vi.fn(),
    onCopy: vi.fn(),
    onShareText: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (next: typeof props) =>
    act(() => root?.render(createElement(Sheet, { ...handlers, ...next })));
  render(props);
  return { handlers, render };
}
const byLabel = (label: string) => host?.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const rows = () =>
  [...(host?.querySelectorAll('[data-symbol]') ?? [])].map((icon) => [
    icon.getAttribute('data-symbol'),
    icon.parentElement?.textContent ?? icon.closest('li')?.textContent,
  ]);

describe('message sheet groups', () => {
  it('keeps Copy and Share together, setting Copy apart only beside Open', () => {
    expect(
      menuGroups([
        { key: 'open', label: 'Open memory' },
        { key: 'copy', label: t.copy },
        { key: 'share', label: t.shareText },
      ]).map((group) => group.map((action) => action.key)),
    ).toEqual([['copy'], ['open', 'share']]);
    expect(
      menuGroups([
        { key: 'copy', label: t.copy },
        { key: 'share', label: t.shareText },
      ]).map((group) => group.map((action) => action.key)),
    ).toEqual([['copy', 'share']]);
    expect(menuGroups([])).toEqual([]);
  });
});

describe('iOS message sheet', () => {
  it('presents a fitted native sheet with a grabber, a reaction row and icon-led actions', () => {
    mount(ios.MessageActions, { target: { message: bot, anchor, group } });
    const sheet = host?.querySelector('[role="dialog"]');
    expect(sheet?.getAttribute('data-open')).toBe('true');
    expect(sheet?.getAttribute('data-fit')).toBe('true');
    expect(byLabel(t.messageActions)).not.toBeNull();
    expect(MENU_REACTIONS.slice(0, QUICK_REACTIONS.length)).toEqual([...QUICK_REACTIONS]);
    const reactions = byLabel(t.reactions);
    for (const emoji of MENU_REACTIONS) {
      const button = reactions?.querySelector(
        `[aria-label="${emoji === '🔥' ? t.unreact(emoji) : t.react(emoji)}"]`,
      );
      expect(button?.getAttribute('aria-selected')).toBe(String(emoji === '🔥'));
    }
    expect(host?.textContent).not.toContain(bot.body);
    expect(rows()).toEqual([
      ['doc.on.doc', t.copy],
      ['square.and.arrow.up', t.shareText],
    ]);
    expect(host?.querySelectorAll('hr')).toHaveLength(1);
    expect(host?.querySelector('[data-fixed="true"]')).not.toBeNull();
    expect(host?.querySelector('[data-width]')).toBeNull();
  });

  it('toggles a reaction and closes', () => {
    const { handlers } = mount(ios.MessageActions, { target: { message: bot, anchor, group } });
    act(() => byLabel(t.unreact('🔥'))?.click());
    expect(handlers.onReact).toHaveBeenCalledWith(bot, '🔥', false);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('drops reactions in a read-only DM and for unsent messages, keeping copy and share', () => {
    mount(ios.MessageActions, { target: { message: bot, anchor, group }, readOnly: true });
    expect(byLabel(t.reactions)).toBeNull();
    expect(byLabel(t.copy)).not.toBeNull();
    const { revision: _, ...unsent } = bot;
    act(() => root?.unmount());
    mount(ios.MessageActions, {
      target: { message: { ...unsent, delivery: 'pending' }, anchor, group },
    });
    expect(byLabel(t.reactions)).toBeNull();
    expect(byLabel(t.shareText)).not.toBeNull();
  });

  it('copies at once but shares and opens only after the sheet has dismissed', () => {
    const onOpen = vi.fn();
    const target = {
      message: bot,
      anchor,
      group,
      activity: { label: t.activityRow.openMemory, onOpen },
    };
    const { handlers, render } = mount(ios.MessageActions, { target });
    expect(byLabel(t.activityRow.actions)).not.toBeNull();
    expect(host?.textContent).toContain(bot.body);
    expect(byLabel(t.reactions)).toBeNull();
    expect(rows()[1]).toEqual(['arrow.up.forward.app', t.activityRow.openMemory]);
    act(() => byLabel(t.copy)?.click());
    expect(handlers.onCopy).toHaveBeenCalledWith(bot.body);
    act(() => byLabel(t.activityRow.openMemory)?.click());
    expect(onOpen).not.toHaveBeenCalled();
    render({ target: undefined });
    expect(host?.querySelector('[role="dialog"]')?.getAttribute('data-open')).toBe('false');
    expect(byLabel(t.copy)).not.toBeNull();
    act(() => native.dismiss());
    expect(onOpen).toHaveBeenCalledOnce();
    render({ target });
    act(() => byLabel(t.shareText)?.click());
    expect(handlers.onShareText).not.toHaveBeenCalled();
    act(() => native.dismiss());
    expect(handlers.onShareText).toHaveBeenCalledWith(bot.body);
  });

  it('closes when the sheet is swiped away', () => {
    const { handlers } = mount(ios.MessageActions, { target: { message: bot, anchor, group } });
    act(() => native.presented?.(false));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});

describe('Android message sheet', () => {
  it('shows nothing until a message is pressed', () => {
    native.os = 'android';
    mount(android.MessageActions, { target: undefined });
    expect(host?.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists reactions as toggle buttons, then actions with leading Material icons', () => {
    native.os = 'android';
    const { handlers } = mount(android.MessageActions, {
      target: { message: bot, anchor, group },
    });
    expect(byLabel(t.messageActions)).not.toBeNull();
    expect(byLabel(t.reactions)?.querySelectorAll('button')).toHaveLength(MENU_REACTIONS.length);
    expect(byLabel(t.unreact('🔥'))?.getAttribute('aria-selected')).toBe('true');
    expect(rows()).toEqual([
      ['content_copy', t.copy],
      ['share', t.shareText],
    ]);
    expect(host?.querySelectorAll('li i[data-symbol]')).toHaveLength(2);
    expect(byLabel(t.react('👍'))?.getAttribute('data-min')).toBe('true');
    act(() => byLabel(t.react('👍'))?.click());
    expect(handlers.onReact).toHaveBeenCalledWith(bot, '👍', true);
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('runs actions at once and closes', () => {
    native.os = 'android';
    const onOpen = vi.fn();
    const { handlers } = mount(android.MessageActions, {
      target: { message: bot, anchor, group, activity: { label: 'Open memory', onOpen } },
    });
    expect(byLabel(t.reactions)).toBeNull();
    expect(host?.textContent).toContain(bot.body);
    expect(rows()[1]).toEqual(['open_in_new', 'Open memory']);
    const items = [...(host?.querySelectorAll('li') ?? [])];
    act(() => items[1]?.click());
    expect(onOpen).toHaveBeenCalledOnce();
    act(() => items[2]?.click());
    expect(handlers.onShareText).toHaveBeenCalledWith(bot.body);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });
});
