// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { createBridgeVideoResource } from '../src/client/bridge-video-resource.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Tag: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
    Button: ({
      children,
      variant: _variant,
      ...props
    }: {
      children: ReactNode;
      variant?: string;
    }) => createElement('button', props, children),
    Modal: stub,
    FileTypeIcon: stub,
    MarkdownText: stub,
    StateDot: stub,
    IconDownloadOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconPlayOutlineRegular: stub,
    IconPauseOutlineRegular: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    fileSizeText: (size: number) => `${size} B`,
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
const videoId = 'a'.repeat(64);
const posterId = 'b'.repeat(64);
const message = (poster: boolean) => ({
  id: 'source',
  at: '2026-10-16T00:00:00.000Z',
  body: 'inspect video',
  format: 'text',
  author: { kind: 'bridged', source: 'Human' },
  bridgeOrigin: {
    sourceEventId: 'source',
    platform: 'feishu',
    conversationId: 'group',
    conversationName: 'Group',
    messageId: 'mention',
    senderId: 'human',
  },
  bridgeMedia: {
    video: {
      attachmentId: videoId,
      durationMs: 4000,
      ...(poster ? { posterAttachmentId: posterId } : {}),
    },
    items: [
      { kind: 'video', id: videoId, name: 'clip.mp4' },
      ...(poster ? [{ kind: 'image', id: posterId, name: 'video-cover' }] : []),
    ],
  },
});
const urls = () => {
  const create = vi.fn((blob: Blob) => `blob:${blob.type}`);
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    },
  );
  return { create, revoke };
};

it.each([false, true])(
  'renders a single native video with lazy playback, original download and independent poster (poster=%s)',
  async (poster) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const fetchMedia = vi.fn(
      async (url: string) =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': url.includes(posterId) ? 'image/png' : 'video/mp4' },
        }),
    );
    vi.stubGlobal('fetch', fetchMedia);
    const created = urls();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      const parsed = parseChannelMessage(message(poster));
      expect(parsed).toBeDefined();
      await act(async () =>
        root.render(
          createElement(ChannelMessageBody, {
            message: parsed!,
            channelId: 'local-group',
            t: zhTranslate,
          }),
        ),
      );
      expect(container.textContent).toContain('平台时长: 0:04');
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(fetchMedia).not.toHaveBeenCalled();
      expect(container.querySelectorAll('.bh-message-file')).toHaveLength(1);
      expect(container.querySelector('button[aria-label="下载到此设备: clip.mp4"]')).not.toBeNull();
      if (!poster) expect(container.textContent).toContain('平台未提供封面');
      await act(async () => {
        [...container.querySelectorAll('button')]
          .find((b) => b.textContent === '准备视频')!
          .click();
      });
      expect(fetchMedia).toHaveBeenCalledTimes(poster ? 2 : 1);
      const player = container.querySelector('video')!;
      expect(player.getAttribute('src')).toBe('blob:video/mp4');
      expect(player.getAttribute('poster')).toBe(poster ? 'blob:image/png' : null);
      expect(player.getAttribute('preload')).toBe('metadata');
      expect(player.controls).toBe(true);
      expect(player.autoplay).toBe(false);
      expect(player.getAttribute('playsinline')).not.toBeNull();
      if (poster) {
        await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
        expect(container.querySelector('video')).not.toBeNull();
        expect(container.querySelector('video')?.hasAttribute('poster')).toBe(false);
        expect(container.textContent).toContain('封面未能加载');
      }
      expect(fetchMedia.mock.calls[0]?.[0]).toContain('representation=playback');
      await act(async () => player.dispatchEvent(new Event('error')));
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('格式无法播放');
      expect(container.querySelector('.bh-message-file')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
    expect(created.revoke).toHaveBeenCalledWith('blob:video/mp4');
  },
);

it('a missing or refused cover does not block the prepared video', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes(posterId)
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([1]), { headers: { 'content-type': 'video/mp4' } }),
    ),
  );
  urls();
  const resource = createBridgeVideoResource('channel', 'source', videoId, posterId);
  const stop = resource.subscribe(() => {});
  try {
    await resource.prepare();
    expect(resource.getSnapshot()).toMatchObject({
      url: 'blob:video/mp4',
      posterFailure: 'unavailable',
      loading: false,
    });
  } finally {
    stop();
  }
});

it.each([
  [403, 'unavailable'],
  [413, 'tooLarge'],
  [422, 'format'],
  [500, 'failed'],
] as const)(
  'reports coded playback refusal %s and permits explicit retry',
  async (status, failure) => {
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), { headers: { 'content-type': 'video/mp4' } }),
      );
    vi.stubGlobal('fetch', fetched);
    urls();
    const resource = createBridgeVideoResource('channel', 'source', videoId);
    const stop = resource.subscribe(() => {});
    try {
      await resource.prepare();
      expect(resource.getSnapshot()).toEqual({ loading: false, failure });
      await resource.prepare();
      expect(resource.getSnapshot().url).toBe('blob:video/mp4');
    } finally {
      stop();
    }
  },
);

it.each(['unmount', 'authority'] as const)(
  'cancels %s and discards late bytes and object URLs',
  async (action) => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) => {
        signal = options?.signal;
        return new Promise<Response>((done) => {
          resolve = done;
        });
      }),
    );
    const created = urls();
    const resource = createBridgeVideoResource('channel', 'source', videoId);
    const stop = resource.subscribe(() => {});
    const pending = resource.prepare();
    if (action === 'unmount') stop();
    else changed();
    expect(signal?.aborted).toBe(true);
    resolve(new Response(new Uint8Array([1]), { headers: { 'content-type': 'video/mp4' } }));
    await pending;
    expect(resource.getSnapshot()).toEqual({});
    expect(created.create).not.toHaveBeenCalled();
    stop();
  },
);

it('rejects forged video and poster projection associations', () => {
  const candidate = message(true);
  expect(
    parseChannelMessage({
      ...candidate,
      bridgeOrigin: { ...candidate.bridgeOrigin, platform: 'qq' },
    }),
  ).toBeUndefined();
  expect(
    parseChannelMessage({
      ...candidate,
      bridgeMedia: { ...candidate.bridgeMedia, video: { attachmentId: posterId } },
    }),
  ).toBeUndefined();
  expect(
    parseChannelMessage({
      ...candidate,
      bridgeMedia: {
        ...candidate.bridgeMedia,
        video: { attachmentId: videoId, posterAttachmentId: videoId },
      },
    }),
  ).toBeUndefined();
});

it.each(['declared', 'streamed'] as const)(
  'bounds %s media bytes before retaining an object URL',
  async (size) => {
    const body = size === 'streamed' ? new Uint8Array(25 * 1024 * 1024 + 1) : new Uint8Array([1]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, {
            headers: {
              'content-type': 'video/mp4',
              ...(size === 'declared' ? { 'content-length': String(25 * 1024 * 1024 + 1) } : {}),
            },
          }),
      ),
    );
    const created = urls();
    const resource = createBridgeVideoResource('channel', 'source', videoId);
    const stop = resource.subscribe(() => {});
    try {
      await resource.prepare();
      expect(resource.getSnapshot()).toEqual({ loading: false, failure: 'tooLarge' });
      expect(created.create).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  },
);
