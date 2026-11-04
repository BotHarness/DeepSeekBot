import { useState, type ReactNode } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { PairedDevicesSettings } from './paired-devices.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';

const pendingListeners = new Set<(pending: boolean) => void>();
let pendingRequests = false;
let stopPolling: (() => void) | undefined;

function startPolling(): () => void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const read = async () => {
    try {
      const response = await fetch('./api/botharness/devices/requests', {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) return;
      const value = (await response.json()) as { pendingKeys: { approved: boolean }[] };
      if (abort.signal.aborted) return;
      pendingRequests = value.pendingKeys.some((key) => !key.approved);
      for (const listener of pendingListeners) listener(pendingRequests);
    } catch {
    } finally {
      if (!abort.signal.aborted) timer = setTimeout(read, 3000);
    }
  };
  void read();
  return () => {
    abort.abort();
    clearTimeout(timer);
  };
}

function watchPendingRequests(listener: (pending: boolean) => void): () => void {
  pendingListeners.add(listener);
  listener(pendingRequests);
  stopPolling ??= startPolling();
  return () => {
    pendingListeners.delete(listener);
    if (pendingListeners.size > 0) return;
    stopPolling?.();
    stopPolling = undefined;
  };
}

export function DeviceRequestsNotice({
  t,
  trigger,
}: {
  t: BotHarnessTranslate;
  trigger?: (open: () => void) => ReactNode;
}) {
  const [pending, setPending] = useState(pendingRequests);
  const [reviewing, setReviewing] = useState(false);
  const mount = useMountedResource<HTMLSpanElement>(() => watchPendingRequests(setPending), []);
  return (
    <span ref={mount}>
      {pending ? (
        trigger ? (
          trigger(() => setReviewing(true))
        ) : (
          <Tooltip label={t('connections.pending')} side="right">
            <button
              type="button"
              aria-label={t('connections.pending')}
              onClick={() => setReviewing(true)}
            >
              <ChannelSidebarIcon name="smartphone" />
              <span aria-hidden="true">!</span>
            </button>
          </Tooltip>
        )
      ) : null}
      {reviewing ? (
        <PairedDevicesSettings t={t} section="requests" onClose={() => setReviewing(false)} />
      ) : null}
    </span>
  );
}
