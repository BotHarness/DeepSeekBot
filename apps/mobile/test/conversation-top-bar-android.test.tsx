// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const requireAsset = createRequire(import.meta.url);
  for (const folder of ['header/close.xml', 'row-icons/copy.xml']) {
    const directory = dirname(requireAsset.resolve(`../assets/${folder}`));
    for (const name of readdirSync(directory)) {
      const path = `${directory}/${name}`;
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
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
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
          'data-test-id': modifiers?.find((modifier) => modifier.name === 'testID')?.args[0],
        },
        children,
      );
  const DropdownMenu = Object.assign(node('DropdownMenu'), {
    Trigger: node('Trigger'),
    Items: node('Items'),
  });
  return {
    CircularProgressIndicator: () => null,
    Column: node('Column'),
    DropdownMenu,
    Host: node('Host'),
    Icon: () => null,
    IconButton: node('IconButton'),
    RNHostView: () => null,
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

describe('Android Session header', () => {
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
});
