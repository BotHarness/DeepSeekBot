// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));

vi.mock('../src/ui/chat/image-viewer', () => ({ ImageViewer: vi.fn(() => null) }));
vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn() }));
vi.mock('../src/ui/primitives/fading-text', () => ({ FadingText: () => null }));
vi.mock('expo-image', () => ({
  Image: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
    <span role="img" aria-label={accessibilityLabel} />
  ),
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
  FileIcon: () => null,
  FolderIcon: () => null,
}));

import {
  MemoryFolderView,
  memoryColumns,
  memoryGridRows,
  memorySymbol,
} from '../src/ui/chat/memory-browser';
import { MemoryFileView } from '../src/ui/chat/memory-file-view';
import { MemoryPreviewImage } from '../src/ui/chat/memory-preview-image';
import { MemoryVisibility } from '../src/ui/chat/memory-visibility';
import { memoryInlineParts } from '../src/ui/chat/memory-markdown';
import { Lexer } from 'marked';
import { createHostClient } from '../src/host/client';
import { FakeHost } from './fake-host';
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
    expect(labels(view)).toEqual([
      `banner.png, ${t.memoryKind.image}`,
      `bot.json, ${t.memoryKind.data}`,
    ]);
    await act(async () => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(onOpen).toHaveBeenCalledWith({
      kind: 'file',
      name: 'banner.png',
      path: '.botharness/banner.png',
    });
  });

  it('lays a folder out as a grid that keeps its columns at large text sizes', async () => {
    expect(memoryColumns(390, false)).toBe(3);
    expect(memoryColumns(820, false)).toBe(5);
    expect(memoryColumns(390, true)).toBe(2);
    expect(memoryGridRows([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    const view = await render(
      <MemoryFolderView
        folder=""
        load={async () => ['a.md', 'b.png', 'c.json', 'd', 'e/f.md']}
        onOpen={() => {}}
      />,
    );
    expect(labels(view)).toEqual([
      `e, ${t.memoryItems(1)}`,
      `a.md, ${t.memoryKind.text}`,
      `b.png, ${t.memoryKind.image}`,
      `c.json, ${t.memoryKind.data}`,
      `d, ${t.memoryKind.other}`,
    ]);
    expect(
      [...view.querySelectorAll('[data-testid^="memory-entry-"]')].map(
        (node) =>
          node.parentElement ===
          view.querySelector('[data-testid="memory-entry-e"]')!.parentElement,
      ),
    ).toEqual([true, true, true, false, false]);
  });

  it('picks the icon from the entry kind and file extension', () => {
    const file = (name: string) => ({ kind: 'file' as const, name, path: name });
    expect(memorySymbol({ kind: 'folder', name: 'notes', path: 'notes', count: 1 })).toBe('folder');
    expect(memorySymbol(file('README.MD'))).toBe('text');
    expect(memorySymbol(file('banner.webp'))).toBe('image');
    expect(memorySymbol(file('bot.json'))).toBe('data');
    expect(memorySymbol(file('.gitattributes'))).toBe('other');
    expect(memorySymbol(file('archive.zip'))).toBe('other');
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
    expect(view.textContent).toContain(t.profileFailed);
    expect(view.textContent).not.toContain('The Host did not answer in time.');
    await act(async () =>
      [...view.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === t.details)!
        .click(),
    );
    expect(view.textContent).toContain('The Host did not answer in time.');
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

  it('puts the About note above a pinned file', async () => {
    const memory = profileWire.rpc.memoryFile['MEMORY.md'].file;
    const view = await render(<MemoryFileView load={async () => memory} role="coreMemory" />);
    expect(view.textContent).toBe(
      `${t.memoryAboutTitle} ${t.memoryAbout.coreMemory}${memory.body}`,
    );
  });
});

const client = createHostClient({
  routes: ['https://host.test'],
  credential: 'synthetic',
  carrier: new FakeHost().carrier,
});
const documentVersion = {
  source: 'worktree',
  revision: 'abc',
  status: 'ready' as const,
  body: '# Readable note',
};
const imageBytes = new Uint8Array(33);
imageBytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
imageBytes.set([73, 72, 68, 82], 12);
new DataView(imageBytes.buffer).setUint32(8, 13);
new DataView(imageBytes.buffer).setUint32(16, 16);
new DataView(imageBytes.buffer).setUint32(20, 12);
function previewPort() {
  return {
    fetch: vi.fn(
      async (
        _source: import('../src/host/client').RemoteSource,
        _signal: AbortSignal,
      ): Promise<Response> => new Response(imageBytes),
    ),
    store: vi.fn(() => ({ uri: 'file:///qa.png', dispose: vi.fn() })),
  };
}

it('renders real Markdown headings, tables and inert HTML without a native Markdown mock', async () => {
  const body =
    '# Readable note\n\n| A | B |\n|---|---|\n| one | two |\n\n<script>neverRun()</script>';
  const view = await render(
    <MemoryFileView
      load={async () => ({
        path: 'note.md',
        body,
        head: 'head',
        markdown: { ...documentVersion, body },
      })}
      preview={{ client, io: previewPort(), slug: 'ada', path: 'note.md' }}
    />,
  );
  expect(view.querySelector('[role="header"]')?.textContent).toBe('Readable note');
  expect(view.textContent).toContain('onetwo');
  expect(view.querySelector('script')).toBeNull();
  expect(view.textContent).toContain('<script>neverRun()</script>');
});

it('splits nested and reference images without losing surrounding formatting', () => {
  const tokens = Lexer.lex('Before **bold ![blue][pic] tail** after\n\n[pic]: ../blue.png');
  const paragraph = tokens[0];
  expect(
    paragraph && 'tokens' in paragraph ? memoryInlineParts(paragraph.tokens ?? []) : [],
  ).toMatchObject([
    {
      kind: 'text',
      tokens: [
        { type: 'text', text: 'Before ' },
        { type: 'strong', tokens: [{ text: 'bold ' }] },
      ],
    },
    { kind: 'image', href: '../blue.png', alt: 'blue' },
    { kind: 'text', tokens: [{ type: 'strong', tokens: [{ text: ' tail' }] }, { text: ' after' }] },
  ]);
});

it('waits for visibility and explicit external permission, then cleans temporary bytes', async () => {
  const io = previewPort();
  let show: (() => void) | undefined;
  const stop = vi.fn();
  const stage = {
    notify: vi.fn(),
    observe: vi.fn((_node, visible) => {
      show = visible;
      return stop;
    }),
  };
  const view = await render(
    <MemoryVisibility value={stage}>
      <MemoryPreviewImage
        client={client}
        io={io}
        slug="ada"
        path="note.md"
        version={documentVersion}
        reference="https://images.test/pic.png"
        alt="External diagram"
      />
    </MemoryVisibility>,
  );
  expect(io.fetch).not.toHaveBeenCalled();
  expect(stage.observe).not.toHaveBeenCalled();
  await act(async () =>
    view.querySelector<HTMLButtonElement>(`button[aria-label="${t.memoryLoadExternal}"]`)!.click(),
  );
  expect(io.fetch).not.toHaveBeenCalled();
  expect(stage.observe).toHaveBeenCalledOnce();
  await act(async () => show?.());
  expect(io.fetch).toHaveBeenCalledOnce();
  const { ImageViewer } = await import('../src/ui/chat/image-viewer');
  expect(vi.mocked(ImageViewer).mock.calls.at(-1)?.[0]).toMatchObject({ cachePolicy: 'none' });
  expect(io.fetch.mock.calls[0]?.[0]).toEqual({ uri: 'https://images.test/pic.png', headers: {} });
  expect(view.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('External diagram');
  act(() => root?.unmount());
  root = undefined;
  expect(stop).toHaveBeenCalled();
  expect(io.store.mock.results[0]?.value.dispose).toHaveBeenCalledOnce();
});

it('ignores a late file read when navigation selected a different file', async () => {
  let finish: ((value: { path: string; body: string; head: string }) => void) | undefined;
  const old = () =>
    new Promise<{ path: string; body: string; head: string }>((resolve) => {
      finish = resolve;
    });
  const view = await render(<MemoryFileView load={old} />);
  await act(async () =>
    root!.render(
      <MemoryFileView
        load={async () => ({ path: 'new.txt', body: 'New selection', head: 'head' })}
      />,
    ),
  );
  expect(view.textContent).toBe('New selection');
  await act(async () => finish?.({ path: 'old.txt', body: 'Old response', head: 'head' }));
  expect(view.textContent).toBe('New selection');
});

it('aborts an image request when the selection changes and does not retain its late file', async () => {
  let deliver: ((response: Response) => void) | undefined;
  let signal: AbortSignal | undefined;
  const io = previewPort();
  io.fetch = vi.fn((_source, abort) => {
    signal = abort;
    return new Promise<Response>((resolve) => {
      deliver = resolve;
    });
  });
  const view = await render(
    <MemoryPreviewImage
      client={client}
      io={io}
      slug="ada"
      path="a.png"
      version={documentVersion}
    />,
  );
  await act(async () => root!.render(<span>Next file</span>));
  expect(signal?.aborted).toBe(true);
  await act(async () => deliver?.(new Response(imageBytes)));
  expect(io.store).not.toHaveBeenCalled();
  expect(view.textContent).toBe('Next file');
});

it('refreshes a stale document from the reader instead of retrying its old observation', async () => {
  const io = previewPort();
  io.fetch.mockResolvedValueOnce(
    Response.json({ error: { code: 'memory-image-stale' } }, { status: 409 }),
  );
  const refresh = vi.fn();
  const view = await render(
    <MemoryPreviewImage
      client={client}
      io={io}
      slug="ada"
      path="note.md"
      version={documentVersion}
      reference="../pic.png"
      onRefresh={refresh}
    />,
  );
  expect(view.textContent).toContain(t.memoryImageError('memory-image-stale'));
  await act(async () =>
    view.querySelector<HTMLButtonElement>(`button[aria-label="${t.tryAgain}"]`)!.click(),
  );
  expect(refresh).toHaveBeenCalledOnce();
  expect(io.fetch).toHaveBeenCalledOnce();
});
