import { useContext, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Modal } from './modal.js';
import { createBridgeImageResource } from './bridge-image-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import { RemoteMessageHostContext } from './remote-message-host.js';

export function BridgeImage({
  channelId,
  sourceEventId,
  attachmentId,
  name,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  name: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const fetcher = useContext(RemoteMessageHostContext)?.fetch;
  const resource = useMemo(
    () => createBridgeImageResource(channelId, sourceEventId, attachmentId, fetcher),
    [channelId, sourceEventId, attachmentId, fetcher],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const [enlarged, setEnlarged] = useState<string>();
  const label = t('bridgeMedia.image');
  const failureKeys = {
    unavailable: 'bridgeMedia.unavailable',
    tooLarge: 'bridgeMedia.tooLarge',
    format: 'bridgeMedia.format',
    failed: 'bridgeMedia.failed',
  } as const;
  return (
    <div ref={resource.element} className="bh-bridge-image" data-media-id={attachmentId}>
      {state.url ? (
        <button
          type="button"
          className="bh-bridge-image-button"
          aria-label={t('bridgeMedia.enlarge')}
          aria-haspopup="dialog"
          onClick={() => setEnlarged(state.url)}
        >
          <img
            className="bh-message-image"
            src={state.url}
            alt={name === 'image' ? label : name}
            onError={resource.fail}
          />
        </button>
      ) : (
        <div className="bh-bridge-image-state" role="status">
          <span>{state.failure ? t(failureKeys[state.failure]) : t('bridgeMedia.loading')}</span>
          {state.failure ? (
            <button type="button" className="bh-memory-view-action" onClick={resource.retry}>
              {t('bridgeMedia.retry')}
            </button>
          ) : null}
        </div>
      )}
      {enlarged && enlarged === state.url ? (
        <Modal
          open
          title={label}
          closeLabel={t('common.close')}
          onClose={() => setEnlarged(undefined)}
          className="bh-bridge-image-modal"
        >
          <img
            className="bh-bridge-image-expanded"
            src={state.url}
            alt={name === 'image' ? label : name}
          />
        </Modal>
      ) : null}
    </div>
  );
}
