import { useMemo, useSyncExternalStore } from 'react';
import { fetchMessageResource, useMessageHost, type MessageHost } from './message-host.js';

interface ResourceState {
  url?: string;
  failed?: true;
  loading?: true;
}

export function createMessageResource(path: string | undefined, host?: MessageHost, eager = true) {
  let state: ResourceState = {};
  let controller: AbortController | undefined;
  let pending: Promise<string | undefined> | undefined;
  let downloading = false;
  let stopHost: (() => void) | undefined;
  const channelId =
    path === undefined
      ? undefined
      : new URL(path, 'https://attachment.invalid').searchParams.get('channelId');
  const current = () => host !== undefined && channelId != null && host.current(channelId);
  const listeners = new Set<() => void>();
  const publish = (next: ResourceState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const clear = () => {
    controller?.abort();
    controller = undefined;
    pending = undefined;
    if (state.url) URL.revokeObjectURL(state.url);
    state = {};
  };
  const prepare = (): Promise<string | undefined> => {
    if (path === undefined || host === undefined || listeners.size === 0 || !current())
      return Promise.resolve(undefined);
    if (pending !== undefined) return pending;
    if (state.url !== undefined) return Promise.resolve(state.url);
    clear();
    publish({ loading: true });
    const request = new AbortController();
    controller = request;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    pending = (async () => {
      const response = await fetchMessageResource(path, signal, host);
      if (signal.aborted) {
        await response.body?.cancel();
        signal.throwIfAborted();
      }
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('content-length')) > 25 * 1024 * 1024
      ) {
        await response.body?.cancel();
        throw new Error('Attachment unavailable');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          signal.throwIfAborted();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 25 * 1024 * 1024) throw new Error('Attachment too large');
          chunks.push(new Uint8Array(next.value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      signal.throwIfAborted();
      if (!current()) {
        publish({ failed: true });
        return undefined;
      }
      const url = URL.createObjectURL(
        new Blob(chunks, {
          type: response.headers.get('content-type') ?? 'application/octet-stream',
        }),
      );
      publish({ url });
      return url;
    })()
      .catch(() => {
        if (!request.signal.aborted) publish({ failed: true });
        return undefined;
      })
      .finally(() => {
        if (controller === request) pending = undefined;
      });
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopHost = host?.client.subscribe(() => {
          if (host?.client.getSnapshot().connection.status === 'refused') {
            clear();
            publish({ failed: true });
          }
        });
        if (eager) void prepare();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopHost?.();
          stopHost = undefined;
          clear();
        }
      };
    },
    prepare,
    retry: () => void prepare(),
    async download(name: string) {
      if (downloading) return;
      downloading = true;
      try {
        const url = await prepare();
        if (url === undefined || !listeners.size || !current()) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.append(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
        }
      } finally {
        downloading = false;
      }
    },
  };
}

export function useMessageResource(localUrl: string | undefined, eager = true) {
  const host = useMessageHost();
  const resource = useMemo(
    () => createMessageResource(localUrl?.replace(/^\./, ''), host, eager),
    [localUrl, host, eager],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  return {
    ...state,
    url: host === undefined ? localUrl : state.url,
    retry: resource.retry,
    prepare: resource.prepare,
    download: resource.download,
  };
}
