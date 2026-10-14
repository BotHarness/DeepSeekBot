// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/shell/icons', () => ({
  ChevronRightIcon: () => null,
  FileIcon: () => null,
  FolderIcon: () => null,
}));

import { MemoryFileView, MemoryFolderView } from '../src/ui/chat/memory-browser';
import { t } from '../src/ui/strings';
import profileWire from './fixtures/profile-wire.json';

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
  await act(async () => undefined);
  return host;
}

const files = profileWire.rpc.memorySnapshot.snapshot.files;
const labels = (view: HTMLElement) =>
  [...view.querySelectorAll('button')].map((node) => node.getAttribute('aria-label'));

describe('Memory browser', () => {
  it('lists one folder of the Memory tree and opens its entries', async () => {
    const onOpen = vi.fn();
    const view = await render(
      <MemoryFolderView folder=".botharness" load={async () => files} onOpen={onOpen} />,
    );
    expect(labels(view)).toEqual(['banner.png', 'bot.json']);
    await act(async () => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(onOpen).toHaveBeenCalledWith({
      kind: 'file',
      name: 'banner.png',
      path: '.botharness/banner.png',
    });
  });

  it('says so when a folder is empty, and retries a failed read', async () => {
    let attempt = 0;
    const view = await render(
      <MemoryFolderView
        folder="notes"
        load={async () => {
          attempt += 1;
          if (attempt === 1) throw new Error('The Host did not answer in time.');
          return [];
        }}
        onOpen={() => {}}
      />,
    );
    expect(view.textContent).toContain(`${t.profileFailed} The Host did not answer in time.`);
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.tryAgain}"]`)!.click(),
    );
    await act(async () => undefined);
    expect(view.textContent).toContain(t.memoryEmptyFolder);
  });

  it('shows a file as text, and explains missing and binary files', async () => {
    const memory = profileWire.rpc.memoryFile['MEMORY.md'].file;
    const text = await render(<MemoryFileView load={async () => memory} />);
    expect(text.textContent).toBe(memory.body);
    act(() => root?.unmount());

    const missing = await render(<MemoryFileView load={async () => undefined} />);
    expect(missing.textContent).toBe(t.memoryMissing);
    act(() => root?.unmount());

    const binary = await render(
      <MemoryFileView load={async () => ({ ...memory, body: '', binary: true })} />,
    );
    expect(binary.textContent).toBe(t.memoryBinary);
  });
});
