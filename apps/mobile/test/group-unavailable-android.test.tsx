// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const requireAsset = createRequire(import.meta.url);
  for (const name of readdirSync(dirname(requireAsset.resolve('../assets/button/check.xml')))) {
    const path = requireAsset.resolve(`../assets/button/${name}`);
    const asset = new Module(path);
    asset.exports = name;
    requireAsset.cache[path] = asset;
  }
});

const box = ({ children }: { children?: ReactNode }) => createElement('div', {}, children);
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: box,
  Box: box,
  Column: box,
  Text: ({ children }: { children: ReactNode }) => createElement('b', {}, children),
  Button: ({ children, onClick }: { children: ReactNode; onClick(): void }) =>
    createElement('button', { onClick }, children),
  Icon: ({ source }: { source: unknown }) =>
    createElement('i', { 'data-testid': 'icon', 'data-source': String(source) }),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxSize: () => ({}),
  padding: () => ({}),
  testID: () => ({}),
}));
vi.mock('../src/ui/design/material-tokens', () => ({
  useMaterialRoles: () => ({ onSurface: 'on', onSurfaceVariant: 'variant' }),
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ scheme: 'light', fontScale: 1, color: { accent: 'seed' } }),
}));
vi.mock('../src/ui/strings', () => ({
  useStrings: () => ({
    groupAccessRemovedTitle: 'No access',
    groupAccessRemovedBody: 'Ask an admin',
    groupUnavailableTitle: 'Gone',
    groupUnavailableBody: 'Back to Chats',
    backToChats: 'Back',
  }),
}));

const local = createRequire(import.meta.url);
const { GroupUnavailable } = await import('../src/ui/chat/group-unavailable.android');
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

async function mount(reason: 'removed' | 'gone') {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root!.render(<GroupUnavailable reason={reason} onBack={() => {}} />));
  return container;
}

it('draws a lock when access was removed and the chat symbol when the Group is gone', async () => {
  expect(
    (await mount('removed')).querySelector('[data-testid="icon"]')?.getAttribute('data-source'),
  ).toBe('lock.xml');
  expect(local.resolve('../assets/button/lock.xml')).toMatch(/lock\.xml$/);
  act(() => root?.unmount());
  const gone = await mount('gone');
  expect(gone.querySelector('[data-testid="icon"]')?.getAttribute('data-source')).toBe(
    'message-square.xml',
  );
  expect(gone.textContent).toContain('Gone');
});
