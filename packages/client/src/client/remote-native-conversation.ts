import { useMemo, useSyncExternalStore } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { isolateTeamIdentity } from './team-state.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { createActions, type BridgeActions } from './actions.js';
import { loadJournalPage, type BridgeCall } from './bridge.js';
import {
  RemoteStream,
  RemoteStreamCarrierError,
  type ClientRemote,
} from '@deepseek-ai/dsh-api-gateway/client';
import { createChannelFollow } from './live-snapshots.js';
import { mountChannelLive, type ChannelFollow } from './channel-live.js';
import { parsePurgedPlacements } from './content-redactions.js';
import { createStore, type ClientStore } from './store.js';
import { fetchMessageResource, type MessageHost } from './message-host.js';
import { conversationKey, remoteHosts, type RemoteConversationTarget } from './remote-hosts.js';

export function createHostChannelFollow(client: HostClient, call: BridgeCall): ChannelFollow {
  let ready = false;
  let generation = 0;
  const readGeneration = () => {
    const connected = client.getSnapshot().connection.status === 'connected';
    if (connected && !ready) generation += 1;
    ready = connected;
    return connected ? { id: generation, host: { home: '' } } : undefined;
  };
  const connection = {
    generation: {
      getSnapshot: readGeneration,
      subscribe(listener: () => void) {
        return client.subscribe(() => {
          readGeneration();
          listener();
        });
      },
    },
  };
  const remote: Pick<ClientRemote, '$stream'> = {
    $stream: (options) => new RemoteStream(connection, options),
  };
  return createChannelFollow(
    remote,
    () => ({
      followChannel: (channelId, limit, drafts, signal) =>
        hostChannelItems(client, { channelId, limit, drafts }, signal),
    }),
    (channelId, request, signal) => loadJournalPage(call, channelId, request, signal),
  );
}

export async function* hostChannelItems(
  client: HostClient,
  args: Record<string, unknown>,
  signal: AbortSignal,
): AsyncGenerator<unknown> {
  const queue: unknown[] = [];
  let failed: Error | undefined;
  let wake: (() => void) | undefined;
  const notify = () => wake?.();
  const stop = client.follow('botharness/followChannel', args, {
    item(value) {
      queue.push(value);
      notify();
    },
    interrupted(reason) {
      failed = new RemoteStreamCarrierError(reason);
      notify();
    },
    refused(error) {
      failed = new Error(`${error.code}: ${error.message}`);
      notify();
    },
  });
  signal.addEventListener('abort', notify, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      if (failed !== undefined) throw failed;
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      yield queue.shift();
    }
  } finally {
    stop();
    signal.removeEventListener('abort', notify);
    wake = undefined;
  }
}

export interface RemoteNativeConversation {
  readonly scopeId: number;
  readonly store: ClientStore;
  readonly actions: BridgeActions;
  readonly host: MessageHost;
  available(): boolean;
  start(): void;
  stop(): void;
}

let nextScopeId = 0;

export function createRemoteNativeConversation(
  client: HostClient,
  target: RemoteConversationTarget,
  current: () => boolean,
): RemoteNativeConversation {
  const store = createStore();
  let running = false;
  let loading = false;
  let connected = false;
  let stopLive = () => {};
  let stopRoster = () => {};
  let stopConnection = () => {};
  let stopPurge = () => {};
  let lifetime = new AbortController();
  const call: BridgeCall = async (method, payload, signal) => {
    signal?.throwIfAborted();
    if (!running || !current() || client.getSnapshot().connection.status !== 'connected')
      throw new Error('remote-conversation-unavailable');
    const value = await client.call(method, payload);
    signal?.throwIfAborted();
    if (!running || !current() || client.getSnapshot().connection.status !== 'connected')
      throw new Error('remote-conversation-unavailable');
    return { ok: true, value };
  };
  isolateTeamIdentity(call);
  const actions = createActions(call, store, undefined, {
    async download(path, name) {
      const signal = lifetime.signal;
      if (!host.current(store.getSnapshot().conversation.channel?.id ?? ''))
        throw new Error('remote-conversation-unavailable');
      const response = await fetchMessageResource(path, signal, host);
      if (!response.ok) throw new Error(`attachment-download-${response.status}`);
      const blob = await response.blob();
      signal.throwIfAborted();
      if (!host.current(store.getSnapshot().conversation.channel?.id ?? ''))
        throw new Error('remote-conversation-unavailable');
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
  const subscribePurges: NonNullable<MessageHost['subscribePurges']> = (listener) =>
    client.onPurged?.((raw) => listener(parsePurgedPlacements(raw))) ?? (() => {});
  const host: MessageHost = {
    hostId: target.hostId,
    client,
    current: (channelId) =>
      running &&
      current() &&
      client.getSnapshot().connection.status === 'connected' &&
      store.getSnapshot().conversation.channel?.id === channelId,
    subscribePurges,
  };
  const hydrate = async (): Promise<void> => {
    if (!running || loading || !current() || client.getSnapshot().connection.status !== 'connected')
      return;
    loading = true;
    try {
      await actions.refreshRoster();
      if (!running || !current()) return;
      const identity = store.getSnapshot().composerIdentity;
      if (identity === undefined) throw new Error('remote-composer-identity-unavailable');
      if (target.channelId !== undefined) await actions.openChannel(target.channelId);
      else if (target.botSlug !== undefined) await actions.openBot(target.botSlug);
      else throw new Error('remote-conversation-target-invalid');
    } catch (error) {
      if (running)
        store.setConversation({
          status: 'error',
          error: error instanceof Error ? error.message : 'remote-conversation-unavailable',
        });
    } finally {
      loading = false;
    }
  };
  return {
    scopeId: ++nextScopeId,
    store,
    actions,
    host,
    available: () =>
      running && current() && connected && store.getSnapshot().composerIdentity !== undefined,
    start() {
      if (running) return;
      running = true;
      lifetime = new AbortController();
      store.setMode('bot');
      if (target.channelId !== undefined)
        store.select({ kind: 'channel', channelId: target.channelId });
      else if (target.botSlug !== undefined) store.select({ kind: 'bot', slug: target.botSlug });
      store.setConversation({ status: 'loading' });
      stopLive = mountChannelLive(store, actions, undefined, {
        follow: createHostChannelFollow(client, call),
      });
      stopPurge = subscribePurges((placements) => store.purgeContent(placements));
      stopRoster = client.onLive((kind) => {
        if (kind === 'roster' && running) void actions.refreshRoster();
      });
      const sync = () => {
        const next = client.getSnapshot().connection.status === 'connected';
        if (!next) lifetime.abort(new Error('remote-conversation-unavailable'));
        else if (lifetime.signal.aborted) lifetime = new AbortController();
        if (next && !connected) void hydrate();
        connected = next;
      };
      stopConnection = client.subscribe(sync);
      sync();
    },
    stop() {
      running = false;
      lifetime.abort();
      stopLive();
      stopRoster();
      stopConnection();
      stopPurge();
    },
  };
}

const inactive = () => () => {};
export function useRemoteNativeConversation(target: RemoteConversationTarget | undefined) {
  const sources = remoteHosts();
  const client = target === undefined ? undefined : sources.client(target.hostId);
  const key = target === undefined ? undefined : conversationKey(target);
  useSyncExternalStore(
    client?.subscribe ?? inactive,
    () => client?.getSnapshot(),
    () => undefined,
  );
  const conversation = useMemo(
    () =>
      client === undefined || target === undefined
        ? undefined
        : createRemoteNativeConversation(client, target, () => {
            const open = sources.getSnapshot().open;
            return (
              sources.client(target.hostId) === client &&
              open !== undefined &&
              conversationKey(open) === key
            );
          }),
    [sources, client, key],
  );
  const mount = useMountedResource<HTMLSpanElement>(() => {
    conversation?.start();
    return () => conversation?.stop();
  }, [conversation]);
  return [conversation, mount] as const;
}
