// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { BridgeFile } from '../src/client/bridge-file.js';
import { createBridgeFileResource } from '../src/client/bridge-file-resource.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    FileTypeIcon: stub,
    IconFolderOpenOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconCopyOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    writeClipboard: vi.fn(),
    Tooltip: ({ children }: { children: ReactNode }) => children,
    Menu: ({
      items,
      onSelect,
    }: {
      items: { id: string; type?: string; label?: ReactNode; text?: ReactNode }[];
      onSelect: (id: string) => void;
    }) =>
      createElement(
        'div',
        { role: 'menu' },
        items.map((item) =>
          item.type
            ? createElement('span', { key: item.id }, item.text)
            : createElement(
                'button',
                { key: item.id, onClick: () => onSelect(item.id) },
                item.label,
              ),
        ),
      ),
  };
});
let changed: () => void;
vi.mock('../src/client/messaging-defaults-live.js', () => ({
  subscribeMessagingDefaults: (callback: () => void) => {
    changed = callback;
    return () => {};
  },
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders unknown metadata honestly and downloads only after explicit action, with visible refusal and retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fetchFile = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(new Response(new Uint8Array([65, 66, 67])));
  vi.stubGlobal('fetch', fetchFile);
  const createUrl = vi.fn(() => 'blob:original');
  const revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl;
      static override revokeObjectURL = revokeUrl;
    },
  );
  const downloaded: string[] = [];
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download);
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(BridgeFile, {
          channelId: 'channel',
          sourceEventId: 'source',
          attachmentId: 'file',
          name: '原件.csv',
          t: zhTranslate,
        }),
      ),
    );
    expect(fetchFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain('原件.csv');
    expect(container.textContent).not.toContain('KB');
    expect(container.querySelector('[aria-haspopup=menu]')).toBeNull();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-message-file-main')!.click(),
    );
    expect(container.querySelector('[role=alert]')?.textContent).toContain('文件来源当前不可访问');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[role=alert] button')!.click(),
    );
    expect(fetchFile).toHaveBeenCalledTimes(2);
    expect(fetchFile.mock.calls[0]![0]).toContain(
      'channelId=channel&sourceEventId=source&attachmentId=file',
    );
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(downloaded).toEqual(['原件.csv']);
    expect(container.querySelector('[role=alert]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeUrl).toHaveBeenCalledWith('blob:original');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each([
  [413, 'tooLarge'],
  [422, 'format'],
  [500, 'failed'],
] as const)('reports download refusal %s without dispatching a file', async (status, failure) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  );
  const resource = createBridgeFileResource('channel', 'source', 'file');
  const stop = resource.subscribe(() => {});
  try {
    await resource.download('file');
    expect(resource.getSnapshot()).toEqual({ failure });
  } finally {
    stop();
  }
});

it.each(['unmount', 'authorization'] as const)(
  'cancels a pending explicit download on %s and discards a late response',
  async (reason) => {
    let resolveResponse!: (response: Response) => void;
    let signal: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal!;
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        });
      }),
    );
    const resource = createBridgeFileResource('channel', 'source', 'file');
    const stop = resource.subscribe(() => {});
    const pending = resource.download('file');
    expect(resource.getSnapshot()).toEqual({ loading: true });
    if (reason === 'unmount') stop();
    else changed();
    expect(signal!.aborted).toBe(true);
    resolveResponse(new Response(new Uint8Array([1])));
    await pending;
    expect(resource.getSnapshot()).toEqual({});
    stop();
  },
);

it('rejects an unknown-length body that exceeds the bounded original size', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1));
            },
            cancel,
          }),
        ),
    ),
  );
  const resource = createBridgeFileResource('channel', 'source', 'file');
  const stop = resource.subscribe(() => {});
  try {
    await resource.download('file');
    expect(resource.getSnapshot()).toEqual({ failure: 'tooLarge' });
    expect(cancel).toHaveBeenCalled();
  } finally {
    stop();
  }
});

it.each([true, false])(
  'uses the existing safe application menu only on explicit action with captured Channel/source ownership (available=%s)',
  async (available) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const commands = {
      available: vi.fn(async () => available),
      target: vi.fn(async () => ({
        path: '/host/original.csv',
        relativePath: 'original.csv',
        kind: 'file' as const,
      })),
      applications: vi.fn(async () => ({
        available: true,
        applications: [{ id: 'editor', name: 'Editor', default: true, icon: null }],
      })),
      open: vi.fn(async () => {}),
    };
    const actions = { bridgeFileCommands: vi.fn(() => commands) };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(BridgeFile, {
            channelId: 'channel',
            sourceEventId: 'source',
            attachmentId: 'file',
            name: 'original.csv',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      expect(commands.target).not.toHaveBeenCalled();
      expect(commands.open).not.toHaveBeenCalled();
      if (!available) {
        expect(container.querySelector('[aria-haspopup=menu]')).toBeNull();
        return;
      }
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')!.click(),
      );
      expect(actions.bridgeFileCommands).toHaveBeenCalledWith('source');
      expect(commands.target).toHaveBeenCalledWith('channel', 'file');
      expect(commands.open).not.toHaveBeenCalled();
      await act(async () =>
        [...document.querySelectorAll<HTMLButtonElement>('[data-pointer-menu] button')]
          .find((button) => button.textContent?.includes('用 Editor 打开'))!
          .click(),
      );
      expect(commands.open).toHaveBeenCalledWith('channel', 'file', { application: 'editor' });
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
