import { useState, type ReactElement } from 'react';
import type { PairingRequest, PairingReviewInput } from '../../../core/src/messaging/pairing.js';
import type { ExternalUserRole } from '../../../core/src/messaging/sender-access.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { PairingRow } from './pairing-settings.js';
import type { HumanAttentionItem } from './store.js';

export function HumanInboxPairing({
  source,
  actions,
  t,
}: {
  source: HumanAttentionItem;
  actions: Pick<BridgeActions, 'messagingSnapshot' | 'pairingReview' | 'refreshHumanInbox'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [loaded, setLoaded] = useState<{ request?: PairingRequest; roles: ExternalUserRole[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const load = async (): Promise<void> => {
    const snapshot = await actions.messagingSnapshot(source.botSlug);
    const request = snapshot.pairings?.find((item) => item.id === source.requestId);
    setLoaded({ ...(request ? { request } : {}), roles: snapshot.roles ?? [] });
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    load().catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [source.botSlug, source.requestId]);
  const review = async (input: PairingReviewInput): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      await actions.pairingReview(source.botSlug, input);
      await actions.refreshHumanInbox();
    } catch {
      setError(true);
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div ref={mount} className="bh-human-inbox-pairing">
      {loaded?.request?.status === 'pending' ? (
        <PairingRow
          request={loaded.request}
          roles={loaded.roles}
          selectGroup={() => undefined}
          busy={busy}
          review={review}
          t={t}
        />
      ) : loaded ? (
        <p role="status">{t('humanInbox.pairingUnavailable')}</p>
      ) : null}
      {error ? <p role="alert">{t('humanInbox.failed')}</p> : null}
    </div>
  );
}
