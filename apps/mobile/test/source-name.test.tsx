// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor }: { name: { android: string }; tintColor: string }) =>
    createElement('i', { 'data-symbol': name.android, 'data-tint': tintColor }),
}));
vi.mock('react-native-svg', () => ({
  default: () => createElement('svg', { 'data-generic': 'true' }),
  Path: () => null,
  Circle: () => null,
}));

import { hostColorInk } from '../src/ui/design/host-look';
import { resolveTheme } from '../src/ui/design/resolve-theme';
import { SourceName } from '../src/ui/chat/source-name';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

describe('chat row source mark', () => {
  it("shows the computer's own icon in its colour after the name", async () => {
    const view = await render(
      <SourceName
        name="Atlas"
        source="computer"
        look={{ icon: { kind: 'symbol', id: 'server' }, color: 'orange' }}
      />,
    );
    const symbol = view.querySelector('i')!;
    expect(symbol.dataset['symbol']).toBe('dns');
    const { color } = resolveTheme('light');
    expect(symbol.dataset['tint']).toBe(hostColorInk('light', color, 'orange'));
  });

  it('shows an emoji icon as text', async () => {
    const view = await render(
      <SourceName name="Atlas" source="computer" look={{ icon: { kind: 'emoji', emoji: '🦊' } }} />,
    );
    expect(view.textContent).toContain('🦊');
  });

  it('keeps the cloud mark for cloud chats', async () => {
    const view = await render(
      <SourceName
        name="Ops"
        source="cloud"
        look={{ icon: { kind: 'symbol', id: 'server' }, color: 'orange' }}
      />,
    );
    expect(view.querySelector('i')).toBeNull();
    expect(view.querySelector('[data-generic]')).not.toBeNull();
  });
});
