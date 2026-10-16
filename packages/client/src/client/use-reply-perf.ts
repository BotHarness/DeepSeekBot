import { useRef, useState } from 'react';
import type { BridgeActions } from './actions.js';
import type { ChannelMessage } from './store.js';
import { messagePerfView, type AveragePerfView } from './message-perf.js';
import { useMountedResource } from './mounted-resource.js';

export function useReplyPerf(
  actions: Pick<BridgeActions, 'averageReplyPerf'>,
  channelId: string | undefined,
  latest: ChannelMessage | undefined,
  enabled: boolean,
  purgeRevision = 0,
) {
  const measured = useRef<{ channelId: string | undefined; id: string | undefined }>({
    channelId,
    id: undefined,
  });
  if (measured.current.channelId !== channelId) measured.current = { channelId, id: undefined };
  if (latest !== undefined && messagePerfView(latest) !== undefined)
    measured.current.id = latest.id;
  const [result, setResult] = useState<{
    channelId: string;
    average: AveragePerfView | undefined;
    purgeRevision: number;
  }>();
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (!enabled || channelId === undefined) return;
    const controller = new AbortController();
    void actions.averageReplyPerf(channelId, controller.signal).then(
      (average) => {
        if (!controller.signal.aborted) setResult({ channelId, average, purgeRevision });
      },
      () => {
        if (!controller.signal.aborted) setResult(undefined);
      },
    );
    return () => controller.abort();
  }, [actions, channelId, enabled, measured.current.id, purgeRevision]);
  return {
    mount,
    average:
      enabled && result?.channelId === channelId && result?.purgeRevision === purgeRevision
        ? result?.average
        : undefined,
  };
}
