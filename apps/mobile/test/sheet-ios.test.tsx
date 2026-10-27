// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { sheetContentCap, sheetDetent } from '../src/ui/chat/sheet-detent';

const keyboard = vi.hoisted(() => ({ isVisible: false, height: 0 }));
const native = vi.hoisted(() => ({
  dismiss: undefined as (() => void) | undefined,
  swipe: undefined as (() => void) | undefined,
  layout: undefined as ((height: number) => void) | undefined,
}));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: (props: {
    accessibilityLabel?: string;
    style?: unknown;
    onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
    children?: ReactNode;
  }) => {
    if (props.onLayout !== undefined)
      native.layout = (height) => props.onLayout!({ nativeEvent: { layout: { height } } });
    return createElement(
      'div',
      { 'aria-label': props.accessibilityLabel, 'data-style': JSON.stringify(props.style ?? {}) },
      props.children,
    );
  },
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: <T,>(select: (state: typeof keyboard) => T) => select(keyboard),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  frame: (params: unknown) => ({ frame: params }),
  padding: (params: unknown) => ({ padding: params }),
  presentationDetents: (detents: unknown) => ({ detents }),
  presentationDragIndicator: (visibility: unknown) => ({ dragIndicator: visibility }),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'host' }, children),
  BottomSheet: ({
    children,
    isPresented,
    onIsPresentedChange,
    onDismiss,
  }: {
    children: ReactNode;
    isPresented: boolean;
    onIsPresentedChange(presented: boolean): void;
    onDismiss?: () => void;
  }) => {
    native.swipe = () => onIsPresentedChange(false);
    native.dismiss = onDismiss;
    return createElement('dialog', { open: isPresented }, children);
  },
  Group: ({ children, modifiers }: { children: ReactNode; modifiers: unknown[] }) =>
    createElement('article', { 'data-modifiers': JSON.stringify(modifiers) }, children),
  RNHostView: ({ children, matchContents }: { children: ReactNode; matchContents?: unknown }) =>
    createElement('section', { 'data-match': JSON.stringify(matchContents) }, children),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', touch: 44 }),
}));
vi.mock('../src/ui/strings', () => ({ useStrings: () => ({ cancel: 'Cancel' }) }));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({ title, onClose }: { title: string; onClose(): void }) =>
    createElement('header', {}, title, createElement('button', { onClick: onClose }, 'Close')),
}));
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/chat/sheet-frame', () => import('../src/ui/chat/sheet-frame.ios'));

import { Sheet } from '../src/ui/chat/sheet';

const room = { window: 844, top: 47, bottom: 34, touch: 44 };

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  Object.assign(keyboard, { isVisible: false, height: 0 });
  Object.assign(native, { dismiss: undefined, swipe: undefined, layout: undefined });
});
async function mount(node: ReactNode) {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
function modifiers(view: HTMLElement) {
  return JSON.parse(view.querySelector('article')?.getAttribute('data-modifiers') ?? '[]') as {
    detents?: string[];
    dragIndicator?: string;
  }[];
}
function detents(view: HTMLElement) {
  return modifiers(view).find((modifier) => modifier.detents !== undefined)?.detents;
}
function contentStyle(view: HTMLElement) {
  const content = view.querySelector('section > [aria-label]');
  return JSON.parse(content?.getAttribute('data-style') ?? '{}') as { maxHeight?: number };
}

it('opens the shell as a native SwiftUI sheet with the system grabber and hosted content', async () => {
  const view = await mount(
    <Sheet visible label="Model" title="Model" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(view.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  expect(modifiers(view)).toContainEqual({ dragIndicator: 'visible' });
  expect(view.querySelector('section')?.getAttribute('data-match')).toBe('{"vertical":true}');
  expect(view.querySelector('section [aria-label="Model"] header')?.textContent).toContain('Model');
  expect(view.querySelector('section p')?.textContent).toBe('body');
  expect(view.querySelectorAll('[aria-label="Cancel"]')).toHaveLength(0);
});

it('calls the caller close for a swipe down and for the close button', async () => {
  const onClose = vi.fn();
  const view = await mount(
    <Sheet visible label="Model" title="Model" onClose={onClose}>
      <p>body</p>
    </Sheet>,
  );
  await act(async () => native.swipe?.());
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => view.querySelector<HTMLElement>('header button')?.click());
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('keeps the sheet mounted until the system has dismissed it, then reports it', async () => {
  const onDismissed = vi.fn();
  const sheet = (visible: boolean) => (
    <Sheet visible={visible} label="Name" onClose={() => {}} onDismissed={onDismissed}>
      <p>body</p>
    </Sheet>
  );
  const view = await mount(sheet(true));
  await act(async () => root!.render(sheet(false)));
  expect(view.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  expect(onDismissed).not.toHaveBeenCalled();
  await act(async () => native.dismiss?.());
  expect(view.querySelector('dialog')).toBeNull();
  expect(onDismissed).toHaveBeenCalledOnce();
});

it('presents again when the caller refuses to close a busy sheet', async () => {
  const onDismissed = vi.fn();
  const view = await mount(
    <Sheet visible label="Delete" onClose={() => {}} onDismissed={onDismissed}>
      <p>body</p>
    </Sheet>,
  );
  await act(async () => native.swipe?.());
  await act(async () => native.dismiss?.());
  expect(view.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  expect(onDismissed).not.toHaveBeenCalled();
});

it('renders nothing while hidden', async () => {
  const view = await mount(
    <Sheet visible={false} label="Delete" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(view.querySelector('dialog')).toBeNull();
});

it('opens short content at medium and switches to large once it measures taller', async () => {
  const view = await mount(
    <Sheet visible label="Menu" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(detents(view)).toEqual(['medium']);
  await act(async () => native.layout?.(200));
  expect(detents(view)).toEqual(['medium']);
  await act(async () => native.layout?.(520));
  expect(detents(view)).toEqual(['large']);
});

it('opens keyboard sheets large and caps the content above the keyboard', async () => {
  const view = await mount(
    <Sheet visible avoidKeyboard label="Name" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(detents(view)).toEqual(['large']);
  expect(contentStyle(view).maxHeight).toBe(844 - 47 - 34 - 44 * 2);
  act(() => root?.unmount());
  Object.assign(keyboard, { isVisible: true, height: 336 });
  const typing = await mount(
    <Sheet visible label="Search" onClose={() => {}}>
      <p>body</p>
    </Sheet>,
  );
  expect(detents(typing)).toEqual(['large']);
  expect(contentStyle(typing).maxHeight).toBe(844 - 47 - 34 - 44 * 2 - 336);
});

it('picks the detent from the room the medium detent leaves', () => {
  const medium = (844 - 47) / 2 - 34 - 44;
  expect(sheetDetent(room, undefined, false)).toBe('medium');
  expect(sheetDetent(room, medium, false)).toBe('medium');
  expect(sheetDetent(room, medium + 1, false)).toBe('large');
  expect(sheetDetent(room, 10, true)).toBe('large');
  expect(sheetContentCap(room, 0)).toBe(844 - 47 - 34 - 88);
});
