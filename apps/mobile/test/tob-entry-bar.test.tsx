// @vitest-environment jsdom
import { act, createElement, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  os: 'android',
  push: vi.fn(),
  links: [] as { href: unknown; zoom: boolean }[],
}));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      get OS() {
        return state.os;
      },
      select: shim.Platform.select,
    },
    Pressable: ({
      ref,
      onPress,
      accessibilityLabel,
      accessibilityHint,
      testID,
      children,
    }: {
      ref?: Ref<unknown>;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityHint?: string;
      testID?: string;
      children?: ReactNode;
    }) => {
      if (ref && typeof ref === 'object')
        (ref as { current: unknown }).current = {
          measureInWindow: (done: (...frame: number[]) => void) => done(16, 700, 280, 56),
        };
      return createElement(
        'button',
        {
          onClick: onPress,
          'aria-label': accessibilityLabel,
          'aria-description': accessibilityHint,
          'data-testid': testID,
        },
        children,
      );
    },
  };
});
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/shell/icons', async () => ({ ...(await import('./shell-icons-shim')) }));
vi.mock('../src/ui/chat/composer-chrome', () => ({
  composerBar: () => 56,
  ComposerFieldMaterial: () => null,
}));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const Link = Object.assign(
    ({ href, children }: { href: unknown; children: ReactNode }) => {
      state.links.push({ href, zoom: false });
      return createElement('a', { 'data-link': true }, children);
    },
    {
      AppleZoom: ({ children }: { children: ReactNode }) => {
        state.links.at(-1)!.zoom = true;
        return children;
      },
    },
  );
  return { Link, router: { push: state.push }, useFocusEffect: () => undefined };
});

const { TobEntryBar } = await import('../src/ui/shell/tob-entry-bar');
const { TabChromeContext } = await import('../src/ui/shell/tab-chrome');
const { tobEntryOrigin } = await import('../src/ui/shell/tob-entry-origin');
const { tobModeHref } = await import('../src/ui/shell/tob-mode-model');
const { t } = await import('../src/ui/strings');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const computers = [{ hostId: 'h1', tob: 'tob' }];

describe('the Tob entry bar', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.push.mockClear();
    state.links.length = 0;
    tobEntryOrigin.set(undefined);
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  const render = (os: 'ios' | 'android') => {
    state.os = os;
    const href = tobModeHref('h1', computers, os)!;
    return act(async () =>
      root.render(
        <TabChromeContext value={{ hidden: { value: 0 } as never, islandTop: 100 }}>
          <TobEntryBar href={href} name="Tob" />
        </TabChromeContext>,
      ),
    );
  };

  it('reads as a message to Tob that opens Tob Mode', async () => {
    await render('android');
    const bar = container.querySelector('[data-testid="tob-entry-bar"]')!;
    expect(bar.getAttribute('aria-label')).toBe(t.tobEntry('Tob'));
    expect(bar.getAttribute('aria-description')).toBe(t.tobEntryHint);
    expect(bar.textContent).toContain(t.tobEntry('Tob'));
  });

  it('on Android grows Tob Mode out of its own measured frame', async () => {
    await render('android');
    await act(async () =>
      (container.querySelector('[data-testid="tob-entry-bar"]') as HTMLButtonElement).click(),
    );
    expect(tobEntryOrigin.read()).toEqual({ x: 16, y: 700, width: 280, height: 56 });
    expect(state.push).toHaveBeenCalledExactlyOnceWith({
      pathname: '/dm-tob/[slug]',
      params: { slug: 'tob', hostId: 'h1', compose: '1' },
    });
    expect(state.links).toEqual([]);
  });

  it('on iOS zooms the ordinary Tob DM out of the bar', async () => {
    await render('ios');
    expect(state.links.at(-1)).toEqual({
      href: { pathname: '/dm/[slug]', params: { slug: 'tob', hostId: 'h1', compose: '1' } },
      zoom: true,
    });
    await act(async () =>
      (container.querySelector('[data-testid="tob-entry-bar"]') as HTMLButtonElement).click(),
    );
    expect(state.push).not.toHaveBeenCalled();
  });
});
