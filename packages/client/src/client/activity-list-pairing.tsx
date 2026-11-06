import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { useState, type ReactElement } from 'react';
import type {
  PairingCapability,
  PairingRequest,
  PairingReviewInput,
} from '../../../core/src/messaging/pairing.js';
import type { ExternalUserRole } from '../../../core/src/messaging/sender-access.js';
import type { BridgeActions } from './actions.js';
import { Combobox } from './combobox.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { HumanAttentionItem } from './store.js';

const capabilities = [
  ['approve', 'pairing.approveCapability'],
  ['reject', 'pairing.rejectCapability'],
  ['answer', 'pairing.answerCapability'],
  ['save-rules', 'pairing.rulesCapability'],
  ['review-pairing', 'pairing.reviewCapability'],
] as const;

export function ActivityListPairing({
  source,
  actions,
  t,
}: {
  source: HumanAttentionItem;
  actions: Pick<BridgeActions, 'messagingSnapshot' | 'pairingReview' | 'refreshActivityList'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [loaded, setLoaded] = useState<{ request?: PairingRequest; roles: ExternalUserRole[] }>();
  const [roleId, setRoleId] = useState('');
  const [selected, setSelected] = useState<PairingCapability[]>([]);
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
  const request = loaded?.request;
  const role = loaded?.roles.find((item) => item.id === roleId);
  const review = async (input: PairingReviewInput): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      await actions.pairingReview(source.botSlug, input);
      await actions.refreshActivityList();
    } catch {
      setError(true);
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  const base = request && { id: request.id, expectedRevision: request.revision };
  return (
    <div ref={mount} className="bh-activity-list-row-actions">
      {base && request?.status === 'pending' ? (
        <>
          {request.purpose === 'conversation' ? (
            <Combobox
              label={t('pairing.role')}
              toggleLabel={t('pairing.role')}
              value={roleId}
              fallbackValue=""
              disabled={busy}
              searchable={false}
              onSelect={setRoleId}
              options={[
                { value: '', label: t('pairing.selectRole') },
                ...(loaded?.roles ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          ) : (
            <div className="bh-activity-list-pairing-capabilities">
              {capabilities.map(([capability, label]) => (
                <Checkbox
                  key={capability}
                  label={t(label)}
                  checked={selected.includes(capability)}
                  disabled={busy}
                  onChange={(checked) =>
                    setSelected((value) =>
                      checked
                        ? [...value, capability]
                        : value.filter((item) => item !== capability),
                    )
                  }
                />
              ))}
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            type="button"
            disabled={busy || (request.purpose === 'conversation' ? !role : selected.length === 0)}
            onClick={() =>
              void review(
                request.purpose === 'conversation' && role
                  ? {
                      ...base,
                      kind: 'approve',
                      roleId: role.id,
                      expectedRoleRevision: role.revision,
                    }
                  : { ...base, kind: 'approve', capabilities: selected },
              )
            }
          >
            {t('activityList.accept')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => void review({ ...base, kind: 'reject' })}
          >
            {t('activityList.decline')}
          </Button>
        </>
      ) : loaded ? (
        <span role="status">{t('activityList.pairingUnavailable')}</span>
      ) : null}
      {error ? <span role="alert">{t('activityList.failed')}</span> : null}
    </div>
  );
}
