// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteHosts, RemoteConversationTarget } from '../src/client/remote-hosts.js';

const fixture = vi.hoisted(() => ({ sources: undefined as RemoteHosts | undefined }));
vi.mock('../src/client/remote-hosts.js', async (original) => ({
  ...(await original<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => fixture.sources!,
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children?: ReactNode;
    variant?: string;
    size?: string;
  }) => createElement('button', props, children),
  MarkdownText: ({ text }: { text: string }) => createElement('span', null, text),
  FileTypeIcon: () => null,
  IconDownloadOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  fileSizeText: (size: number) => String(size),
  StateDot: () => null,
  Input: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});

import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createActions } from '../src/client/actions.js';
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const first: RemoteConversationTarget = { hostId: 'b', channelId: 'shared', title: 'First' };
const targets = [
  { hostId: 'c', channelId: 'shared', title: 'Other Host' },
  { hostId: 'b', channelId: 'other', title: 'Other Channel' },
];

async function mount(surface: 'activity' | 'dock', configure?: (host: FakeHost) => void) {
  const hosts = { b: new FakeHost(), c: new FakeHost() };
  for (const host of Object.values(hosts)) {
    host.methods.set('humanAttention', () => ({ items: [], queryVersion: 1 }));
    host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
    host.methods.set('channelMarkRead', () => ({ accepted: true }));
    host.channel('shared');
    host.channel('other');
    configure?.(host);
  }
  const routed = (url: string) => (new URL(url).hostname === 'b.test' ? hosts.b : hosts.c);
  const sources = createRemoteHosts({
    carrier: {
      request: (url, init) => routed(url).carrier.request(url, init),
      openSocket: (url, events, headers) => routed(url).carrier.openSocket(url, events, headers),
    },
    storage: {
      getItem: (key) =>
        key === REMOTE_HOSTS_STORAGE_KEY
          ? JSON.stringify(
              Object.entries(hosts).map(([id, host]) => ({
                hostId: id,
                hostName: id,
                routes: [`https://${id}.test`],
                deviceId: 'device-1',
                credential: host.credential,
              })),
            )
          : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
  fixture.sources = sources;
  const release = sources.subscribe(() => {});
  await vi.waitFor(() =>
    expect(sources.getSnapshot().hosts.every((host) => host.inbox.status === 'ready')).toBe(true),
  );
  sources.open(first);
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const actions = createActions(async () => ({ ok: true, value: { items: [] } }), store);
  await act(async () =>
    root.render(
      surface === 'activity' ? (
        <ActivityCenterView actions={actions} t={zhTranslate} />
      ) : (
        <ChannelDock
          body={null}
          panels={[]}
          entryProps={undefined}
          shows={() => true}
          t={zhTranslate}
          storage={{ getItem: () => null, setItem: () => {}, removeItem: () => {} }}
        />
      ),
    ),
  );
  const input = () => element.querySelector<HTMLTextAreaElement>('[data-remote-composer]')!;
  return {
    hosts,
    sources,
    element,
    input,
    async type(body: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input(),
          body,
        );
        input().dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    async open(target: RemoteConversationTarget) {
      await act(async () => sources.open(target));
    },
    async send() {
      await act(async () => {
        input().form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    },
    async close() {
      await act(async () => root.unmount());
      release();
      element.remove();
      fixture.sources = undefined;
    },
  };
}

it.each(['activity', 'dock'] as const)(
  '%s switches the real viewer and full message body without retaining media across sources',
  async (surface) => {
    let serial = 0;
    const make = vi.fn(() => `blob:source-${++serial}`);
    const release = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = make;
        static override revokeObjectURL = release;
      },
    );
    const fetcher = vi.fn(
      async () => new Response('image', { headers: { 'content-type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    const viewerRequests: string[] = [];
    const view = await mount(surface, (host) => {
      host.methods.set('list', () => ({
        bots: [{ slug: 'ada', displayName: 'Ada', browserAccess: true, aggregateState: 'idle' }],
      }));
      host.methods.set('channelDm', () => ({ channel: { id: 'dm-ada' } }));
      host.channel('dm-ada').append({
        id: 'media',
        body: 'Full source body',
        attachments: [
          {
            fileId: 'file:11111111-1111-4111-8111-111111111111',
            name: 'photo.png',
            mime: 'image/png',
            size: 5,
          },
        ],
      });
      const request = host.carrier.request;
      host.carrier.request = (url, init) => {
        if (url.includes('/browser/')) {
          viewerRequests.push(url);
          return Promise.resolve({ status: 403, text: async () => '{"error":"no-access"}' });
        }
        return request(url, init);
      };
    });
    const clickViewer = async () => {
      const button = view.element.querySelector<HTMLButtonElement>(
        `[aria-label="${zhTranslate('remoteViewer.browser')}"]`,
      );
      expect(button).not.toBeNull();
      await act(async () => button!.click());
    };
    try {
      await view.open({ hostId: 'b', botSlug: 'ada', title: 'Ada B' });
      await act(async () => {
        await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(1));
      });
      expect(view.element.textContent).toContain('Full source body');
      expect(view.element.querySelector('img[src="blob:source-1"]')).not.toBeNull();
      expect(fetcher).toHaveBeenLastCalledWith(
        expect.stringContaining('https://b.test/botharness-device/api/botharness/attachment'),
        expect.objectContaining({
          credentials: 'omit',
          headers: { authorization: `Device ${view.hosts.b.credential}` },
        }),
      );
      await view.type('Draft stays on B');
      await clickViewer();
      expect(view.element.querySelector('[data-remote-viewer="browser"]')).not.toBeNull();
      expect(view.element.querySelector('[data-remote-timeline]')).toBeNull();
      expect(release).toHaveBeenCalledWith('blob:source-1');
      expect(viewerRequests.length).toBeGreaterThan(0);
      expect(viewerRequests.every((url) => url.startsWith('https://b.test/'))).toBe(true);
      await clickViewer();
      await act(async () => {
        await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(2));
      });
      expect(view.input().value).toBe('Draft stays on B');
      expect(view.element.querySelector('img[src="blob:source-2"]')).not.toBeNull();
      await clickViewer();
      expect(release).toHaveBeenCalledWith('blob:source-2');
      await view.open({ hostId: 'c', botSlug: 'ada', title: 'Ada C' });
      await act(async () => {
        await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(3));
      });
      expect(view.element.querySelector('[data-remote-viewer]')).toBeNull();
      expect(view.input().value).toBe('');
      expect(fetcher).toHaveBeenLastCalledWith(
        expect.stringContaining('https://c.test/botharness-device/api/botharness/attachment'),
        expect.anything(),
      );
    } finally {
      await view.close();
    }
    expect(release).toHaveBeenCalledWith('blob:source-3');
  },
);

describe.each(['activity', 'dock'] as const)('%s remote conversation source', (surface) => {
  it.each(targets)('does not send a previous draft to $hostId / $channelId', async (target) => {
    const view = await mount(surface);
    try {
      await view.type('Only for B / shared');
      expect(view.input().value).toBe('Only for B / shared');
      await view.open(target);
      await view.send();
      expect(view.hosts.b.calls.filter(({ method }) => method === 'channelSend')).toEqual([]);
      expect(view.hosts.c.calls.filter(({ method }) => method === 'channelSend')).toEqual([]);
      expect(view.input().value).toBe('');
      expect(view.element.querySelector<HTMLButtonElement>('[data-remote-send]')!.disabled).toBe(
        true,
      );
    } finally {
      await view.close();
    }
  });

  it('preserves editing when the same source title and messages update', async () => {
    const view = await mount(surface);
    try {
      await view.type('Still editing');
      const input = view.input();
      await view.open({ ...first, title: 'Renamed' });
      await act(async () => {
        view.hosts.b.channel('shared').append({ id: 'incoming', body: 'New message' });
      });
      expect(view.input()).toBe(input);
      expect(view.input().value).toBe('Still editing');
      expect(view.element.textContent).toContain('New message');
      expect(
        view.element.querySelector('[data-remote-conversation]')?.getAttribute('aria-label'),
      ).toBe('Renamed');
    } finally {
      await view.close();
    }
  });

  it.each(targets)(
    'keeps an old send completion in its source after switching to $hostId / $channelId',
    async (target) => {
      const view = await mount(surface);
      let complete!: () => void;
      const pending = new Promise<void>((resolve) => {
        complete = resolve;
      });
      view.hosts.b.methods.set('channelSend', async (args) => {
        await pending;
        view.hosts.b.channel(String(args.channelId)).append({
          id: String(args.messageId),
          body: String(args.body),
        });
        return { accepted: true };
      });
      try {
        await view.type('Send only to B / shared');
        await view.send();
        expect(view.hosts.b.calls.filter(({ method }) => method === 'channelSend')).toHaveLength(1);
        await view.open(target);
        await view.type('New target draft');
        await act(async () => {
          complete();
          await vi.waitFor(() =>
            expect(view.sources.conversation(first)?.getSnapshot().messages[0]?.delivery).toBe(
              'committed',
            ),
          );
        });
        expect(view.input().value).toBe('New target draft');
        expect(view.element.textContent).not.toContain('Send only to B / shared');
        expect(view.hosts.b.calls.filter(({ method }) => method === 'channelSend')).toEqual([
          {
            method: 'channelSend',
            args: expect.objectContaining({ channelId: 'shared', body: 'Send only to B / shared' }),
          },
        ]);
        expect(view.hosts.c.calls.filter(({ method }) => method === 'channelSend')).toEqual([]);
        expect(view.sources.getSnapshot().open).toEqual(target);
      } finally {
        complete();
        await view.close();
      }
    },
  );
});
