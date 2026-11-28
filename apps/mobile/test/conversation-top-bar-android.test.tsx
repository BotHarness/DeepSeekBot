// @vitest-environment jsdom
import { Fragment, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { resolveTheme } from '../src/ui/design/resolve-theme';

await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const requireAsset = createRequire(import.meta.url);
  for (const folder of ['header/close.xml', 'row-icons/copy.xml']) {
    const directory = dirname(requireAsset.resolve(`../assets/${folder}`));
    for (const name of readdirSync(directory)) {
      const path = requireAsset.resolve(join(directory, name));
      const asset = new Module(path);
      asset.exports = name;
      requireAsset.cache[path] = asset;
    }
  }
});

const device = vi.hoisted(() => ({ fontScale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: device.fontScale }),
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 3, fontScale: device.fontScale }),
    addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
  },
  View: ({ children }: { children?: ReactNode }) => createElement('div', {}, children),
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  FolderIcon: ({ color }: { color: string }) => <i data-folder-ink={color} />,
}));
vi.mock('../src/ui/shell/host-tile', () => ({
  HostGlyph: ({ color }: { color: string }) => <i data-host-ink={color} />,
}));
vi.mock('../src/ui/chat/group-mark', () => ({ GroupMark: () => null }));
vi.mock('../src/ui/chat/header-bot-stack', () => ({ HeaderBotStack: () => null }));
vi.mock('../src/ui/chat/chat-header-surface.android', () => ({ ChatHeaderSurface: () => null }));
vi.mock('../src/ui/primitives/material-menu.android', () => ({
  MaterialMenuGroup: ({ header }: { header?: string }) =>
    createElement('div', { 'data-node': 'MaterialMenuGroup', 'data-header': header }),
}));
vi.mock('../src/ui/primitives/menu-icon', () => ({ MenuIcon: () => null }));
vi.mock('../src/ui/design/island-compose.android', () => ({
  composeIsland: () => ({ surface: {}, modifiers: [] }),
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const node =
    (name: string) =>
    ({
      children,
      modifiers,
      style,
      maxLines,
    }: {
      children?: ReactNode;
      modifiers?: { name: string; args: unknown[] }[];
      style?: { fontSize?: number };
      maxLines?: number;
    }) =>
      createElement(
        'div',
        {
          'data-node': name,
          'data-max-lines': maxLines,
          'data-font-size': style?.fontSize,
          'data-height': modifiers?.find((modifier) => modifier.name === 'height')?.args[0],
          'data-size': modifiers?.find((modifier) => modifier.name === 'size')?.args.join('×'),
          'data-test-id': modifiers?.find((modifier) => modifier.name === 'testID')?.args[0],
        },
        children,
      );
  const DropdownMenu = Object.assign(node('DropdownMenu'), {
    Trigger: node('Trigger'),
    Items: node('Items'),
  });
  const transition = { fadeIn: () => ({}), fadeOut: () => ({}) };
  return {
    AnimatedVisibility: ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
      visible ? createElement(Fragment, null, children) : null,
    Box: node('Box'),
    EnterTransition: transition,
    ExitTransition: transition,
    CircularProgressIndicator: () => null,
    Column: node('Column'),
    DropdownMenu,
    Host: node('Host'),
    Icon: () => null,
    IconButton: node('IconButton'),
    RNHostView: node('RNHostView'),
    Row: node('Row'),
    Spacer: () => null,
    Surface: node('Surface'),
    Text: node('Text'),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => {
  const modifier =
    (name: string) =>
    (...args: unknown[]) => ({ name, args });
  return Object.fromEntries(
    [
      'defaultMinSize',
      'fillMaxWidth',
      'height',
      'padding',
      'semantics',
      'size',
      'testID',
      'weight',
      'width',
    ].map((name) => [name, modifier(name)]),
  );
});

import { ConversationTopBar } from '../src/ui/chat/conversation-top-bar.android';

const TITLE = 'Launch planning for the spring release';
const TITLE_SIZE = 16;
const TOUCH = 48;

function render(fontScale: number) {
  device.fontScale = fontScale;
  const view = document.createElement('div');
  view.innerHTML = renderToStaticMarkup(
    <ConversationTopBar
      title={TITLE}
      subtitle="Active 1 h ago"
      onBack={() => {}}
      onProfile={() => {}}
    />,
  );
  const title = [...view.querySelectorAll<HTMLElement>('[data-node="Text"]')].find(
    (element) => element.textContent === TITLE,
  )!;
  const row = title.closest<HTMLElement>('[data-node="Column"]')!.parentElement!;
  return {
    maxLines: Number(title.dataset.maxLines),
    renderedSize: Number(title.dataset.fontSize ?? TITLE_SIZE) * fontScale,
    islandHeight: Number(row.dataset.height ?? 0),
    statusShown: view.textContent?.includes('Active 1 h ago') ?? false,
  };
}

describe('Android Conversation screen top app bar at large text', () => {
  it('keeps the title on one capped line next to the buttons at font 2.0', () => {
    const bar = render(2);
    expect(bar.maxLines).toBe(1);
    expect(bar.renderedSize).toBeLessThanOrEqual(TITLE_SIZE * 1.35 + 0.01);
    expect(bar.islandHeight).toBeGreaterThan(0);
    expect(bar.islandHeight).toBeLessThanOrEqual(TOUCH + 8);
    expect(bar.statusShown).toBe(false);
  });

  it('keeps the default layout with title and status at font 1.0', () => {
    const bar = render(1);
    expect(bar.maxLines).toBe(1);
    expect(bar.renderedSize).toBe(TITLE_SIZE);
    expect(bar.statusShown).toBe(true);
  });
});

describe('Android Conversation screen top app bar leading action', () => {
  it('drops Back for a tab-root conversation and keeps it elsewhere', () => {
    const markup = (leading?: 'back' | 'none') =>
      renderToStaticMarkup(
        <ConversationTopBar
          title={TITLE}
          onBack={() => {}}
          onProfile={() => {}}
          {...(leading === undefined ? {} : { leading })}
        />,
      );
    expect(markup()).toContain('chat-back');
    expect(markup('none')).not.toContain('chat-back');
  });
});

describe('Android Session header', () => {
  it.each([1, 2])('uses the same round action sizes as a Channel at font scale %s', (scale) => {
    device.fontScale = scale;
    const channel = document.createElement('div');
    channel.innerHTML = renderToStaticMarkup(
      <ConversationTopBar
        title={TITLE}
        subtitle="3 members"
        onBack={() => {}}
        onProfile={() => {}}
      />,
    );
    const session = document.createElement('div');
    session.innerHTML = renderToStaticMarkup(
      <ConversationTopBar
        variant="session"
        title={TITLE}
        leading="drawer"
        place={{
          hostIcon: { kind: 'symbol', id: 'laptop' },
          hostName: 'Studio Mac',
          folder: 'worktree',
        }}
        onBack={() => {}}
        onCompose={() => {}}
      />,
    );
    const actionSizes = (bar: HTMLElement) =>
      Array.from(
        bar.querySelectorAll<HTMLElement>('[data-node="IconButton"]'),
        (button) => button.dataset.size,
      );
    expect(actionSizes(session)).toEqual(actionSizes(channel));
    expect(actionSizes(session)).toEqual([`${TOUCH}×${TOUCH}`, `${TOUCH}×${TOUCH}`]);
    expect(session.querySelector('[data-test-id="session-header-place"]')?.textContent).toBe(
      'worktree',
    );
    if (scale === 1) {
      for (const bar of [channel, session]) {
        expect(
          bar
            .querySelector('[data-test-id="chat-identity"] [data-height]')
            ?.getAttribute('data-height'),
        ).toBe(String(TOUCH));
      }
    }
  });

  it('opens the Session menu from the name capsule, with the full name on top and no ⋯ button', () => {
    device.fontScale = 1;
    const view = document.createElement('div');
    view.innerHTML = renderToStaticMarkup(
      <ConversationTopBar
        variant="session"
        title={TITLE}
        leading="drawer"
        onBack={() => {}}
        onCompose={() => {}}
        titleMenu={{
          label: 'Session options',
          testID: 'session-options',
          items: [
            { label: 'Model choice', testID: 'session-model-choice', icon: 'model', run() {} },
          ],
        }}
      />,
    );
    const menus = view.querySelectorAll('[data-node="DropdownMenu"]');
    expect(menus).toHaveLength(1);
    expect(
      menus[0]!.querySelector('[data-node="Trigger"] [data-test-id="chat-identity"]'),
    ).not.toBeNull();
    expect(
      menus[0]!
        .querySelector('[data-node="Items"] [data-node="MaterialMenuGroup"]')
        ?.getAttribute('data-header'),
    ).toBe(TITLE);
    expect(menus[0]!.querySelector('[data-node="Items"] [data-node="Text"]')).toBeNull();
    expect(view.innerHTML).not.toContain('more-vert');
    expect(view.querySelector('[data-test-id="session-new"]')).not.toBeNull();
    expect(view.querySelector('[data-test-id="session-drawer-button"]')).not.toBeNull();
  });

  it('shows the Host and worktree folder under the title and the full path in the menu', () => {
    device.fontScale = 1;
    const view = document.createElement('div');
    view.innerHTML = renderToStaticMarkup(
      <ConversationTopBar
        variant="session"
        title={TITLE}
        place={{
          hostIcon: { kind: 'symbol', id: 'laptop' },
          hostName: 'Studio Mac',
          hostColor: 'teal',
          folder: 'app-5187',
          folderColor: 'purple',
          path: '/srv/worktrees/app-5187',
        }}
        leading="drawer"
        onBack={() => {}}
        titleMenu={{
          label: 'Session options',
          testID: 'session-options',
          items: [
            { label: 'Model choice', testID: 'session-model-choice', icon: 'model', run() {} },
          ],
        }}
      />,
    );
    const place = view.querySelector('[data-test-id="session-header-place"]');
    expect(place?.textContent).toBe('app-5187');
    const theme = resolveTheme('light', {}, 'android');
    expect(place?.querySelector('[data-host-ink]')?.getAttribute('data-host-ink')).toBe(
      hostColorInk('light', theme.color, 'teal'),
    );
    expect(place?.querySelector('[data-folder-ink]')?.getAttribute('data-folder-ink')).toBe(
      hostColorInk('light', theme.color, 'purple'),
    );
    expect(view.querySelector('[data-node="MaterialMenuGroup"]')?.getAttribute('data-header')).toBe(
      `${TITLE}\nStudio Mac\n/\u200bsrv/\u200bworktrees/\u200bapp-\u200b5187`,
    );
  });
});
