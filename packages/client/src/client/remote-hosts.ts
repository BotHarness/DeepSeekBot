import { hostLooks } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  createHostClient,
  type HostClient,
  type HostSnapshot,
} from '../../../../apps/mobile/src/host/client.js';
import {
  createConversation,
  type Conversation,
} from '../../../../apps/mobile/src/host/conversation.js';
import {
  parseSavedHost,
  serializeSavedHost,
  type SavedHost,
} from '../../../../apps/mobile/src/host/hosts.js';
import {
  createInbox,
  prepareNotificationBaseline,
  type Inbox,
  type InboxSnapshot,
  observeInbox,
  type InboxQuery,
} from '../../../../apps/mobile/src/host/inbox.js';
import {
  DEVICE_PREFIX,
  parsePairingLink,
  redeemPairing,
  revokePairing,
  type PairingRefusal,
} from '../../../../apps/mobile/src/host/pairing.js';
import { store } from './store.js';
import { createRemoteActivityProjection, type RemoteBotActivity } from './remote-host-activity.js';
import { releaseRemoteHostViewers } from './remote-host-viewer.js';
import { browserNotificationApi } from './desktop-notifications.js';
import { createRemoteNotifications, type RemoteNotifications } from './remote-notifications.js';
import { en } from './locale.js';

export const REMOTE_HOSTS_STORAGE_KEY = 'botharness.remoteHosts.v1';
export const HOST_TAB_STORAGE_KEY = 'botharness.hostTab.v1';
export const ALL_HOSTS = 'all';
export const THIS_HOST = 'local';

export interface RemoteConversationTarget {
  hostId: string;
  title: string;
  botSlug?: string;
  channelId?: string;
}

export interface RemoteHost {
  host: SavedHost;
  snapshot: HostSnapshot;
  inbox: InboxSnapshot;
  activity?: ReadonlyMap<string, RemoteBotActivity>;
}

export interface RemoteHostsSnapshot {
  hosts: readonly RemoteHost[];
  avatars: ReadonlyMap<string, string>;
  tab: string;
  open?: RemoteConversationTarget;
}

export type HostPairResult =
  | { ok: true; host: SavedHost }
  | {
      ok: false;
      code:
        | PairingRefusal
        | 'already-paired'
        | 'pairing-in-progress'
        | 'this-host'
        | 'storage-failure'
        | 'cancelled';
    };

export interface RemotePairTrust {
  confirmFingerprint?: (fingerprint: string, hostName: string) => Promise<boolean>;
  onPending?: (fingerprint: string) => void;
  signal?: AbortSignal;
}

export interface RemoteHosts {
  notifications: RemoteNotifications;
  getSnapshot(): RemoteHostsSnapshot;
  subscribe(listener: () => void): () => void;
  pair(
    link: string,
    deviceName: string,
    localHostId?: string,
    trust?: RemotePairTrust,
  ): Promise<HostPairResult>;
  remove(hostId: string): Promise<void>;
  select(tab: string): void;
  open(target: RemoteConversationTarget): void;
  close(): void;
  conversation(target: RemoteConversationTarget): Conversation | undefined;
  markRead(target: RemoteConversationTarget, messageId: string): Promise<void>;
  activity(hostId: string, query?: InboxQuery): ReturnType<typeof observeInbox> | undefined;
  client(hostId: string): HostClient | undefined;
  viewerClient(hostId: string): HostClient | undefined;
}

export interface HostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function conversationKey(target: RemoteConversationTarget): string {
  return JSON.stringify([
    target.hostId,
    target.channelId === undefined ? 'bot' : 'channel',
    target.channelId ?? target.botSlug ?? '',
  ]);
}

function readHosts(storage: HostStorage | undefined): SavedHost[] {
  try {
    const value = JSON.parse(
      readStorage(storage, REMOTE_HOSTS_STORAGE_KEY, 'botharness.computers.v1') ?? '[]',
    ) as unknown;
    return Array.isArray(value) ? value.flatMap((entry) => parseSavedHost(entry) ?? []) : [];
  } catch {
    return [];
  }
}

function readStorage(storage: HostStorage | undefined, key: string, oldKey: string): string | null {
  const current = storage?.getItem(key);
  const previous = storage?.getItem(oldKey);
  if (previous == null) return current ?? null;
  try {
    if (current == null) storage?.setItem(key, previous);
    storage?.removeItem(oldKey);
  } catch {}
  return current ?? previous;
}

function readTab(storage: HostStorage | undefined): string {
  try {
    return readStorage(storage, HOST_TAB_STORAGE_KEY, 'botharness.computers.tab.v1') ?? ALL_HOSTS;
  } catch {
    return ALL_HOSTS;
  }
}

interface HostEntry {
  host: SavedHost;
  client: HostClient;
  release: () => void;
  inbox: { feed: Inbox; release: () => void } | undefined;
  retained: InboxSnapshot;
  activity: ReadonlyMap<string, RemoteBotActivity>;
}

const PAIR_FAILURES: ReadonlySet<string> = new Set([
  'unreachable',
  'no-route',
  'host-key-required',
]);
const idleInbox: InboxSnapshot = { status: 'idle' };
type NotificationTranslate = (key: 'remoteHosts.notifications.privateBody') => string;

export type RemoteHostTelemetry = (
  event: 'remote_host:host_pair_complete' | 'remote_host:conversation_open',
  properties?: { outcome: 'success' | 'refused' | 'failed' },
) => void;

export function createRemoteHosts(options: {
  storage?: HostStorage | undefined;
  record?: RemoteHostTelemetry;
  carrier: HostCarrier;
  loadImage?: (url: string, headers: Record<string, string>) => Promise<string | undefined>;
  releaseImage?: (image: string) => void;
  translate?: NotificationTranslate;
  hostName?: (hostId: string, fallback: string) => string;
}): RemoteHosts {
  const { storage, carrier, loadImage, releaseImage } = options;
  const record = options.record ?? (() => {});
  const listeners = new Set<() => void>();
  const clients = new Map<string, HostEntry>();
  const pairing = new Set<string>();
  const activity = new Map<string, ReturnType<typeof observeInbox>>();
  const conversations = new Map<string, Conversation>();
  const images = new Map<string, string>();
  const loading = new Map<string, symbol>();
  let avatars: ReadonlyMap<string, string> = new Map();
  let tab = readTab(storage);
  let open: RemoteConversationTarget | undefined;
  let snapshot: RemoteHostsSnapshot = { hosts: [], avatars, tab };
  const notifications = createRemoteNotifications({
    ...(options.hostName === undefined ? {} : { hostName: options.hostName }),
    storage,
    api: browserNotificationApi(),
    async prepareEnable(hostId, signal) {
      const entry = clients.get(hostId);
      const inbox = entry?.inbox?.feed;
      if (entry === undefined || inbox === undefined)
        throw new Error('notification-baseline-unavailable');
      await prepareNotificationBaseline(inbox, signal);
      if (
        clients.get(hostId) !== entry ||
        entry.inbox?.feed !== inbox ||
        entry.client.getSnapshot().connection.status !== 'connected'
      )
        throw new Error('notification-activation-cancelled');
    },
    privateBody: () =>
      options.translate?.('remoteHosts.notifications.privateBody') ??
      en['remoteHosts.notifications.privateBody'],
    open(target) {
      globalThis.window?.focus();
      open = target;
      record('remote_host:conversation_open');
      publish();
    },
  });

  const fetchAvatars = (hosts: readonly RemoteHost[]): void => {
    const wanted = new Map(
      hosts.flatMap(({ snapshot: host }) =>
        listeners.size === 0 || host.connection.status === 'refused'
          ? []
          : (host.roster?.bots ?? []).flatMap((bot) =>
              bot.avatarUrl === undefined
                ? []
                : [[bot.avatarUrl, bot.avatarHeaders ?? {}] as const],
            ),
      ),
    );
    for (const [url, image] of images) {
      if (wanted.has(url)) continue;
      images.delete(url);
      releaseImage?.(image);
      avatars = new Map(images);
    }
    for (const url of loading.keys()) if (!wanted.has(url)) loading.delete(url);
    if (loadImage === undefined) return;
    for (const [url, headers] of wanted) {
      if (images.has(url) || loading.has(url)) continue;
      const request = Symbol();
      loading.set(url, request);
      void loadImage(url, headers)
        .catch(() => undefined)
        .then((image) => {
          if (loading.get(url) !== request) {
            if (image !== undefined) releaseImage?.(image);
            return;
          }
          loading.delete(url);
          if (image === undefined) return;
          images.set(url, image);
          avatars = new Map(images);
          publish();
        });
    }
  };

  const publish = (): void => {
    const hosts = [...clients.values()].map(({ host, client, inbox, retained, activity }) => ({
      host,
      snapshot: client.getSnapshot(),
      inbox: inbox?.feed.getSnapshot() ?? retained,
      activity,
    }));
    fetchAvatars(hosts);
    if (listeners.size > 0) notifications.update(hosts);
    const known = tab === ALL_HOSTS || tab === THIS_HOST || clients.has(tab);
    snapshot = {
      hosts,
      avatars,
      tab: known ? tab : ALL_HOSTS,
      ...(open === undefined ? {} : { open }),
    };
    for (const listener of listeners) listener();
  };

  const start = (entry: HostEntry): void => {
    entry.client.start();
    if (entry.inbox !== undefined) return;
    const feed = createInbox(entry.client, { activity: true, notifications: true }, entry.retained);
    entry.inbox = { feed, release: feed.subscribe(publish) };
  };

  const stop = (entry: HostEntry): void => {
    entry.retained = entry.inbox?.feed.getSnapshot() ?? entry.retained;
    entry.inbox?.release();
    entry.inbox?.feed.stop();
    entry.inbox = undefined;
    entry.client.stop();
  };

  const save = (): void => {
    try {
      const hosts = [...clients.values()].map(({ host }) => serializeSavedHost(host));
      if (hosts.length === 0) storage?.removeItem(REMOTE_HOSTS_STORAGE_KEY);
      else storage?.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify(hosts));
    } catch {}
  };

  const attach = (host: SavedHost): void => {
    const client = createHostClient({
      ...host,
      routes: host.routes,
      credential: host.credential,
      carrier,
    });
    const projectActivity = createRemoteActivityProjection();
    const entry: HostEntry = {
      host,
      client,
      release: client.subscribe(() => {
        entry.activity = projectActivity(client.getSnapshot().roster?.bots ?? [], Date.now());
        publish();
      }),
      inbox: undefined,
      retained: idleInbox,
      activity: new Map(),
    };
    clients.set(host.hostId, entry);
    if (listeners.size > 0) start(entry);
  };

  for (const host of readHosts(storage)) attach(host);
  publish();

  const forget = (hostId: string): void => {
    const entry = clients.get(hostId);
    if (entry === undefined) return;
    notifications.forget(hostId);
    entry.release();
    stop(entry);
    clients.delete(hostId);
    activity.delete(hostId);
    for (const [key, conversation] of conversations)
      if ((JSON.parse(key) as string[])[0] === hostId) {
        conversation.stop();
        conversations.delete(key);
      }
    if (open?.hostId === hostId) open = undefined;
    save();
    publish();
  };

  return {
    notifications,
    getSnapshot: () => snapshot,
    client: (hostId) => clients.get(hostId)?.client,
    activity(hostId, query) {
      const entry = clients.get(hostId);
      if (entry === undefined) return undefined;
      if (query !== undefined) return observeInbox(entry.client, query);
      let observed = activity.get(hostId);
      if (observed === undefined) {
        observed = {
          getSnapshot: () => entry.inbox?.feed.getSnapshot() ?? entry.retained,
          getInbox: () => entry.inbox?.feed,
          subscribe(listener) {
            return entry.inbox?.feed.subscribe(listener) ?? (() => {});
          },
          watching: () => entry.inbox !== undefined,
        };
        activity.set(hostId, observed);
      }
      return observed;
    },
    subscribe(listener) {
      const first = listeners.size === 0;
      listeners.add(listener);
      if (first) for (const entry of clients.values()) start(entry);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const entry of clients.values()) stop(entry);
        notifications.stop();
      };
    },
    async pair(link, deviceName, localHostId, trust) {
      if (trust?.signal?.aborted) return { ok: false, code: 'cancelled' };
      const parsed = parsePairingLink(link);
      const refused = (code: 'this-host' | 'already-paired') => {
        record('remote_host:host_pair_complete', { outcome: 'refused' });
        return { ok: false, code } as const;
      };
      if (!parsed.ok) {
        record('remote_host:host_pair_complete', {
          outcome: PAIR_FAILURES.has(parsed.code) ? 'failed' : 'refused',
        });
        return parsed;
      }
      if (parsed.payload.host.id === localHostId) return refused('this-host');
      if (clients.has(parsed.payload.host.id)) return refused('already-paired');
      if (pairing.has(parsed.payload.host.id)) return { ok: false, code: 'pairing-in-progress' };
      pairing.add(parsed.payload.host.id);
      try {
        const redeemed = await redeemPairing({
          payload: parsed.payload,
          deviceName,
          carrier,
          ...trust,
        });
        if (!redeemed.ok) {
          if (trust?.signal?.aborted) return redeemed;
          record('remote_host:host_pair_complete', {
            outcome: PAIR_FAILURES.has(redeemed.code) ? 'failed' : 'refused',
          });
          return redeemed;
        }
        if (trust?.signal?.aborted) {
          void revokePairing({ host: redeemed.host, carrier });
          return { ok: false, code: 'cancelled' };
        }
        try {
          if (!storage) throw new Error('storage-unavailable');
          storage.setItem(
            REMOTE_HOSTS_STORAGE_KEY,
            JSON.stringify(
              [...[...clients.values()].map(({ host }) => host), redeemed.host].map(
                serializeSavedHost,
              ),
            ),
          );
        } catch {
          record('remote_host:host_pair_complete', { outcome: 'failed' });
          return { ok: false, code: 'storage-failure' };
        }
        attach(redeemed.host);
        tab = redeemed.host.hostId;
        try {
          storage?.setItem(HOST_TAB_STORAGE_KEY, tab);
        } catch {}
        publish();
        record('remote_host:host_pair_complete', { outcome: 'success' });
        return redeemed;
      } finally {
        pairing.delete(parsed.payload.host.id);
      }
    },
    async remove(hostId) {
      const entry = clients.get(hostId);
      if (entry === undefined) return;
      const releasing = releaseRemoteHostViewers(entry.client);
      forget(hostId);
      await releasing;
      await revokePairing({ host: entry.host, carrier });
    },
    select(next) {
      if (tab !== next) notifications.cancel();
      tab = next;
      try {
        storage?.setItem(HOST_TAB_STORAGE_KEY, next);
      } catch {}
      publish();
    },
    open(target) {
      open = target;
      record('remote_host:conversation_open');
      publish();
    },
    close() {
      if (open === undefined) return;
      open = undefined;
      publish();
    },
    async markRead(target, messageId) {
      const entry = clients.get(target.hostId);
      if (entry === undefined) return;
      const channelId =
        target.channelId ??
        entry.client.getSnapshot().roster?.bots.find((bot) => bot.slug === target.botSlug)
          ?.dmChannelId;
      if (channelId === undefined) throw new Error('The remote Channel is not ready.');
      await entry.client.call('channelMarkRead', { channelId, messageId });
      await entry.inbox?.feed.refresh();
    },
    conversation(target) {
      const entry = clients.get(target.hostId);
      if (entry === undefined) return undefined;
      const key = conversationKey(target);
      let conversation = conversations.get(key);
      if (conversation === undefined) {
        conversation = createConversation({
          host: entry.client,
          displayName: target.title,
          ...(target.botSlug === undefined ? {} : { botSlug: target.botSlug }),
          ...(target.channelId === undefined ? {} : { channelId: target.channelId }),
        });
        conversations.set(key, conversation);
      }
      return conversation;
    },
    viewerClient(hostId) {
      return clients.get(hostId)?.client;
    },
  };
}

export function browserCarrier(): HostCarrier {
  return {
    async request(url, init) {
      const response = await fetch(url, {
        method: init.method,
        signal: init.signal,
        credentials: 'omit',
        mode: 'cors',
        headers: {
          ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      return { status: response.status, text: () => response.text() };
    },
    openSocket(url, events, headers = {}) {
      if (new URL(url).pathname === '/botharness-device/channel') {
        const socket = new WebSocket(url);
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () => events.closed('channel-disconnected');
        socket.onclose = (event) => events.closed(event.reason);
        return {
          get bufferedAmount() {
            return socket.bufferedAmount;
          },
          send: (text) => socket.send(text),
          close: () => socket.close(),
        };
      }

      const controller = new AbortController();
      let socket: WebSocket | undefined;
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      void (async () => {
        let ticket: unknown;
        try {
          const origin = new URL(url.replace(/^ws/u, 'http')).origin;
          const response = await fetch(`${origin}${DEVICE_PREFIX}/stream-ticket`, {
            method: 'POST',
            credentials: 'omit',
            mode: 'cors',
            headers,
            signal: controller.signal,
          });
          ticket = ((await response.json()) as { ticket?: unknown }).ticket;
        } catch {
          return closed('The live connection could not start.');
        }
        if (controller.signal.aborted) return closed('closed');
        if (typeof ticket !== 'string')
          return closed('The Remote Host refused the live connection.');
        socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () => closed('socket error');
        socket.onclose = (event) => closed(event.reason);
      })();
      return {
        send: (text) => socket?.send(text),
        close: () => {
          controller.abort();
          if (socket === undefined) closed('closed');
          else socket.close();
        },
      };
    },
  };
}

async function browserImage(
  url: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  const response = await fetch(url, { credentials: 'omit', mode: 'cors', headers });
  if (!response.ok) return undefined;
  return URL.createObjectURL(await response.blob());
}

let shared: RemoteHosts | undefined;
let translate: NotificationTranslate = (key) => en[key];
let recordShared: RemoteHostTelemetry = () => {};

export function recordRemoteHosts(record: RemoteHostTelemetry): void {
  recordShared = record;
}

export function remoteHosts(translator?: NotificationTranslate): RemoteHosts {
  if (translator !== undefined) translate = translator;
  if (shared !== undefined) return shared;
  shared = createRemoteHosts({
    storage: (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
    carrier: browserCarrier(),
    loadImage: browserImage,
    releaseImage: (image) => URL.revokeObjectURL(image),
    translate: (key) => translate(key),
    hostName: (hostId, fallback) => shownHostName(hostLooks().look(hostId), fallback),
    record: (event, properties) => recordShared(event, properties),
  });
  const sources = shared;
  let selection = store.getSnapshot().selection;
  store.subscribe(() => {
    const next = store.getSnapshot().selection;
    if (next === selection) return;
    selection = next;
    sources.close();
  });
  return sources;
}
