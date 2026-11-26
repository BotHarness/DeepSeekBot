// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  SvgXml: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
  Circle: () => null,
}));
vi.mock('../src/ui/primitives/resource-image', () => ({ ResourceImage: () => null }));

import { FolderLookEditor } from '../src/features/sessions/folder-look-editor';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const byId = (view: HTMLElement, id: string) =>
  view.querySelector<HTMLElement>(`[data-testid="${id}"]`);

it('saves a chosen colour with letters, then an emoji', async () => {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  const view = await render(
    <FolderLookEditor folderName="lab-notes" look={{}} onSave={onSave} onClose={onClose} />,
  );
  expect(view.textContent).toContain(t.hostSessions.folderLook);
  await act(async () => byId(view, 'folder-color-purple')!.click());
  await act(async () => button(view, t.hostSessions.folderLookLetters)!.click());
  await act(async () => byId(view, 'folder-look-save')!.click());
  expect(onSave).toHaveBeenLastCalledWith({ color: 'purple', icon: { kind: 'monogram' } });
  expect(onClose).toHaveBeenCalledOnce();
  const again = await render(
    <FolderLookEditor
      folderName="lab-notes"
      look={{ color: 'purple' }}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  await act(async () => button(again, t.hostIconEmoji)!.click());
  await act(async () => button(again, '🚀')!.click());
  await act(async () => byId(again, 'folder-color-auto')!.click());
  await act(async () => byId(again, 'folder-look-save')!.click());
  expect(onSave).toHaveBeenLastCalledWith({ icon: { kind: 'emoji', emoji: '🚀' } });
});

it('clears the look with reset, and treats an empty look as a clear', async () => {
  const onSave = vi.fn(async () => {});
  const view = await render(
    <FolderLookEditor
      folderName="lab-notes"
      look={{ color: 'teal', icon: { kind: 'symbol', id: 'globe' } }}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  await act(async () => byId(view, 'folder-look-reset')!.click());
  expect(onSave).toHaveBeenLastCalledWith(null);
  const empty = await render(
    <FolderLookEditor folderName="lab-notes" look={{}} onSave={onSave} onClose={vi.fn()} />,
  );
  await act(async () => byId(empty, 'folder-look-save')!.click());
  expect(onSave).toHaveBeenLastCalledWith(null);
});

it('stays open and says so when saving fails', async () => {
  const onClose = vi.fn();
  const view = await render(
    <FolderLookEditor
      folderName="lab-notes"
      look={{}}
      onSave={async () => {
        throw new Error('offline');
      }}
      onClose={onClose}
    />,
  );
  await act(async () => byId(view, 'folder-color-red')!.click());
  await act(async () => byId(view, 'folder-look-save')!.click());
  expect(onClose).not.toHaveBeenCalled();
  expect(view.textContent).toContain(t.hostSessions.folderLookSaveFailed);
});
