import { useCallback, useSyncExternalStore, type ReactElement } from 'react';
import type { ChannelMessage } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

export function PendingDelivery({
  message,
  t,
}: {
  message: ChannelMessage;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const started = Date.parse(message.at);
  const subscribe = useCallback(
    (notify: () => void) => {
      const timer = setTimeout(notify, Math.max(0, started + 3000 - Date.now()));
      return () => clearTimeout(timer);
    },
    [started],
  );
  const snapshot = useCallback(
    () => Number.isFinite(started) && Date.now() >= started + 3000,
    [started],
  );
  const visible = useSyncExternalStore(subscribe, snapshot, () => false);
  return visible ? (
    <span
      className="bh-bubble-delivery"
      role="status"
      aria-label={t('message.sending')}
      title={t('message.sending')}
    >
      …
    </span>
  ) : null;
}
