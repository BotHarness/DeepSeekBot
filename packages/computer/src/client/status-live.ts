import type { ObserveResource } from '../../../core/src/channels/resource-events.js';
import { visibleInterval } from '../../../client/src/client/visible-interval.js';

export function watchComputerStatus(
  observe: ObserveResource | undefined,
  refresh: (signal: AbortSignal) => Promise<void>,
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
  const stop = observe?.('computer', read) ?? visibleInterval(() => void read(), 15_000);
  if (observe === undefined) void read();
  return () => {
    controller.abort();
    stop();
  };
}
