import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { boundedBridgeMediaRequest } from './bridge-media-request.js';
import {
  bridgeAttachmentPath,
  localAttachmentFetch,
  type AttachmentFetch,
} from './attachment-fetch.js';

interface FileState {
  loading?: boolean;
  failure?: 'unavailable' | 'tooLarge' | 'format' | 'failed';
}
const EMPTY: FileState = {};
const MAX_BYTES = 25 * 1024 * 1024;

export function createBridgeFileResource(
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
  fetcher?: AttachmentFetch,
) {
  return createAttachmentFileResource(
    bridgeAttachmentPath({ channelId, sourceEventId, attachmentId }),
    fetcher,
  );
}

export function createAttachmentFileResource(
  path: string,
  fetcher: AttachmentFetch = localAttachmentFetch,
) {
  let state = EMPTY;
  let controller: AbortController | undefined;
  let stopLive: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: FileState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  const reset = () => {
    controller?.abort();
    controller = undefined;
    update(EMPTY);
  };
  const download = async (name: string) => {
    if (state.loading || !listeners.size) return;
    reset();
    const request = new AbortController();
    controller = request;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    const publish = (next: FileState) => {
      if (controller === request && !request.signal.aborted) update(next);
    };
    update({ loading: true });
    try {
      await boundedBridgeMediaRequest(signal, async () => {
        const response = await fetcher(path, { signal });
        signal.throwIfAborted();
        if (!response.ok) {
          await response.body?.cancel();
          publish({
            failure:
              response.status === 403 || response.status === 404
                ? 'unavailable'
                : response.status === 413
                  ? 'tooLarge'
                  : response.status === 422
                    ? 'format'
                    : 'failed',
          });
          return;
        }
        if (Number(response.headers.get('content-length')) > MAX_BYTES) {
          await response.body?.cancel();
          publish({ failure: 'tooLarge' });
          return;
        }
        if (!response.body) throw new Error('Missing file body');
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        try {
          while (true) {
            const next = await reader.read();
            signal.throwIfAborted();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > MAX_BYTES) {
              publish({ failure: 'tooLarge' });
              return;
            }
            chunks.push(new Uint8Array(next.value));
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        signal.throwIfAborted();
        const url = URL.createObjectURL(new Blob(chunks, { type: 'application/octet-stream' }));
        try {
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
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
        publish(EMPTY);
      });
    } catch {
      publish({ failure: 'failed' });
    }
  };
  return {
    download,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) stopLive = subscribeMessagingDefaults(reset);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopLive?.();
          stopLive = undefined;
          reset();
        }
      };
    },
  };
}
