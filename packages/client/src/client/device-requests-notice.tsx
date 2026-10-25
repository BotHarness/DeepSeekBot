import { useState, type ReactNode } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { PairedDevicesSettings } from './paired-devices.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Tooltip } from './ds/tooltip.js';
import type { BotHarnessTranslate } from './locale.js';

export function DeviceRequestsNotice({
  t,
  trigger,
}: {
  t: BotHarnessTranslate;
  trigger?: (open: () => void) => ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const response = await fetch('./api/botharness/devices/requests', {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) return;
        const value = (await response.json()) as { pendingKeys: { approved: boolean }[] };
        if (!abort.signal.aborted) setPending(value.pendingKeys.some((key) => !key.approved));
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
  }, []);
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
