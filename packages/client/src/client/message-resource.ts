import { useMemo, useSyncExternalStore } from 'react';
import { fetchMessageResource, useMessageHost, type MessageHost } from './message-host.js';

interface ResourceState {
  url?: string;
  failed?: true;
}

export function createMessageResource(path: string | undefined, host?: MessageHost) {
  let state: ResourceState = {};
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: ResourceState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const clear = () => {
    controller?.abort();
    controller = undefined;
    if (state.url) URL.revokeObjectURL(state.url);
    state = {};
  };
  const load = () => {
    clear();
    publish({});
    if (path === undefined || host === undefined || listeners.size === 0) return;
    const request = new AbortController();
    controller = request;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    void (async () => {
      const response = await fetchMessageResource(path, signal, host);
      signal.throwIfAborted();
      if (!response.ok || !response.body) {
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
      publish({
        url: URL.createObjectURL(
          new Blob(chunks, {
            type: response.headers.get('content-type') ?? 'application/octet-stream',
          }),
        ),
      });
    })().catch(() => {
      if (!request.signal.aborted) publish({ failed: true });
    });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) load();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) clear();
      };
    },
    retry: load,
  };
}

export function useMessageResource(localUrl: string | undefined) {
  const host = useMessageHost();
  const resource = useMemo(
    () => createMessageResource(localUrl?.replace(/^\./, ''), host),
    [localUrl, host],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  return { ...state, url: host === undefined ? localUrl : state.url, retry: resource.retry };
}
