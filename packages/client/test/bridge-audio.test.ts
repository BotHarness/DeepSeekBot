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
    await act(async () => {
      container.querySelector('button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched.mock.calls[0]?.[0]).toContain('representation=playback');
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:voice');
    expect(container.querySelector('audio')?.getAttribute('preload')).toBe('none');
    expect(container.querySelector('audio')?.getAttribute('aria-label')).toBe('语音播放器');
    expect(container.querySelector('audio')?.hasAttribute('autoplay')).toBe(false);
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
