import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { boundedBridgeMediaRequest } from './bridge-media-request.js';

type Failure = 'unavailable' | 'tooLarge' | 'format' | 'interrupted' | 'failed';
interface VideoState {
  loading?: boolean;
  url?: string;
  posterUrl?: string;
  failure?: Failure;
  posterFailure?: Failure;
}
const EMPTY: VideoState = {};
const MAX_BYTES = 25 * 1024 * 1024;

export function createBridgeVideoResource(
  channelId: string,
  sourceEventId: string,
  attachmentId: string,
  posterAttachmentId?: string,
) {
  let state = EMPTY;
  let controller: AbortController | undefined;
  let stopLive: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: VideoState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  const reset = () => {
    controller?.abort();
    controller = undefined;
    if (state.url) URL.revokeObjectURL(state.url);
    if (state.posterUrl) URL.revokeObjectURL(state.posterUrl);
    update(EMPTY);
  };
  const prepare = async () => {
    if (state.loading || !listeners.size) return;
    reset();
    const request = new AbortController();
    controller = request;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    const current = () => controller === request && !request.signal.aborted && listeners.size > 0;
    const publish = (value: VideoState) => {
      if (current()) update({ ...state, ...value });
    };
    const load = async (id: string, poster: boolean) => {
      try {
        await boundedBridgeMediaRequest(signal, async () => {
          const response = await fetch(
            './api/botharness/attachment?' +
              new URLSearchParams({
                channelId,
                sourceEventId,
                attachmentId: id,
                ...(poster ? {} : { representation: 'playback' }),
              }),
            { signal },
          );
          signal.throwIfAborted();
          const type = response.headers.get('content-type')?.split(';', 1)[0] ?? '';
          const failure: Failure | undefined = !response.ok
            ? response.status === 403 || response.status === 404
              ? 'unavailable'
              : response.status === 413
                ? 'tooLarge'
                : response.status === 422
                  ? 'format'
                  : 'failed'
            : !(
                  poster ? ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] : ['video/mp4']
                ).includes(type)
              ? 'format'
              : Number(response.headers.get('content-length')) > MAX_BYTES
                ? 'tooLarge'
                : undefined;
          if (failure) {
            await response.body?.cancel();
            publish(poster ? { posterFailure: failure } : { failure, loading: false });
            return;
          }
          if (!response.body) throw new Error('Missing media body');
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
                publish(
                  poster ? { posterFailure: 'tooLarge' } : { failure: 'tooLarge', loading: false },
                );
                return;
              }
              chunks.push(new Uint8Array(next.value));
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          signal.throwIfAborted();
          if (!current()) return;
          const url = URL.createObjectURL(new Blob(chunks, { type }));
          publish(poster ? { posterUrl: url } : { url, loading: false });
        });
      } catch {
        const failure = signal.aborted ? 'interrupted' : 'failed';
        publish(poster ? { posterFailure: failure } : { failure, loading: false });
      }
    };
    update({ loading: true });
    await Promise.all([
      load(attachmentId, false),
      ...(posterAttachmentId ? [load(posterAttachmentId, true)] : []),
    ]);
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
    failPoster(url: string) {
      if (state.posterUrl !== url) return;
      const { posterUrl, ...current } = state;
      if (posterUrl) URL.revokeObjectURL(posterUrl);
      update({ ...current, posterFailure: 'format' });
    },
    fail(url: string) {
      if (state.url !== url) return;
      reset();
      update({ failure: 'format' });
    },
  };
}
