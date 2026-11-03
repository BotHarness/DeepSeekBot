// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tag: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Modal: () => null,
  FileTypeIcon: () => null,
  MarkdownText: () => null,
  StateDot: () => null,
  IconDownloadOutlineRegular: () => null,
  IconPlayOutlineRegular: () => null,
  IconPauseOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  fileSizeText: (size: number) => `${size} B`,
}));
vi.mock('../src/client/messaging-defaults-live.js', () => ({
  subscribeMessagingDefaults: () => () => {},
}));
it('Channel voice exposes original download and prepares playback only on explicit action without autoplay', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fetched = vi.fn(
    async (_url: string, _options?: RequestInit) =>
      new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'audio/wav' } }),
  );
  vi.stubGlobal('fetch', fetched);
  const createUrl = vi.fn(() => 'blob:voice');
  const revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl;
      static override revokeObjectURL = revokeUrl;
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    const message = parseChannelMessage({
      id: 'source',
      at: '2026-10-08T00:00:00.000Z',
      body: 'spoken question',
      format: 'text',
      author: { kind: 'bridged', source: 'Human' },
      bridgeOrigin: {
        sourceEventId: 'source',
        platform: 'qq',
        conversationId: 'group',
        conversationName: 'Group',
        messageId: 'native-message',
        senderId: 'human',
      },
      bridgeMedia: {
        voice: { transcript: 'platform' },
        items: [{ kind: 'audio', id: 'a'.repeat(64), name: 'voice.silk' }],
      },
    });
    expect(message).toBeDefined();
    await act(async () =>
      root.render(
        createElement(ChannelMessageBody, {
          message: message!,
          channelId: 'group-local',
          t: zhTranslate,
        }),
      ),
    );
    expect(container.textContent).toContain('平台转写');
    expect(container.querySelector('a[download]')?.getAttribute('href')).toContain(
      'channelId=group-local',
    );
    expect(container.querySelector('a[download]')?.getAttribute('href')).not.toContain(
      'representation',
    );
    expect(fetched).not.toHaveBeenCalled();
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('.bh-message-audio-play')?.hasAttribute('disabled')).toBe(true);
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === '准备播放')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched.mock.calls[0]?.[0]).toContain('representation=playback');
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:voice');
    expect(container.querySelector('audio')?.getAttribute('preload')).toBe('metadata');
    expect(container.querySelector('audio')?.getAttribute('aria-label')).toBe(
      '音频播放器: voice.silk',
    );
    expect(container.querySelector('audio')?.hasAttribute('autoplay')).toBe(false);
    expect(container.querySelector('a[download]')?.getAttribute('href')).not.toContain('blob:');
    expect(container.querySelector('a[download]')?.getAttribute('href')).not.toContain(
      'representation',
    );
    expect(container.querySelector('.bh-message-audio-play')?.hasAttribute('disabled')).toBe(false);
    await act(async () => container.querySelector('audio')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('a[download]')?.getAttribute('href')).toContain(
      'sourceEventId=source',
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
  expect(revokeUrl).toHaveBeenCalledWith('blob:voice');
});
import { createBridgeAudioResource } from '../src/client/bridge-audio-resource.js';

it.each([
  [403, 'unavailable'],
  [413, 'tooLarge'],
  [422, 'format'],
] as const)('refused playback reports %s without retaining audio', async (status, failure) => {
  const fetched = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal('fetch', fetched);
  const resource = createBridgeAudioResource('channel', 'source', 'attachment');
  const unsubscribe = resource.subscribe(() => {});
  try {
    await resource.prepare();
    expect(resource.getSnapshot()).toEqual({ failure });
  } finally {
    unsubscribe();
    vi.unstubAllGlobals();
  }
});

it('unmount aborts pending playback and discards a late response', async () => {
  let resolveResponse!: (response: Response) => void;
  let requestSignal: AbortSignal | null | undefined;
  const fetched = vi.fn((_url: string, options?: RequestInit) => {
    requestSignal = options?.signal;
    return new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
  });
  vi.stubGlobal('fetch', fetched);
  const resource = createBridgeAudioResource('channel', 'source', 'attachment');
  const unsubscribe = resource.subscribe(() => {});
  try {
    const prepared = resource.prepare();
    expect(resource.getSnapshot()).toEqual({ loading: true });
    unsubscribe();
    expect(requestSignal?.aborted).toBe(true);
    resolveResponse(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        headers: { 'content-type': 'audio/wav' },
      }),
    );
    await prepared;
    expect(resource.getSnapshot()).toEqual({});
  } finally {
    vi.unstubAllGlobals();
  }
});

it('accepts Lark voice media and refuses voice evidence from platforms without a checked audio path', () => {
  const message = (platform: string) =>
    parseChannelMessage({
      id: 'source',
      at: '2026-11-03T00:00:00.000Z',
      body: 'please listen',
      format: 'text',
      author: { kind: 'bridged', source: 'Human' },
      bridgeOrigin: {
        sourceEventId: 'source',
        platform,
        conversationId: 'group',
        conversationName: 'Group',
        messageId: 'native-message',
        senderId: 'human',
      },
      bridgeMedia: {
        voice: { transcript: 'unavailable', durationMs: 4916 },
        items: [{ kind: 'audio', id: 'a'.repeat(64), name: 'voice.opus' }],
      },
    });
  expect(message('feishu')?.bridgeMedia).toEqual({
    voice: { transcript: 'unavailable', durationMs: 4916 },
    items: [{ kind: 'audio', id: 'a'.repeat(64), name: 'voice.opus' }],
  });
  expect(message('discord')).toBeUndefined();
});
