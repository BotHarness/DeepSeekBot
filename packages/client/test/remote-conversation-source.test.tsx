// @vitest-environment jsdom
import { act, createElement, forwardRef, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RemoteHosts, RemoteConversationTarget } from '../src/client/remote-hosts.js';
const fixture = vi.hoisted(() => ({ sources: undefined as RemoteHosts | undefined }));
vi.mock('../src/client/remote-hosts.js', async (original) => ({
  ...(await original<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => fixture.sources!,
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;
  const { Menu } = await import('./activity-list-test-controls.js');
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    IconWarningTriangleOutlineRegular: () => null,
    IconCodeOutlineRegular: () => null,
    IconStopFillRegular: () => null,
    IconPlayOutlineRegular: () => null,
    IconPauseOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: PropsWithChildren<{ variant?: string; size?: string }>) =>
      createElement('button', props, children),
    Toast: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconDownloadOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconGoalOutlineRegular: stub,
    IconChecklistOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconUserOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    HoverCard: ({ anchor }: PropsWithChildren<{ anchor: unknown }>) =>
      createElement('span', { 'data-hover-card': 'author' }, anchor as never),
    fileSizeText: (size: number) => `${size} B`,
    ImageLightbox: stub,
    Input: stub,
    Menu,
    MenuItemButton: stub,
    MenuSurface: forwardRef<HTMLDivElement, PropsWithChildren>((props, ref) =>
      createElement('div', { ...props, ref }),
    ),
    MarkdownText: ({ text }: { text: string }) => createElement('span', null, text),
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createActions } from '../src/client/actions.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { BotMain } from '../src/client/bot-main.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { clearConversationDrafts } from '../src/client/conversation-draft.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  clearConversationDrafts();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearConversationDrafts();
});
const first: RemoteConversationTarget = { hostId: 'b', channelId: 'shared', title: 'Shared B' };
const other: RemoteConversationTarget = { hostId: 'c', channelId: 'shared', title: 'Shared C' };
const at = '2026-11-14T12:00:00.000Z';
async function mount(
  configure?: (host: FakeHost, id: string) => void,
  bots = true,
  globalProbe = false,
) {
  if (globalProbe)
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      onchange: null,
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    }));
  const previous = store.getSnapshot();
  store.setMode('bot');
  store.setRoster([], []);
  store.select(undefined);
  const hosts = { b: new FakeHost(), c: new FakeHost() };
  for (const [id, host] of Object.entries(hosts)) {
    const channels = ['shared', 'other'].map((channelId) => ({
      id: channelId,
      type: 'group',
      name: 'Shared ' + id.toUpperCase(),
      members: bots ? ['ada'] : [],
      humanMembers: [
        { humanId: 'self-' + id, displayName: 'Self ' + id },
        { humanId: 'human-other', displayName: 'Human B' },
      ],
      createdAt: at,
      updatedAt: at,
    }));
    host.methods.set('humanAttention', () => ({ items: [], queryVersion: 1 }));
    host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
    host.methods.set('channelMarkRead', () => ({ accepted: true }));
    host.methods.set('channelReadPosition', () => ({}));
    host.methods.set('messageAttachmentTarget', () => ({
      target: { path: '/host/asset', relativePath: 'asset', kind: 'file' },
    }));
    host.methods.set('composerIdentity', () => ({
      hostId: 'shared-composer-machine',
      profileId: 'profile-' + id,
      humanId: 'self-' + id,
    }));
    host.methods.set('channels', () => ({ channels }));
    host.methods.set('rosterGet', () => ({
      pins: [],
      hidden: [],
      muted: [],
      sections: [],
      sectionOrder: [],
    }));
    host.methods.set('list', () => ({
      bots: bots
        ? [
            {
              slug: 'ada',
              displayName: 'Ada ' + id,
              roles: [],
              aggregateState: 'idle',
              workspaces: [],
              createdAt: at,
            },
          ]
        : [],
    }));
    host.methods.set('channelTimeline', (args) => ({
      revision: host.channel(String(args.channelId)).revision,
      page: {
        entries: host.channel(String(args.channelId)).messages,
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
      },
    }));
    host.methods.set('channelFilesPage', () => ({ entries: [] }));
    host.methods.set('channelAveragePerf', () => ({}));
    host.methods.set('channelAllBotPreview', () => ({ recipients: [], excluded: [] }));
    host.channel('shared');
    host.channel('other');
    configure?.(host, id);
  }
  const routed = (url: string) => (new URL(url).hostname === 'b.test.ts.net' ? hosts.b : hosts.c);
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
                routes: ['https://' + id + '.test.ts.net'],
                deviceId: 'device-1',
                credential: host.credential,
              })),
            )
          : null,
      setItem() {},
      removeItem() {},
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
  const localCall = vi.fn(async () => ({ ok: true as const, value: {} }));
  const actions = createActions(localCall, store);
  const sidebar = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) sidebar.register(entry);
  const prefs = new BotModePrefs();
  const panels = globalProbe ? createDockPanelRegistry() : undefined;
  panels?.register({
    id: 'sessions',
    title: 'Global probe',
    icon: 'hash',
    scope: 'global',
    component: () => createElement('input', { 'data-global-probe': '', defaultValue: 'untouched' }),
  });
  await act(async () =>
    root.render(
      <BotMain
        actions={actions}
        prefs={prefs}
        channelSidebar={sidebar}
        dockPanels={panels}
        t={zhTranslate}
      />,
    ),
  );
  const input = () => element.querySelector<HTMLElement>('.bh-composer-input')!;
  const text = () =>
    input() instanceof HTMLTextAreaElement
      ? (input() as HTMLTextAreaElement).value
      : (input().textContent ?? '');
  await act(async () => {
    await vi.waitFor(() => expect(input(), element.textContent ?? '').not.toBeNull());
  });
  return {
    hosts,
    sources,
    element,
    input,
    text,
    localCall,
    async type(text: string) {
      await act(async () => {
        const editor = input();
        if (editor instanceof HTMLTextAreaElement)
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
            editor,
            text,
          );
        else editor.textContent = text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    async open(target: RemoteConversationTarget) {
      await act(async () => {
        sources.open(target);
        await vi.waitFor(() => expect(input()).not.toBeNull());
      });
    },
    async send() {
      await act(async () =>
        element
          .querySelector<HTMLButtonElement>('[aria-label="' + zhTranslate('composer.send') + '"]')!
          .click(),
      );
    },
    async close() {
      await act(async () => root.unmount());
      release();
      prefs.dispose();
      element.remove();
      fixture.sources = undefined;
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setMode(previous.mode);
    },
  };
}
it('renders the native group header and self, other Human and Bot messages in their original alignment', async () => {
  const view = await mount((host, id) => {
    host.channel('shared').append({
      id: 'self',
      body: 'Self wrote ' + id,
      author: { kind: 'human', humanId: 'self-' + id },
    });
    host.channel('shared').append({
      id: 'human-other',
      body: 'Other Human wrote',
      author: { kind: 'human', humanId: 'human-other', displayName: 'Human B' },
      deliveries: [{ botSlug: 'ada', state: 'running' }],
    });
    host
      .channel('shared')
      .append({ id: 'bot', body: 'Bot wrote', author: { kind: 'bot', slug: 'ada' } });
  });
  try {
    expect(view.element.textContent).toContain('Shared B');
    expect(view.element.querySelector('.bh-chat-pane')).not.toBeNull();
    const mine = (id: string) =>
      view.element
        .querySelector('[data-message-id="' + id + '"]')
        ?.closest('.bh-message-group')
        ?.classList.contains('bh-message-group-me');
    expect(mine('self')).toBe(true);
    expect(mine('human-other')).toBe(false);
    expect(mine('bot')).toBe(false);
    const groupOf = (id: string) =>
      view.element.querySelector('[data-message-id="' + id + '"]')?.closest('.bh-message-group');
    expect(
      groupOf('human-other')
        ?.querySelector('.bh-message-group-human-avatar')
        ?.getAttribute('aria-label'),
    ).toBe('Human B');
    expect(groupOf('self')?.querySelector('.bh-message-group-avatar')).toBeNull();
    expect(groupOf('bot')?.querySelector('.bh-message-group-avatar')).not.toBeNull();
    expect(view.element.textContent).toContain('Human B');
    expect(
      view.element
        .querySelector('[data-message-id="human-other"]')
        ?.querySelector('[data-message-reading]')
        ?.getAttribute('aria-label'),
    ).toContain('Ada b');
    expect(view.element.querySelector('[data-remote-conversation]')).toBeNull();
    expect(view.element.querySelector('[data-remote-composer]')).toBeNull();
    expect(store.getSnapshot().channels).toEqual([]);
    expect(view.localCall.mock.calls).toEqual([]);
  } finally {
    await view.close();
  }
});

it('keeps Human DM edges free of group avatars and uses a Human empty hint', async () => {
  const view = await mount((host, id) => {
    host.methods.set('channels', () => ({
      channels: [
        {
          id: 'shared',
          type: 'dm',
          name: 'Human B',
          members: [],
          humanParticipants: ['self-' + id, 'human-other'],
          humanMembers: [{ humanId: 'human-other', displayName: 'Human B' }],
          createdAt: at,
          updatedAt: at,
        },
      ],
    }));
    if (id === 'c')
      host.channel('shared').append({
        id: 'other-dm',
        body: 'Human DM reply',
        author: { kind: 'human', humanId: 'human-other', displayName: 'Human B' },
      });
  }, false);
  try {
    await act(async () =>
      vi.waitFor(() =>
        expect(view.element.textContent).toContain(zhTranslate('main.humanChat.hint')),
      ),
    );
    await view.open(other);
    await act(async () =>
      vi.waitFor(() => expect(view.element.textContent).toContain('Human DM reply')),
    );
    expect(view.element.querySelector('.bh-message-group-avatar')).toBeNull();
    expect(view.element.querySelector('.bh-message-group-me')).toBeNull();
  } finally {
    await view.close();
  }
});

it('keeps the global dock and its local input mounted while switching remote Host conversations', async () => {
  const view = await mount(undefined, true, true);
  try {
    const dock = view.element.querySelector('.bh-dock');
    const input = view.element.querySelector<HTMLInputElement>('[data-global-probe]')!;
    expect(input).not.toBeNull();
    input.value = 'Local settings draft';
    await view.open(other);
    expect(view.element.querySelector('.bh-dock')).toBe(dock);
    expect(view.element.querySelector('[data-global-probe]')).toBe(input);
    expect(input.value).toBe('Local settings draft');
  } finally {
    await view.close();
  }
});

it('exposes an initial identity read failure and retries without sending or changing the target', async () => {
  let reads = 0;
  const view = await mount((host, id) => {
    if (id !== 'b') return;
    host.methods.set('composerIdentity', () =>
      ++reads === 1
        ? {}
        : {
            hostId: 'shared-composer-machine',
            profileId: 'profile-b',
            humanId: 'self-b',
          },
    );
    host.channel('shared').append({ id: 'recovered', body: 'Recovered first read' });
  });
  try {
    await act(async () =>
      vi.waitFor(() =>
        expect(view.element.querySelector('.bh-session-failure-details')?.textContent).toContain(
          'remote-composer-identity-unavailable',
        ),
      ),
    );
    expect(view.sources.getSnapshot().open).toEqual(first);
    const alert = view.element.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.querySelector('details')).toBeNull();
    await act(async () => alert!.parentElement!.querySelector('button')!.click());
    await act(async () =>
      vi.waitFor(() => expect(view.element.textContent).toContain('Recovered first read')),
    );
    expect(view.sources.getSnapshot().open).toEqual(first);
    expect(view.hosts.b.calls.some((c) => c.method === 'channelSend')).toBe(false);
  } finally {
    await view.close();
  }
});

it('retries hydration when reconnect happens before the earlier read settles', async () => {
  let reads = 0;
  let rejectFirst!: (error: Error) => void;
  const pending = new Promise<never>((_, reject) => {
    rejectFirst = reject;
  });
  const view = await mount((host, id) => {
    if (id !== 'b') return;
    host.methods.set('composerIdentity', () =>
      ++reads === 1
        ? pending
        : {
            hostId: 'shared-composer-machine',
            profileId: 'profile-b',
            humanId: 'self-b',
          },
    );
    host.channel('shared').append({ id: 'reconnected', body: 'Hydrated after reconnect race' });
  });
  try {
    await vi.waitFor(() => expect(reads).toBe(1));
    const client = view.sources.client('b')!;
    await act(async () => {
      view.hosts.b.kill();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).not.toBe('connected'));
      view.hosts.b.restart();
      client.retryNow();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'), {
        timeout: 5000,
      });
      rejectFirst(new Error('Earlier read failed after reconnect'));
    });
    await act(async () =>
      vi.waitFor(() => expect(view.element.textContent).toContain('Hydrated after reconnect race')),
    );
    expect(reads).toBe(2);
  } finally {
    rejectFirst(new Error('Test source closed'));
    await view.close();
  }
});

it('applies every typed purge placement above a 100-item boundary only to its owning Host', async () => {
  const view = await mount((host) => {
    host.channel('shared').append({ id: 'purge-0', body: 'First batch private content' });
    host.channel('shared').append({ id: 'purge-100', body: 'Last batch private content' });
  });
  try {
    await act(async () =>
      vi.waitFor(() => expect(view.element.textContent).toContain('Last batch private content')),
    );
    await act(async () => {
      expect(
        view.hosts.b.push('botharness/followRoster', {
          type: 'purged',
          placements: Array.from({ length: 101 }, (_, i) => ({
            sourceEventId: 'source-' + i,
            channelId: 'shared',
            messageId: 'purge-' + i,
          })),
        }),
      ).toBe(true);
    });
    expect(view.element.textContent).not.toContain('First batch private content');
    expect(view.element.textContent).not.toContain('Last batch private content');
    await view.open(other);
    await act(async () =>
      vi.waitFor(() => expect(view.element.textContent).toContain('Last batch private content')),
    );
    expect(view.element.textContent).toContain('First batch private content');
  } finally {
    await view.close();
  }
});

it('rejects offline file drops before inserting an uploading item and keeps the draft sendable after reconnect', async () => {
  const view = await mount(undefined, false);
  try {
    await view.type('Retained offline draft');
    const client = view.sources.client('b')!;
    await act(async () => {
      view.hosts.b.kill();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).not.toBe('connected'));
    });
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], files: [new File(['private'], 'offline.txt')], getData: () => '' },
    });
    await act(async () => {
      view.element.querySelector('.bh-chat-pane')!.dispatchEvent(event);
    });
    expect(view.text()).toBe('Retained offline draft');
    expect(view.element.querySelector('[data-attachment-card]')).toBeNull();
    expect(view.hosts.b.uploads).toEqual([]);
    await act(async () => {
      view.hosts.b.restart();
      client.retryNow();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    });
    await view.send();
    await vi.waitFor(() =>
      expect(
        view.hosts.b.channel('shared').messages.some((m) => m.body === 'Retained offline draft'),
      ).toBe(true),
    );
  } finally {
    await view.close();
  }
});

it('keeps navigation inside the target Host when the connection returns', async () => {
  const view = await mount((host) => {
    host
      .channel('shared')
      .append({ id: 'bot', body: 'Open my native DM', author: { kind: 'bot', slug: 'ada' } });
  });
  try {
    await act(async () =>
      vi.waitFor(() =>
        expect(view.element.querySelector('.bh-message-group-avatar-link')).not.toBeNull(),
      ),
    );
    await act(async () =>
      view.element.querySelector<HTMLButtonElement>('.bh-message-group-avatar-link')!.click(),
    );
    await act(async () =>
      vi.waitFor(() => expect(view.input().getAttribute('aria-label')).toContain('Ada b')),
    );
    const client = view.sources.client('b')!;
    await act(async () => {
      view.hosts.b.kill();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).not.toBe('connected'));
      view.hosts.b.restart();
      client.retryNow();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    });
    await act(async () =>
      vi.waitFor(() => expect(view.input().getAttribute('aria-label')).toContain('Ada b')),
    );
    expect(view.element.querySelector('[data-message-id="bot"]')).toBeNull();
  } finally {
    await view.close();
  }
});

it('keeps the native input and generic channel controls without Bot-only composer context for Human-only conversations', async () => {
  const view = await mount(undefined, false);
  try {
    expect(view.input()).not.toBeNull();
    expect(view.element.textContent).toContain('Shared B');
    expect(view.element.querySelector('[data-composer-context]')).toBeNull();
    expect(view.element.querySelector('.bh-call-control')).toBeNull();
    await view.type('Human-only draft');
    expect(view.text()).toBe('Human-only draft');
  } finally {
    await view.close();
  }
});

function mediaSpies(pending = false, mime = 'image/png') {
  let serial = 0;
  const make = vi.fn(() => 'blob:native-' + ++serial);
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = make;
      static override revokeObjectURL = revoke;
    },
  );
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi.fn((_url: string, _init?: RequestInit) =>
    pending
      ? response
      : Promise.resolve(new Response('media', { headers: { 'content-type': mime } })),
  );
  vi.stubGlobal('fetch', fetcher);
  return { make, revoke, fetcher, resolve };
}
function attachment(host: FakeHost, mime = 'image/png') {
  host.channel('shared').append({
    id: 'media',
    body: 'Native source attachment',
    attachments: [
      { fileId: 'file:11111111-1111-4111-8111-111111111111', name: 'asset', mime, size: 5 },
    ],
  });
}
it('reads native message images only from the owning Host and releases their object URLs on source switch and unmount', async () => {
  const media = mediaSpies();
  const view = await mount((host) => attachment(host));
  try {
    await act(async () => {
      await vi.waitFor(() => expect(media.make).toHaveBeenCalledTimes(1));
    });
    expect(view.element.querySelector('img[src="blob:native-1"]')).not.toBeNull();
    expect(media.fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('https://b.test.ts.net/botharness-device/api/botharness/attachment'),
      expect.objectContaining({
        credentials: 'omit',
        headers: { authorization: 'Device ' + view.hosts.b.credential },
      }),
    );
    await view.open(other);
    await act(async () => {
      await vi.waitFor(() => expect(media.make).toHaveBeenCalledTimes(2));
    });
    expect(media.revoke).toHaveBeenCalledWith('blob:native-1');
    expect(media.fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('https://c.test.ts.net/botharness-device/api/botharness/attachment'),
      expect.objectContaining({
        credentials: 'omit',
        headers: { authorization: 'Device ' + view.hosts.c.credential },
      }),
    );
  } finally {
    await view.close();
  }
  expect(media.revoke).toHaveBeenCalledWith('blob:native-2');
});

it('loads native audio only on play, keeps a single play intent through editing and releases it on unmount', async () => {
  const media = mediaSpies(false, 'audio/mpeg');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const view = await mount((host) => attachment(host, 'audio/mpeg'));
  try {
    expect(media.fetcher).not.toHaveBeenCalled();
    const button = view.element.querySelector<HTMLButtonElement>('.bh-message-audio-play')!;
    expect(button).not.toBeNull();
    await act(async () => {
      button.click();
      button.click();
    });
    await act(async () => {
      await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    });
    expect(media.fetcher).toHaveBeenCalledOnce();
    await view.type('Still editing');
    expect(play).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
  expect(media.revoke).toHaveBeenCalledWith('blob:native-1');
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

it('keeps an in-flight send on its owning Host when another same-ID Channel becomes active', async () => {
  const view = await mount();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  view.hosts.b.methods.set('channelSend', async (args) => {
    await pending;
    const channel = view.hosts.b.channel(String(args.channelId));
    channel.append({
      id: String(args.messageId),
      body: String(args.body),
      author: { kind: 'human', humanId: 'self-b' },
    });
    return { message: channel.messages.at(-1) };
  });
  try {
    await view.type('Only B receives this');
    await view.send();
    await vi.waitFor(() =>
      expect(view.hosts.b.calls.filter((row) => row.method === 'channelSend')).toHaveLength(1),
    );
    await view.open(other);
    await view.type('C keeps its draft');
    await act(async () => {
      release();
      await vi.waitFor(() =>
        expect(
          view.hosts.b
            .channel('shared')
            .messages.some((message) => message.body === 'Only B receives this'),
        ).toBe(true),
      );
    });
    expect(view.text()).toBe('C keeps its draft');
    expect(view.element.textContent).not.toContain('Only B receives this');
    expect(view.hosts.c.calls.filter((row) => row.method === 'channelSend')).toEqual([]);
  } finally {
    release();
    await view.close();
  }
});

it.each(['switch', 'revoke', 'close'] as const)(
  'cancels a pending native download on %s and ignores its late completion',
  async (end) => {
    const media = mediaSpies(true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const view = await mount((host) => attachment(host, 'application/pdf'));
    try {
      expect(media.fetcher).not.toHaveBeenCalled();
      await act(async () =>
        view.element
          .querySelector('.bh-message-attachment')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })),
      );
      const button = () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
          (node) => node.textContent === zhTranslate('fileAction.download'),
        );
      await act(async () => {
        await vi.waitFor(() => expect(button()).toBeDefined());
      });
      await act(async () => button()!.click());
      expect(media.fetcher).toHaveBeenCalledTimes(1);
      const signal = media.fetcher.mock.calls[0]![1]!.signal!;
      if (end === 'switch') await view.open(other);
      else if (end === 'close') await act(async () => view.sources.close());
      else
        await act(async () => {
          view.hosts.b.revoke();
          await view.sources
            .client('b')!
            .call('channelUnreadCounts', {})
            .catch(() => undefined);
        });
      expect(signal.aborted).toBe(true);
      await act(async () => media.resolve(new Response('late file')));
      expect(media.make).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);
it('isolates same-ID Host drafts and retains editing when only the same source title changes', async () => {
  const view = await mount();
  try {
    await view.type('Only for B');
    const editor = view.input();
    await view.open({ ...first, title: 'Renamed B' });
    expect(view.input()).toBe(editor);
    expect(view.text()).toBe('Only for B');
    await view.open(other);
    expect(view.input()).not.toBe(editor);
    expect(view.text()).toBe('');
    await view.type('Only for C');
    await view.open(first);
    expect(view.text()).toBe('Only for B');
    expect(view.hosts.b.calls.filter((row) => row.method === 'channelSend')).toEqual([]);
    expect(view.hosts.c.calls.filter((row) => row.method === 'channelSend')).toEqual([]);
  } finally {
    await view.close();
  }
});
