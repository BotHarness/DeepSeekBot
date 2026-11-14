import { useMemo, useSyncExternalStore } from 'react';
import { fetchMessageResource, useMessageHost, type MessageHost } from './message-host.js';

function imageSource(host: MessageHost | undefined, source: string | undefined) {
  const internal =
    source?.startsWith('./') || (source?.startsWith('/') && !source.startsWith('//'));
  let value = host === undefined || !internal ? source : undefined;
  const listeners = new Set<() => void>();
  let controller: AbortController | undefined;
  let url: string | undefined;
  let stopHost: (() => void) | undefined;
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && host !== undefined && source !== undefined && internal) {
        const load = () => {
          if (host.client.getSnapshot().connection.status !== 'connected') {
            controller?.abort();
            return;
          }
          if (url !== undefined || (controller !== undefined && !controller.signal.aborted)) return;
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
              value = url;
              for (const notify of listeners) notify();
            })
            .catch(() => {});
        };
        stopHost = host.client.subscribe(load);
        load();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size !== 0) return;
        stopHost?.();
        stopHost = undefined;
        controller?.abort();
        if (url !== undefined) {
          URL.revokeObjectURL(url);
          url = undefined;
          value = undefined;
        }
      };
    },
  };
}

export function useHostImage(source: string | undefined): string | undefined {
  const host = useMessageHost();
  const resource = useMemo(() => imageSource(host, source), [host, source]);
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}
