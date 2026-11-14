import { useMemo, useSyncExternalStore } from 'react';
import { fetchMessageResource, useMessageHost, type MessageHost } from './message-host.js';

function imageSource(host: MessageHost | undefined, source: string | undefined) {
  const internal =
    source?.startsWith('./') || (source?.startsWith('/') && !source.startsWith('//'));
  let value: { src: string | undefined; failed: boolean } = {
    src: host === undefined || !internal ? source : undefined,
    failed: false,
  };
  const listeners = new Set<() => void>();
  let controller: AbortController | undefined;
  let url: string | undefined;
  let stopHost: (() => void) | undefined;
  let retry = () => {};
  return {
    getSnapshot: () => value,
    retry() {
      retry();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && host !== undefined && source !== undefined && internal) {
        const load = () => {
          if (host.client.getSnapshot().connection.status !== 'connected') {
            controller?.abort();
            if (value.failed) {
              value = { src: undefined, failed: false };
              for (const notify of listeners) notify();
            }
            return;
          }
          if (
            value.failed ||
            url !== undefined ||
            (controller !== undefined && !controller.signal.aborted)
          )
            return;
          const loading = new AbortController();
          controller = loading;
          void fetchMessageResource(
            source.startsWith('./') ? source.slice(1) : source,
            loading.signal,
            host,
          )
            .then(async (response) => {
              if (!response.ok) throw new Error('image-unavailable');
              const blob = await response.blob();
              loading.signal.throwIfAborted();
              url = URL.createObjectURL(blob);
              value = { src: url, failed: false };
              for (const notify of listeners) notify();
            })
            .catch(() => {
              if (loading.signal.aborted || controller !== loading) return;
              controller = undefined;
              value = { src: undefined, failed: true };
              for (const notify of listeners) notify();
            });
        };
        retry = () => {
          controller?.abort();
          controller = undefined;
          value = { src: undefined, failed: false };
          for (const notify of listeners) notify();
          load();
        };
        stopHost = host.client.subscribe(load);
        load();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size !== 0) return;
        stopHost?.();
        stopHost = undefined;
        retry = () => {};
        controller?.abort();
        if (url !== undefined) {
          URL.revokeObjectURL(url);
          url = undefined;
          value = { src: undefined, failed: false };
        }
      };
    },
  };
}

export function useHostImageState(source: string | undefined) {
  const host = useMessageHost();
  const resource = useMemo(() => imageSource(host, source), [host, source]);
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  return { ...snapshot, retry: resource.retry };
}

export function useHostImage(source: string | undefined): string | undefined {
  return useHostImageState(source).src;
}
