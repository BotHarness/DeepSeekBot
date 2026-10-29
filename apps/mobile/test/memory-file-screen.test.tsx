// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type NativeItem = {
  type: string;
  identifier?: string;
  variant?: string;
  disabled?: boolean;
  onPress?(): void;
  menu?: { items: { label: string; onPress(): void }[] };
};

const nav = vi.hoisted(() => ({
  prevent: [] as boolean[],
  onPrevent: undefined as ((event: { repeat(): void }) => void) | undefined,
  dispatch: vi.fn(),
  header: undefined as (() => ReactNode) | undefined,
  items: undefined as (() => NativeItem[]) | undefined,
  parentOptions: [] as Record<string, unknown>[],
  discard: vi.fn(),
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options: { headerRight?: () => ReactNode; unstable_headerRightItems?: () => NativeItem[] };
    }) => {
      nav.header = options.headerRight;
      nav.items = options.unstable_headerRightItems;
      return null;
    },
  },
  usePreventRemove: (prevent: boolean, onPrevent: (event: { repeat(): void }) => void) => {
    nav.prevent.push(prevent);
    nav.onPrevent = onPrevent;
  },
  useNavigation: () => ({
    dispatch: nav.dispatch,
    getParent: () => ({
      setOptions: (options: Record<string, unknown>) => nav.parentOptions.push(options),
    }),
  }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/primitives/sheet-save-button', () => ({
  SheetSaveButton: (props: { label: string; disabled: boolean; onPress(): void }) =>
    createElement('button', {
      'aria-label': props.label,
      disabled: props.disabled,
      onClick: props.onPress,
    }),
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: (_title: string, _message: string, _action: string, onConfirm: () => void) =>
    nav.discard(onConfirm),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../src/ui/chat/image-viewer', () => ({ ImageViewer: vi.fn(() => null) }));
vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn() }));
vi.mock('../src/ui/primitives/split-button', () => ({
  SplitButton: (props: {
    label: string;
    menuLabel: string;
    items: { key: string; label: string }[];
    onPress(): void;
    onPick(key: string): void;
  }) =>
    createElement(
      'div',
      { 'data-split': props.menuLabel },
      createElement('button', { 'aria-label': props.label, onClick: props.onPress }),
      props.items.map((item) =>
        createElement('button', {
          key: item.key,
          'aria-label': item.label,
          onClick: () => props.onPick(item.key),
        }),
      ),
    ),
}));
vi.mock('../src/ui/primitives/fading-text', () => ({ FadingText: () => null }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  CloseIcon: () => null,
  PencilIcon: () => null,
}));

import { Platform } from 'react-native';

import { MethodRefused } from '../src/host/client';
import { copyMessage } from '../src/ui/chat/message-menu';
import type { MemoryFile } from '../src/host/wire';
import { MemoryFileScreen, memoryEditable } from '../src/ui/chat/memory-file-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
let headerRoot: Root | undefined;
let headerHost: HTMLElement | undefined;
afterEach(() => {
  act(() => {
    root?.unmount();
    headerRoot?.unmount();
  });
  host?.remove();
  headerHost?.remove();
  nav.prevent.length = 0;
  nav.parentOptions.length = 0;
  nav.discard.mockReset();
  nav.dispatch.mockReset();
});

const HEAD = 'a'.repeat(40);
const file = (body: string, head = HEAD): MemoryFile => ({ path: 'SOUL.md', body, head });

async function render(props: Parameters<typeof MemoryFileScreen>[0]) {
  host = document.createElement('div');
  headerHost = document.createElement('div');
  document.body.append(host, headerHost);
  root = createRoot(host);
  headerRoot = createRoot(headerHost);
  await act(async () => root!.render(<MemoryFileScreen {...props} />));
  await act(async () => undefined);
  await renderHeader();
}
async function renderHeader() {
  await act(async () => headerRoot!.render(<>{nav.header?.()}</>));
}
const header = (label: string) =>
  headerHost!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const button = (label: string) =>
  host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const editor = () => host!.querySelector<HTMLTextAreaElement>('textarea');
async function click(target: HTMLButtonElement | null) {
  await act(async () => target!.click());
  await act(async () => undefined);
  await renderHeader();
}
async function type(value: string) {
  await act(async () => {
    const input = editor()!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await renderHeader();
}

describe('Memory file editing', () => {
  it('edits the Markdown source and returns to read mode with the saved file', async () => {
    let current = file('Old soul');
    const save = vi.fn(async (body: string, expectedHead: string) => {
      expect(expectedHead).toBe(HEAD);
      current = file(body, 'b'.repeat(40));
      return current.head;
    });
    await render({ title: 'SOUL.md', load: async () => current, save, role: 'soul' });
    expect(host!.textContent).toContain('Old soul');

    await click(header(t.memoryEdit('SOUL.md')));
    expect(editor()!.value).toBe('Old soul');
    expect(header(t.memorySave)!.disabled).toBe(true);
    await type('New soul');
    expect(nav.prevent.at(-1)).toBe(true);
    expect(nav.parentOptions.at(-1)).toEqual({ gestureEnabled: false });
    await click(header(t.memorySave));

    expect(save).toHaveBeenCalledWith('New soul', HEAD);
    expect(editor()).toBeNull();
    expect(host!.textContent).toContain('New soul');
    expect(host!.textContent).toContain(t.memoryAbout.soul);
    expect(nav.prevent.at(-1)).toBe(false);
  });

  it('keeps the draft and shows the Bot’s version when the save conflicts', async () => {
    let current = file('Original');
    const save = vi.fn(async (_body: string, _expectedHead: string): Promise<string> => {
      current = file('Bot rewrote this', 'c'.repeat(40));
      throw new MethodRefused('memory-conflict', 'Memory changed since the Human opened it');
    });
    await render({ title: 'SOUL.md', load: async () => current, save });
    await click(header(t.memoryEdit('SOUL.md')));
    await type('My draft');
    await click(header(t.memorySave));

    expect(editor()).toBeNull();
    expect(host!.textContent).toContain(t.memoryConflict);
    expect(host!.textContent).toContain('Bot rewrote this');
    expect(header(t.memoryEdit('SOUL.md'))).toBeNull();
    expect(nav.prevent.at(-1)).toBe(true);

    await click(button(t.memoryConflictEdit));
    expect(editor()!.value).toBe('My draft');
    save.mockImplementationOnce(async (_body: string, expectedHead: string) => {
      expect(expectedHead).toBe('c'.repeat(40));
      current = file('My draft', 'd'.repeat(40));
      return current.head;
    });
    await click(header(t.memorySave));
    expect(host!.textContent).toContain('My draft');
    expect(host!.textContent).not.toContain(t.memoryConflict);

    current = file('Bot again', 'e'.repeat(40));
    save.mockImplementationOnce(async () => {
      throw new MethodRefused('memory-conflict', 'changed');
    });
    await click(header(t.memoryEdit('SOUL.md')));
    await type('Second draft');
    await click(header(t.memorySave));
    await click(button(t.memoryConflictDiscard));
    expect(host!.textContent).not.toContain(t.memoryConflict);
    expect(nav.prevent.at(-1)).toBe(false);
  });

  it('leaves once when Back is confirmed over a kept conflict draft', async () => {
    const save = vi.fn(async (): Promise<string> => {
      throw new MethodRefused('memory-conflict', 'changed');
    });
    await render({ title: 'SOUL.md', load: async () => file('Original'), save });
    await click(header(t.memoryEdit('SOUL.md')));
    await type('My draft');
    await click(header(t.memorySave));
    expect(nav.prevent.at(-1)).toBe(true);

    const repeat = vi.fn();
    act(() => nav.onPrevent!({ repeat }));
    expect(nav.discard).toHaveBeenCalledTimes(1);
    await act(async () => nav.discard.mock.calls[0]![0]());
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(nav.dispatch).not.toHaveBeenCalled();
    expect(nav.prevent.at(-1)).toBe(false);
    expect(host!.textContent).not.toContain(t.memoryConflict);
  });

  it('asks before discarding edits, and shows other save failures in place', async () => {
    const save = vi.fn(async () => {
      throw new Error('The Host did not answer in time.');
    });
    await render({ title: 'SOUL.md', load: async () => file('Body'), save });
    await click(header(t.memoryEdit('SOUL.md')));
    await click(header(t.memoryStopEditing));
    expect(nav.discard).not.toHaveBeenCalled();
    expect(editor()).toBeNull();

    await click(header(t.memoryEdit('SOUL.md')));
    await type('Changed');
    await click(header(t.memorySave));
    expect(editor()!.value).toBe('Changed');
    expect(host!.textContent).toContain(t.memorySaveFailed);
    await click(header(t.memoryStopEditing));
    expect(nav.discard).toHaveBeenCalledTimes(1);
    expect(editor()).not.toBeNull();
    await act(async () => nav.discard.mock.calls[0]![0]());
    expect(editor()).toBeNull();
  });

  it('offers editing only for text files', () => {
    expect(memoryEditable(file('x'))).toBe(true);
    expect(memoryEditable({ ...file(''), binary: true })).toBe(false);
    expect(memoryEditable({ ...file(''), image: { source: 'worktree', status: 'ready' } })).toBe(
      false,
    );
    expect(memoryEditable(undefined)).toBe(false);
  });

  it('puts Edit, Copy all and History in an Android split button', async () => {
    const os = Platform.OS;
    Object.assign(Platform, { OS: 'android' });
    const history = vi.fn();
    try {
      await render({
        title: 'SOUL.md',
        load: async () => file('Old soul'),
        save: vi.fn(),
        onHistory: history,
      });
      expect(headerHost!.querySelector('[data-split]')?.getAttribute('data-split')).toBe(
        t.memoryMore('SOUL.md'),
      );
      await click(header(t.memoryCopy));
      expect(copyMessage).toHaveBeenLastCalledWith('Old soul');
      await click(header(t.memoryHistory));
      expect(history).toHaveBeenCalledTimes(1);
      await click(header(t.memoryEditShort));
      expect(editor()?.value).toBe('Old soul');
    } finally {
      Object.assign(Platform, { OS: os });
    }
  });

  it('uses native bar button items on iOS', async () => {
    const os = Platform.OS;
    Object.assign(Platform, { OS: 'ios' });
    try {
      await render({ title: 'SOUL.md', load: async () => file('Old soul'), save: vi.fn() });
      expect(nav.items?.().map((item) => item.identifier)).toEqual(['memory-edit', 'memory-more']);
      expect(nav.items!()[1]!.menu!.items.map((item) => item.label)).toEqual([t.memoryCopy]);
      nav.items!()[1]!.menu!.items[0]!.onPress();
      expect(copyMessage).toHaveBeenLastCalledWith('Old soul');
      await act(async () => nav.items!()[0]!.onPress!());
      const items = nav.items!();
      expect(items.map((item) => item.identifier ?? item.type)).toEqual([
        'memory-save',
        'spacing',
        'memory-stop-editing',
      ]);
      expect(items[0]).toMatchObject({ variant: 'prominent', disabled: true });
    } finally {
      Object.assign(Platform, { OS: os });
    }
  });
});
