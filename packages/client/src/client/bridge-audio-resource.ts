import { subscribeMessagingDefaults } from './messaging-defaults-live.js';

interface AudioState {
  loading?: boolean;
  url?: string;
  failure?: 'unavailable' | 'format' | 'tooLarge' | 'interrupted' | 'failed';
}
const EMPTY: AudioState = {};
const MAX_BYTES = 12 * 1024 * 1024 + 44;
export function createBridgeAudioResource(
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
) {
  let state = EMPTY;
  let controller: AbortController | undefined;
  let stopLive: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: AudioState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  const reset = () => {
    controller?.abort();
    controller = undefined;
    if (state.url) URL.revokeObjectURL(state.url);
    update(EMPTY);
  };
  const prepare = async () => {
    if (state.loading || !listeners.size) return;
    reset();
    const request = new AbortController();
    controller = request;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
    update({ loading: true });
    try {
      const response = await fetch(
        '/api/botharness/attachment?' +
          new URLSearchParams({
            channelId,
            sourceEventId,
            attachmentId,
            representation: 'playback',
          }),
        { signal },
      );
      signal.throwIfAborted();
      if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0] !== 'audio/wav') {
        await response.body?.cancel();
        if (!request.signal.aborted)
          update({
            failure:
              response.status === 403
                ? 'unavailable'
                : response.status === 413
                  ? 'tooLarge'
                  : response.status === 422 || response.ok
                    ? 'format'
                    : 'failed',
          });
        return;
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        update({ failure: 'tooLarge' });
        return;
      }
      if (!response.body) throw new Error('Missing playback body');
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
            await reader.cancel();
            update({ failure: 'tooLarge' });
            return;
          }
          chunks.push(new Uint8Array(next.value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      signal.throwIfAborted();
      update({ url: URL.createObjectURL(new Blob(chunks, { type: 'audio/wav' })) });
    } catch {
      if (!request.signal.aborted) update({ failure: signal.aborted ? 'interrupted' : 'failed' });
    }
  };
  return {
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
    prepare,
    fail() {
      reset();
      update({ failure: 'format' });
    },
  };
}
