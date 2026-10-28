// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callbacks = vi.hoisted(() => ({
  back: vi.fn(),
  activate: undefined as (() => void) | undefined,
  escape: undefined as (() => void) | undefined,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: callbacks.back }) }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: { ...shim.Platform, OS: 'ios' },
    View: (props: Record<string, unknown> & { children?: ReactNode }) => {
      if (props['onAccessibilityEscape'] !== undefined)
        callbacks.escape = props['onAccessibilityEscape'] as () => void;
      return createElement(
        'div',
        {
          ...(props['testID'] === undefined ? {} : { 'data-testid': props['testID'] }),
          'data-style': JSON.stringify(props['style'] ?? {}),
        },
        props.children,
      );
    },
    Pressable: (props: Record<string, unknown> & { children?: ReactNode }) => {
      callbacks.activate = props['onAccessibilityTap'] as (() => void) | undefined;
      callbacks.escape = props['onAccessibilityEscape'] as (() => void) | undefined;
      return createElement(shim.Pressable, props);
    },
  };
});

vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: ({
    title,
    titleLines,
    onClose,
    onBack,
  }: {
    title: string;
    titleLines?: number;
    onClose?: () => void;
    onBack?: () => void;
  }) =>
    createElement(
      'header',
      { 'data-lines': titleLines },
      title,
      (onClose ?? onBack) === undefined
        ? null
        : createElement('button', {
            role: 'button',
            'aria-label': onClose === undefined ? 'Back' : 'Close',
            onClick: onClose ?? onBack,
          }),
    ),
}));

import { SheetHeader, sheetStackHeader } from '../src/ui/primitives/sheet-header';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  callbacks.activate = undefined;
  callbacks.escape = undefined;
  vi.clearAllMocks();
});
async function render(element: ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

describe('iOS sheet frame and header', () => {
  it('leaves the grabber to the native form sheet', async () => {
    const view = await render(<SheetScreen>Settings</SheetScreen>);
    expect(view.querySelector('button')).toBeNull();
  });

  it('routes accessibility escape to the owning sheet', async () => {
    const closeSheet = vi.fn();
    await render(
      <SheetScreen onClose={closeSheet}>
        <SheetHeader title={t.settings} onClose={closeSheet} />
      </SheetScreen>,
    );
    expect(callbacks.escape).toBeTypeOf('function');
    await act(async () => callbacks.escape!());
    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(callbacks.back).not.toHaveBeenCalled();
  });

  it('gives the root page one leading Close that closes the owning sheet', async () => {
    const closeSheet = vi.fn();
    const view = await render(
      <SheetScreen onClose={closeSheet}>
        <SheetHeader title={t.settings} onClose={closeSheet} />
      </SheetScreen>,
    );
    const buttons = view.querySelectorAll<HTMLButtonElement>('button[role="button"]');
    expect(buttons).toHaveLength(1);
    await act(async () => buttons[0]!.click());
    expect(closeSheet).toHaveBeenCalledTimes(1);
  });

  it('paints the header on the sheet fill above the scrolling body', async () => {
    const view = await render(<SheetHeader title="A very long assignment title" />);
    const header = view.querySelector<HTMLElement>('[data-testid="sheet-header"]');
    expect(header).not.toBeNull();
    const style = JSON.parse(header!.getAttribute('data-style')!) as Record<string, unknown>;
    expect(style['zIndex']).toBe(1);
    expect(style['backgroundColor']).toBeTypeOf('string');
    expect(header!.querySelector('header')!.getAttribute('data-lines')).toBe('1');
  });
});

describe('sheet stack header', () => {
  const page = (key: string, keys: string[]) => {
    const goBack = vi.fn();
    const Header = sheetStackHeader(callbacks.back);
    const props = {
      back: { title: 'Back', href: undefined },
      navigation: { goBack, getState: () => ({ routes: keys.map((each) => ({ key: each })) }) },
      options: { title: key },
      route: { key, name: key },
    } as unknown as Parameters<typeof Header>[0];
    return { goBack, element: <Header {...props} /> };
  };

  it('closes the sheet from the stack root even when the parent stack offers Back', async () => {
    const { goBack, element } = page('index', ['index']);
    const view = await render(element);
    await act(async () => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(callbacks.back).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('goes back one page from a child page', async () => {
    const { goBack, element } = page('notifications', ['index', 'notifications']);
    const view = await render(element);
    await act(async () => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(callbacks.back).not.toHaveBeenCalled();
  });
});
