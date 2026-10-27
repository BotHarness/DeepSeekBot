// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ isVisible: false, height: 0 }));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: (props: { accessibilityLabel?: string; style?: unknown; children?: ReactNode }) =>
    createElement(
      'div',
      { 'aria-label': props.accessibilityLabel, 'data-style': JSON.stringify(props.style ?? {}) },
      props.children,
    ),
  StyleSheet: { absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: <T,>(select: (state: typeof keyboard) => T) => select(keyboard),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'host' }, children),
  ModalBottomSheet: ({
    children,
    onDismissRequest,
    skipPartiallyExpanded,
  }: {
    children: ReactNode;
    onDismissRequest(): void;
    skipPartiallyExpanded?: boolean;
  }) =>
    createElement(
      'dialog',
      { open: true, 'data-skip-partial': String(skipPartiallyExpanded) },
      createElement('button', { 'data-testid': 'dismiss', onClick: onDismissRequest }),
      children,
    ),
  RNHostView: ({ children, matchContents }: { children: ReactNode; matchContents?: unknown }) =>
    createElement('section', { 'data-match': JSON.stringify(matchContents) }, children),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', touch: 48, color: { accent: 'seed' } }),
}));
vi.mock('../src/ui/strings', () => ({ useStrings: () => ({ cancel: 'Cancel' }) }));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({ title, onClose }: { title: string; onClose(): void }) =>
    createElement('header', {}, title, createElement('button', { onClick: onClose }, 'Close')),
}));
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/chat/sheet-frame', () => import('../src/ui/chat/sheet-frame.android'));

import { Sheet } from '../src/ui/chat/sheet';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  Object.assign(keyboard, { isVisible: false, height: 0 });
});
async function mount(node: ReactNode) {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
function contentStyle(view: HTMLElement) {
  const content = view.querySelector('section > [aria-label]');
  return JSON.parse(content?.getAttribute('data-style') ?? '{}') as { maxHeight?: number };
}

it('opens the shell in the Material 3 modal bottom sheet with the hosted content', async () => {
  const onClose = vi.fn();
  const view = await mount(
    <Sheet visible label="Model" title="Model" onClose={onClose}>
      <p>body</p>
    </Sheet>,
  );
  const sheet = view.querySelector('dialog');
  expect(sheet?.getAttribute('data-skip-partial')).toBe('true');
  expect(view.querySelector('section')?.getAttribute('data-match')).toBe('{"vertical":true}');
  expect(view.querySelector('section header')?.textContent).toContain('Model');
  expect(view.querySelector('section p')?.textContent).toBe('body');
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  expect(view.querySelectorAll('[aria-label="Cancel"]')).toHaveLength(0);
});

it('calls the caller close for every native dismissal', async () => {
  const onClose = vi.fn();
  const view = await mount(
    <Sheet visible label="Delete" onClose={onClose}>
      <p>body</p>
    </Sheet>,
  );
  await act(async () => view.querySelector<HTMLElement>('[data-testid="dismiss"]')?.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it('renders nothing while hidden', async () => {
  const view = await mount(
    <Sheet visible={false} label="Delete" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(view.querySelector('dialog')).toBeNull();
});

it('caps the hosted content at the room the sheet leaves, minus the keyboard', async () => {
  const closed = await mount(
    <Sheet visible label="Name" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(contentStyle(closed).maxHeight).toBe(844 - 24 - 16 - 48 * 2);
  act(() => root?.unmount());
  Object.assign(keyboard, { isVisible: true, height: 300 });
  const open = await mount(
    <Sheet visible label="Name" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(contentStyle(open).maxHeight).toBe(844 - 24 - 16 - 48 * 2 - 300);
});

function openingTag(source: string, from: number) {
  const name = /^<[A-Za-z]+/.exec(source.slice(from))![0];
  let index = from + name.length;
  let angle = 0;
  let brace = 0;
  for (; index < source.length; index++) {
    const char = source[index];
    if (char === '{') brace++;
    else if (char === '}') brace--;
    else if (brace === 0 && char === '<') angle++;
    else if (brace === 0 && char === '>' && source[index - 1] !== '=') {
      if (angle === 0) break;
      angle--;
    }
  }
  return source.slice(from, index);
}

it('lets every scroll view inside a shell sheet hand off to sheet dragging', () => {
  const src = join(__dirname, '../src');
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((file) => /\.tsx$/.test(file) && !/\.(ios|android|web)\.tsx$/.test(file))
    .map((file) => join(src, file))
    .filter((file) => !existsSync(file.replace(/\.tsx$/, '.android.tsx')))
    .filter((file) => /<Sheet\b(?![A-Za-z])/.test(readFileSync(file, 'utf8')));
  expect(files.length).toBeGreaterThanOrEqual(10);
  const missing = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/<(ScrollView|FlatList|SectionList|KeyboardFormScroll)\b/g)]
      .filter((match) => !openingTag(source, match.index).includes('nestedScrollEnabled'))
      .map((match) => `${relative(src, file)}: ${match[1]}`);
  });
  expect(missing).toEqual([]);
});
