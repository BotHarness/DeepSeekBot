import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { boundedBridgeMediaRequest } from './bridge-media-request.js';
import {
  bridgeAttachmentPath,
  localAttachmentFetch,
  type AttachmentFetch,
} from './attachment-fetch.js';

const MAX_BYTES = 25 * 1024 * 1024;

export interface BridgeImageState {
  url?: string;
  failure?: 'unavailable' | 'tooLarge' | 'format' | 'failed';
}
const EMPTY: BridgeImageState = {};
export function createBridgeImageResource(
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
  fetcher?: AttachmentFetch,
) {
  return createAttachmentImageResource(
    bridgeAttachmentPath({ channelId, sourceEventId, attachmentId }),
    fetcher,
  );
}

export function createAttachmentImageResource(
  path: string,
  fetcher: AttachmentFetch = localAttachmentFetch,
) {
  let state = EMPTY;
  let element: HTMLDivElement | null = null;
  let observer: IntersectionObserver | undefined;
  let visible = false;
  let controller: AbortController | undefined;
  let stopLive: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: BridgeImageState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  const reset = () => {
    controller?.abort();
    controller = undefined;
    if (state.url) URL.revokeObjectURL(state.url);
    update(EMPTY);
  };
  const reload = () => {
    reset();
    if (!visible || !listeners.size) return;
    const request = new AbortController();
    controller = request;
    const failure = (value: NonNullable<BridgeImageState['failure']>) => {
      if (!request.signal.aborted) update({ failure: value });
    };
    void boundedBridgeMediaRequest(request.signal, async () => {
      const response = await fetcher(path, { signal: request.signal });
      request.signal.throwIfAborted();
      if (!response.ok) {
        await response.body?.cancel();
        failure(
          response.status === 403
            ? 'unavailable'
            : response.status === 413
              ? 'tooLarge'
              : response.status === 422
                ? 'format'
                : 'failed',
        );
        return;
      }
      const type = response.headers.get('content-type')?.split(';', 1)[0];
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type ?? '')) {
        await response.body?.cancel();
        failure('format');
        return;
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        failure('tooLarge');
        return;
      }
      if (!response.body) throw new Error('Missing image body');
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          request.signal.throwIfAborted();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            failure('tooLarge');
            return;
          }
          chunks.push(new Uint8Array(next.value));
        }
      } finally {
        reader.releaseLock();
      }
      request.signal.throwIfAborted();
      update({ url: URL.createObjectURL(new Blob(chunks, { type: type ?? '' })) });
    }).catch(() => failure('failed'));
  };
  const observe = () => {
    observer?.disconnect();
    observer = undefined;
    if (!element || !listeners.size) {
      visible = false;
      reset();
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      visible = true;
      reload();
      return;
    }
    observer = new IntersectionObserver((entries) => {
      const next = entries.some((entry) => entry.isIntersecting);
      if (visible !== next) {
        visible = next;
        reload();
      }
    });
    observer.observe(element);
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopLive = subscribeMessagingDefaults(reload);
        observe();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopLive?.();
          stopLive = undefined;
          observer?.disconnect();
          observer = undefined;
          visible = false;
          reset();
        }
      };
    },
    element(value: HTMLDivElement | null) {
      if (value === element) return;
      element = value;
      observe();
    },
    retry: reload,
    fail() {
      reset();
      update({ failure: 'format' });
    },
  };
}
