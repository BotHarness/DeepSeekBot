import type { ObserveResource } from '../../../core/src/channels/resource-events.js';
import { visibleInterval } from '../../../client/src/client/visible-interval.js';

export const cancelled = (signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true &&
  (signal.reason as { name?: unknown } | undefined)?.name !== 'TimeoutError';

export function watchComputerStatus(
  observe: ObserveResource | undefined,
  refresh: (signal: AbortSignal) => Promise<void>,
  waitingForViewer = false,
): () => void {
  const controller = new AbortController();
  let reading = false;
  const read = async (): Promise<void> => {
    if (reading || controller.signal.aborted) return;
    reading = true;
    try {
      await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
    } finally {
      reading = false;
    }
  };
  const stop = observe?.('computer', read);
  const stopPoll =
    waitingForViewer || stop === undefined
      ? visibleInterval(() => void read(), waitingForViewer ? 1_000 : 15_000)
      : undefined;
  if (stop === undefined) void read();
  return () => {
    controller.abort();
    stop?.();
    stopPoll?.();
  };
}
