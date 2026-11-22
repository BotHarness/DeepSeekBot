import { observeHostResource } from './messaging-defaults-live.js';
import { memberPage } from './member-page.js';
import { useState, type ReactNode } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { PairedDevicesSettings } from './paired-devices.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';

const pendingListeners = new Set<(pending: boolean) => void>();
let pendingRequests = false;
let stopObserving: (() => void) | undefined;

function observePendingRequests(): () => void {
  const abort = new AbortController();
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
    } catch {}
  };
  const stop = observeHostResource('devices', read);
  return () => {
    abort.abort();
    stop();
  };
}

function watchPendingRequests(listener: (pending: boolean) => void): () => void {
  pendingListeners.add(listener);
  listener(pendingRequests);
  stopObserving ??= observePendingRequests();
  return () => {
    pendingListeners.delete(listener);
    if (pendingListeners.size > 0) return;
    stopObserving?.();
    stopObserving = undefined;
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
  const mount = useMountedResource<HTMLSpanElement>(
    () => (memberPage() ? undefined : watchPendingRequests(setPending)),
    [],
  );
  return (
    <span ref={mount}>
      {pending ? (
        trigger ? (
          trigger(() => setReviewing(true))
        ) : (
          <Tooltip label={t('connections.pending')} side="right" portal>
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
