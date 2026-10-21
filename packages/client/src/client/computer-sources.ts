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
import { parseSavedHost, type SavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import {
  DEVICE_PREFIX,
  parsePairingLink,
  redeemPairing,
  revokePairing,
  type PairingRefusal,
} from '../../../../apps/mobile/src/host/pairing.js';
import { store } from './store.js';

export const COMPUTERS_STORAGE_KEY = 'botharness.computers.v1';
export const COMPUTER_TAB_STORAGE_KEY = 'botharness.computers.tab.v1';
export const ALL_COMPUTERS = 'all';
export const THIS_COMPUTER = 'local';

export interface RemoteConversationTarget {
  hostId: string;
  title: string;
  botSlug?: string;
  channelId?: string;
}

export interface RemoteComputer {
  host: SavedHost;
  snapshot: HostSnapshot;
}

export interface ComputerSourcesSnapshot {
  computers: readonly RemoteComputer[];
  tab: string;
  open?: RemoteConversationTarget;
}

export type ComputerPairResult =
  | { ok: true; host: SavedHost }
  | { ok: false; code: PairingRefusal | 'already-paired' | 'this-computer' };

export interface ComputerSources {
  getSnapshot(): ComputerSourcesSnapshot;
  subscribe(listener: () => void): () => void;
  pair(link: string, deviceName: string, localHostId?: string): Promise<ComputerPairResult>;
  remove(hostId: string): Promise<void>;
  select(tab: string): void;
  open(target: RemoteConversationTarget): void;
  close(): void;
  conversation(target: RemoteConversationTarget): Conversation | undefined;
}

export interface ComputerStorage {
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

function readHosts(storage: ComputerStorage | undefined): SavedHost[] {
  try {
    const value = JSON.parse(storage?.getItem(COMPUTERS_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.flatMap((entry) => parseSavedHost(entry) ?? []) : [];
  } catch {
    return [];
  }
}

function readTab(storage: ComputerStorage | undefined): string {
  try {
    return storage?.getItem(COMPUTER_TAB_STORAGE_KEY) ?? ALL_COMPUTERS;
  } catch {
    return ALL_COMPUTERS;
  }
}

export function createComputerSources(options: {
  storage?: ComputerStorage | undefined;
  carrier: HostCarrier;
}): ComputerSources {
  const { storage, carrier } = options;
  const listeners = new Set<() => void>();
  const clients = new Map<string, { host: SavedHost; client: HostClient; release: () => void }>();
  const conversations = new Map<string, Conversation>();
  let tab = readTab(storage);
  let open: RemoteConversationTarget | undefined;
  let snapshot: ComputerSourcesSnapshot = { computers: [], tab };

  const publish = (): void => {
    const computers = [...clients.values()].map(({ host, client }) => ({
      host,
      snapshot: client.getSnapshot(),
    }));
    const known = tab === ALL_COMPUTERS || tab === THIS_COMPUTER || clients.has(tab);
    snapshot = {
      computers,
      tab: known ? tab : ALL_COMPUTERS,
      ...(open === undefined ? {} : { open }),
    };
    for (const listener of listeners) listener();
  };

  const save = (): void => {
    try {
      const hosts = [...clients.values()].map(({ host }) => host);
      if (hosts.length === 0) storage?.removeItem(COMPUTERS_STORAGE_KEY);
      else storage?.setItem(COMPUTERS_STORAGE_KEY, JSON.stringify(hosts));
    } catch {}
  };

  const attach = (host: SavedHost): void => {
    const client = createHostClient({ routes: host.routes, credential: host.credential, carrier });
    const release = client.subscribe(publish);
    clients.set(host.hostId, { host, client, release });
    if (listeners.size > 0) client.start();
  };

  for (const host of readHosts(storage)) attach(host);
  publish();

  const forget = (hostId: string): void => {
    const entry = clients.get(hostId);
    if (entry === undefined) return;
    entry.release();
    entry.client.stop();
    clients.delete(hostId);
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
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (listeners.size === 0) for (const { client } of clients.values()) client.start();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const { client } of clients.values()) client.stop();
      };
    },
    async pair(link, deviceName, localHostId) {
      const parsed = parsePairingLink(link);
      if (!parsed.ok) return parsed;
      if (parsed.payload.host.id === localHostId) return { ok: false, code: 'this-computer' };
      if (clients.has(parsed.payload.host.id)) return { ok: false, code: 'already-paired' };
      const redeemed = await redeemPairing({ payload: parsed.payload, deviceName, carrier });
      if (!redeemed.ok) return redeemed;
      attach(redeemed.host);
      save();
      tab = redeemed.host.hostId;
      try {
        storage?.setItem(COMPUTER_TAB_STORAGE_KEY, tab);
      } catch {}
      publish();
      return redeemed;
    },
    async remove(hostId) {
      const entry = clients.get(hostId);
      if (entry === undefined) return;
      forget(hostId);
      await revokePairing({ host: entry.host, carrier });
    },
    select(next) {
      tab = next;
      try {
        storage?.setItem(COMPUTER_TAB_STORAGE_KEY, next);
      } catch {}
      publish();
    },
    open(target) {
      open = target;
      publish();
    },
    close() {
      if (open === undefined) return;
      open = undefined;
      publish();
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
        if (typeof ticket !== 'string') return closed('The computer refused the live connection.');
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

let shared: ComputerSources | undefined;

export function computerSources(): ComputerSources {
  if (shared !== undefined) return shared;
  shared = createComputerSources({
    storage: (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
    carrier: browserCarrier(),
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
