// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { HostClient } from '@botharness/host-client/client';
import type { HostSessionFolderLook } from '@botharness/host-protocol/host-sessions';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('../src/ui/shell/host-tile', () => ({
  HostGlyph: ({ icon }: { icon: { kind: string; id?: string; emoji?: string } }) => (
    <span data-glyph={icon.kind === 'symbol' ? icon.id : icon.emoji} />
  ),
}));
vi.mock('../src/ui/primitives/resource-image', () => ({
  ResourceImage: ({ source, onError }: { source: { uri: string }; onError?: () => void }) => (
    <img data-src={source.uri} onError={() => onError?.()} />
  ),
}));

import { SessionFolderAvatar } from '../src/features/sessions/session-folder-avatar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container = undefined;
});

const client: Pick<HostClient, 'resource'> = {
  resource: (path) => ({ uri: `https://host${path}`, headers: {} }),
};

function tile(look: HostSessionFolderLook | undefined, withClient = true) {
  container ??= document.createElement('div');
  const renderer = (root ??= createRoot(container));
  act(() =>
    renderer.render(
      <SessionFolderAvatar
        testID="tile"
        folderName="vite-dashboard"
        look={look}
        client={withClient ? client : undefined}
        size={44}
        corner={12}
      />,
    ),
  );
  return container.querySelector('[data-testid="tile"]')!;
}

it('shows the chosen icon first, then the favicon, then the folder monogram', () => {
  const favicon = '/api/botharness/workspace-favicon?w=k&v=1';
  expect(
    tile({ icon: { kind: 'emoji', emoji: '🧪' }, favicon }).querySelector('[data-glyph]'),
  ).not.toBeNull();
  expect(
    tile({ icon: { kind: 'symbol', id: 'globe' } }).querySelector('[data-glyph="globe"]'),
  ).not.toBeNull();
  expect(tile({ favicon }).querySelector('img')?.getAttribute('data-src')).toBe(
    `https://host${favicon}`,
  );
  expect(tile({ favicon }, false).querySelector('img')).toBeNull();
  expect(tile({ favicon }, false).textContent).toBe('VD');
  expect(tile({ icon: { kind: 'monogram' }, color: 'purple' }).textContent).toBe('VD');
  expect(tile(undefined).textContent).toBe('VD');
});

it('lets a chosen colour replace the folder colour on the tile', () => {
  const fill = (look: HostSessionFolderLook | undefined) =>
    JSON.parse(tile(look).getAttribute('data-style')!).backgroundColor;
  expect(fill({ color: 'purple' })).not.toBe(fill(undefined));
  expect(fill({ color: 'purple', icon: { kind: 'monogram' } })).toBe(fill({ color: 'purple' }));
});

it('restores the folder monogram and colour after an image error and loads the next favicon', () => {
  const path = '/api/botharness/workspace-favicon?w=k&v=';
  const fallbackStyle = tile(undefined).getAttribute('data-style');
  const view = tile({ favicon: `${path}1` });
  act(() => {
    view.querySelector('img')!.dispatchEvent(new Event('error'));
  });
  expect(view.querySelector('img')).toBeNull();
  expect(view.textContent).toBe('VD');
  expect(view.getAttribute('data-style')).toBe(fallbackStyle);

  expect(
    tile({ favicon: `${path}2` })
      .querySelector('img')
      ?.getAttribute('data-src'),
  ).toBe(`https://host${path}2`);
});
